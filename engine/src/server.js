import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { analyzeMarkets } from "./analysis.js";
import { detectWhaleTrade } from "./whales.js";
import { analyzeCandleMarket } from "./market-signals.js";
import { createStorage } from "./storage.js";
import { createTradeDeduplicator, isFirstFuturesDepthEventValid } from "./market-data.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const WHALE_TRADE_USD = Math.max(1, Number(process.env.WHALE_TRADE_USD || 100000));
const SYMBOLS = (process.env.SYMBOLS || "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT")
  .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

const state = {
  startedAt: new Date().toISOString(),
  exchanges: {
    binanceSpot: { connected: false, lastMessageAt: null, lastDataAt: null, lastMessageType: null, messageCounts: {}, lastError: null, reconnects: 0 },
    binanceFutures: { connected: false, lastMessageAt: null, lastDataAt: null, lastMessageType: null, messageCounts: {}, lastError: null, reconnects: 0 },
    bybitLinear: { connected: false, lastMessageAt: null, lastDataAt: null, lastMessageType: null, messageCounts: {}, lastError: null, reconnects: 0 }
  },
  markets: {},
  trades: [],
  liquidations: [],
  whales: []
};

for (const symbol of SYMBOLS) {
  state.markets[symbol] = {
    symbol, binanceSpot: {}, binanceFutures: {}, bybitLinear: {}, candles1m: [], candles15m: [], candles1h: [], candles4h: [], updatedAt: null
  };
}

const clients = new Set();
const isDuplicateTrade = createTradeDeduplicator(20000);
const upstreamStops = [];
let storage = {
  enabled: false,
  async saveEvent() {},
  async saveCandle() {},
  async loadCandles() { return []; },
  async close() {}
};
const now = () => new Date().toISOString();
const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function log(level, message, extra = {}) {
  console.log(JSON.stringify({ time: now(), level, message, ...extra }));
}

function publish(type, payload) {
  const message = JSON.stringify({ type, time: now(), data: payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function symbolFrom(raw) {
  if (!raw) return null;
  const value = String(raw).toUpperCase();
  return value.endsWith("USDT") ? value : value + "USDT";
}

function updateMarket(symbol, exchange, patch) {
  const key = symbolFrom(symbol);
  if (!key || !state.markets[key]) return;
  state.markets[key][exchange] = { ...state.markets[key][exchange], ...patch };
  state.markets[key].updatedAt = now();
  publish("market", { symbol: key, exchange, ...state.markets[key][exchange] });
}

function updateCandle(symbol, exchange, k, interval = "1m") {
  const key = symbolFrom(symbol);
  if (!key || !state.markets[key]) return;
  const candle = {
    interval, openTime: Number(k.t), closeTime: Number(k.T),
    open: Number(k.o), high: Number(k.h), low: Number(k.l),
    close: Number(k.c), volume: Number(k.v), quoteVolume: Number(k.q),
    closed: Boolean(k.x)
  };
  const currentKey = interval === "1m" ? "candle1m" : "candle" + interval;
  updateMarket(key, exchange, { [currentKey]: candle });
  if (!candle.closed) return;
  const historyKey = interval === "1m" ? "candles1m" : "candles" + interval;
  const history = state.markets[key][historyKey] || (state.markets[key][historyKey] = []);
  const existing = history.findIndex((item) => item.openTime === candle.openTime);
  if (existing >= 0) history[existing] = candle;
  else history.push(candle);
  history.sort((a, b) => a.openTime - b.openTime);
  const cap = interval === "1m" ? 2000 : 500;
  if (history.length > cap) history.splice(0, history.length - cap);
  publish("candle", { symbol: key, candle });
  if (interval === "1m") void storage.saveCandle(key, candle).catch((error) => log("warn", "Candle persistence failed", { error: error.message }));
}

async function fetchKlineHistory(symbol, interval, limit) {
  const binanceHosts = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api4.binance.com"
  ];
  const query = "/api/v3/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + encodeURIComponent(interval) + "&limit=" + limit;
  let lastError;
  for (const host of binanceHosts) {
    try {
      const response = await fetch(host + query, { signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!response.ok) throw new Error("Binance HTTP " + response.status + " " + host);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length < 30) throw new Error("Binance returned insufficient candles: " + (rows?.length || 0));
      const candles = rows.filter(row => Number(row[6]) < Date.now()).map(row => ({
        interval, openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
        close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]), quoteVolume: Number(row[7]), closed: true,
        source: "BINANCE"
      }));
      if (candles.length >= 30) return candles;
    } catch (error) { lastError = error; }
  }

  // Binance erişilemiyorsa aynı spot mum geçmişini Bybit public market API'den al.
  try {
    const bybitInterval = ({ "15m": "15", "1h": "60", "4h": "240" })[interval];
    const url = "https://api.bybit.com/v5/market/kline?category=spot&symbol=" +
      encodeURIComponent(symbol) + "&interval=" + bybitInterval + "&limit=" + Math.min(limit, 1000);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok) throw new Error("Bybit HTTP " + response.status);
    const body = await response.json();
    if (body.retCode !== 0 || !Array.isArray(body.result?.list)) {
      throw new Error("Bybit kline error: " + (body.retMsg || "invalid response"));
    }
    const duration = ({ "15m": 900000, "1h": 3600000, "4h": 14400000 })[interval];
    const candles = body.result.list.map(row => ({
      interval, openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
      close: Number(row[4]), volume: Number(row[5]), quoteVolume: Number(row[6]),
      closeTime: Number(row[0]) + duration - 1, closed: Number(row[0]) + duration <= Date.now(),
      source: "BYBIT"
    })).filter(c => c.closed && [c.openTime,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite))
      .sort((a,b) => a.openTime - b.openTime);
    if (candles.length < 30) throw new Error("Bybit returned insufficient closed candles: " + candles.length);
    return candles;
  } catch (error) {
    lastError = error;
  }
  throw lastError || new Error("All historical candle sources failed");
}

async function loadCandleHistory() {
  const intervals = ["15m", "1h", "4h"];
  const results = await Promise.allSettled(SYMBOLS.map(async symbol => {
    const loaded = await Promise.all(intervals.map(async interval => {
      try { return [interval, await fetchKlineHistory(symbol, interval, 300), null]; }
      catch (error) {
        log("warn", "Historical candle source failed", { symbol, interval, error: error.message });
        return [interval, [], error.message];
      }
    }));
    for (const [interval, candles] of loaded) {
      if (!candles.length) continue;
      const key = "candles" + interval, live = state.markets[symbol][key] || [];
      const merged = new Map(candles.map(c => [c.openTime, c]));
      for (const candle of live) merged.set(candle.openTime, candle);
      state.markets[symbol][key] = [...merged.values()].sort((a,b)=>a.openTime-b.openTime).slice(-500);
    }
    const counts = Object.fromEntries(intervals.map(i => [i, state.markets[symbol]["candles" + i]?.length || 0]));
    log("info", "Historical market data status", {
      symbol, counts, sources: Object.fromEntries(loaded.map(([i, rows]) => [i, rows[0]?.source || "LIVE_ONLY"])),
      errors: Object.fromEntries(loaded.filter(([,rows,error]) => error).map(([i,,error]) => [i,error]))
    });
    publish("history", { symbol, counts });
    return { symbol, counts };
  }));
  for (const result of results) {
    if (result.status === "rejected") log("warn", "Historical market data load failed", { error: result.reason?.message });
  }
}

function addTrade(trade) {
  if (isDuplicateTrade(trade)) return;
  state.trades.unshift(trade);
  if (state.trades.length > 3000) state.trades.length = 3000;
  publish("trade", trade);
  void storage.saveEvent("trade", trade).catch((error) => log("warn", "Trade persistence failed", { error: error.message }));
  const whale = detectWhaleTrade(trade, WHALE_TRADE_USD);
  if (whale) {
    state.whales.unshift(whale);
    if (state.whales.length > 500) state.whales.length = 500;
    publish("whale", whale);
    void storage.saveEvent("whale", whale).catch((error) => log("warn", "Whale persistence failed", { error: error.message }));
  }
}

function addLiquidation(item) {
  state.liquidations.unshift(item);
  if (state.liquidations.length > 1000) state.liquidations.length = 1000;
  publish("liquidation", item);
  void storage.saveEvent("liquidation", item).catch((error) => log("warn", "Liquidation persistence failed", { error: error.message }));
}

function getMarketSignals() {
  return SYMBOLS.map((symbol) => {
    const market = state.markets[symbol];
    const current = market?.binanceFutures?.candle1m || market?.binanceSpot?.candle1m;
    return { symbol, ...analyzeCandleMarket(market?.candles1m || [], current) };
  });
}

function getAnalysis() {
  return analyzeMarkets({
    symbols: SYMBOLS,
    markets: state.markets,
    trades: state.trades,
    liquidations: state.liquidations
  });
}

function connectSocket(name, url, onMessage, onOpen) {
  let socket;
  let retry = 1000;
  let stopped = false;
  let reconnectTimer;

  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(url);

    socket.on("open", () => {
      retry = 1000;
      state.exchanges[name].connected = true;
      state.exchanges[name].lastError = null;
      log("info", name + " connected");
      if (onOpen) onOpen(socket);
      publish("connection", { exchange: name, connected: true });
    });

    socket.on("message", (buffer) => {
      const exchangeState = state.exchanges[name];
      exchangeState.lastMessageAt = now();
      try {
        const packet = JSON.parse(buffer.toString());
        const event = packet?.data?.e || packet?.e || packet?.topic || packet?.op || "unknown";
        exchangeState.lastMessageType = String(event);
        exchangeState.messageCounts[event] = (exchangeState.messageCounts[event] || 0) + 1;
        if (packet?.data?.e || packet?.e || packet?.topic?.startsWith("tickers.") || packet?.topic?.startsWith("publicTrade.") || packet?.topic?.startsWith("orderbook.") || packet?.topic?.startsWith("allLiquidation.")) {
          exchangeState.lastDataAt = now();
        }
        onMessage(packet);
      } catch (error) {
        exchangeState.lastError = error.message;
        log("warn", name + " message parse failed", { error: error.message });
      }
    });

    socket.on("error", (error) => {
      state.exchanges[name].lastError = error.message;
      log("warn", name + " websocket error", { error: error.message });
    });

    socket.on("close", () => {
      if (stopped) return;
      state.exchanges[name].connected = false;
      state.exchanges[name].reconnects += 1;
      publish("connection", { exchange: name, connected: false });
      const delay = retry;
      retry = Math.min(retry * 2, 30000);
      log("warn", name + " disconnected; reconnect scheduled", { delayMs: delay });
      reconnectTimer = setTimeout(connect, delay);
    });
  };

  connect();
  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  };
}



const binanceBooks = { binanceSpot: new Map(), binanceFutures: new Map() };
const depthHandlers = { binanceSpot: new Map(), binanceFutures: new Map() };

function publishBinanceBook(exchange, symbol, book) {
  const bids = [...book.bids.entries()].map(([price, qty]) => [Number(price), qty])
    .sort((a, b) => b[0] - a[0]).slice(0, 50);
  const asks = [...book.asks.entries()].map(([price, qty]) => [Number(price), qty])
    .sort((a, b) => a[0] - b[0]).slice(0, 50);
  updateMarket(symbol, exchange, {
    bids, asks, orderbookUpdateId: book.lastUpdateId,
    orderbookExchangeTime: book.exchangeTime || null,
    orderbookReceivedAt: book.receivedAt || Date.now(),
    orderbookSynced: true
  });
}

function startBinanceBookSync(exchange, symbol, restBase) {
  const book = {
    bids: new Map(), asks: new Map(), lastUpdateId: 0,
    initialized: false, hasAppliedEvent: false, syncing: false, buffer: [],
    exchangeTime: null, receivedAt: null, resyncAgain: false
  };
  binanceBooks[exchange].set(symbol, book);

  const applySide = (side, updates) => {
    for (const [rawPrice, rawQty] of updates || []) {
      const price = String(rawPrice), qty = Number(rawQty);
      if (!Number.isFinite(Number(price)) || !Number.isFinite(qty)) continue;
      if (qty === 0) side.delete(price);
      else side.set(price, qty);
    }
  };

  const requestSnapshot = async () => {
    if (book.syncing) { book.resyncAgain = true; return; }
    book.syncing = true;
    book.initialized = false;
    book.hasAppliedEvent = false;
    try {
      const path = exchange === "binanceSpot" ? "/api/v3/depth" : "/fapi/v1/depth";
      const query = "?symbol=" + encodeURIComponent(symbol) + "&limit=1000";
      let snapshot;
      if (exchange === "binanceFutures") {
        snapshot = await fetchBinanceJson(path + query, 10000);
      } else {
        const response = await fetch(restBase + path + query, {
          signal: AbortSignal.timeout(10000), cache: "no-store"
        });
        if (!response.ok) throw new Error("Depth snapshot HTTP " + response.status);
        snapshot = await response.json();
      }
      book.bids = new Map((snapshot.bids || []).map(([p, q]) => [String(p), Number(q)]));
      book.asks = new Map((snapshot.asks || []).map(([p, q]) => [String(p), Number(q)]));
      book.lastUpdateId = Number(snapshot.lastUpdateId);
      const pending = book.buffer.splice(0).sort((a, b) => Number(a.U) - Number(b.U));
      const firstIndex = pending.findIndex((event) => exchange === "binanceSpot"
        ? Number(event.U) <= book.lastUpdateId + 1 && Number(event.u) >= book.lastUpdateId + 1
        : isFirstFuturesDepthEventValid(event, book.lastUpdateId));
      if (pending.length && firstIndex < 0) {
        book.buffer.push(...pending);
        book.resyncAgain = true;
      } else {
        const usable = firstIndex >= 0 ? pending.slice(firstIndex) : [];
        let valid = true;
        for (let i = 0; i < usable.length; i++) {
          const event = usable[i];
          if (Number(event.u) <= book.lastUpdateId) continue;
          if (exchange === "binanceFutures") {
            if (i > 0 && Number(event.pu) !== book.lastUpdateId) { valid = false; break; }
            if (i === 0 && !isFirstFuturesDepthEventValid(event, book.lastUpdateId)) { valid = false; break; }
          } else if (Number(event.U) > book.lastUpdateId + 1) {
            valid = false; break;
          }
          applySide(book.bids, event.b);
          applySide(book.asks, event.a);
          book.lastUpdateId = Number(event.u);
          book.exchangeTime = Number(event.E || event.T || 0) || null;
          book.receivedAt = Date.now();
        }
        if (!valid) {
          book.buffer.push(...usable);
          book.resyncAgain = true;
        } else {
          book.initialized = true;
          book.hasAppliedEvent = usable.length > 0;
          publishBinanceBook(exchange, symbol, book);
        }
      }
    } catch (error) {
      log("warn", "Binance order book snapshot failed", { exchange, symbol, error: error.message });
      book.resyncAgain = true;
    } finally {
      book.syncing = false;
      if (book.resyncAgain) {
        book.resyncAgain = false;
        setTimeout(requestSnapshot, 1000).unref?.();
      }
    }
  };

  const onDepth = (event) => {
    if (!book.initialized) {
      book.buffer.push(event);
      if (book.buffer.length > 5000) book.buffer.splice(0, book.buffer.length - 5000);
      return;
    }
    if (Number(event.u) <= book.lastUpdateId) return;
    let gap = false;
    if (exchange === "binanceFutures") {
      // The first USD-M event bridges the REST snapshot; pu is checked only afterwards.
      gap = book.hasAppliedEvent
        ? Number(event.pu) !== book.lastUpdateId
        : !isFirstFuturesDepthEventValid(event, book.lastUpdateId);
    } else {
      gap = Number(event.U) > book.lastUpdateId + 1;
    }
    if (gap) {
      book.buffer.push(event);
      void requestSnapshot();
      return;
    }
    applySide(book.bids, event.b);
    applySide(book.asks, event.a);
    book.lastUpdateId = Number(event.u);
    book.hasAppliedEvent = true;
    book.exchangeTime = Number(event.E || event.T || 0) || null;
    book.receivedAt = Date.now();
    publishBinanceBook(exchange, symbol, book);
  };

  void requestSnapshot();
  return onDepth;
}

function startBinanceSpot() {
  const streams = SYMBOLS.flatMap((s) => {
    const x = s.toLowerCase();
    return [x + "@trade", x + "@depth@100ms", x + "@kline_1m", x + "@kline_15m", x + "@kline_1h", x + "@kline_4h"];
  }).join("/");
  for (const symbol of SYMBOLS) depthHandlers.binanceSpot.set(symbol, startBinanceBookSync("binanceSpot", symbol, "https://data-api.binance.vision"));
  return connectSocket(
    "binanceSpot",
    "wss://data-stream.binance.vision/stream?streams=" + streams,
    (packet) => {
      const d = packet.data;
      if (!d) return;
      const symbol = symbolFrom(d.s);
      if (d.e === "trade") {
        updateMarket(symbol, "binanceSpot", { lastPrice: Number(d.p), priceTimestamp: Number(d.T) });
        addTrade({
          exchange: "Binance Spot", id: "spot:" + d.t, symbol, price: Number(d.p),
          quantity: Number(d.q), quoteValue: Number(d.p) * Number(d.q),
          side: d.m ? "SELL" : "BUY", timestamp: d.T
        });
      } else if (d.e === "depthUpdate") {
        depthHandlers.binanceSpot.get(symbol)?.(d);
      } else if (d.e === "kline") {
        const k = d.k;
        updateCandle(symbol, "binanceSpot", k, k.i || "1m");
      }
    }
  );
}

async function fetchBinanceJson(path, timeoutMs = 12000) {
  const hosts = ["https://fapi.binance.com", "https://fapi1.binance.com", "https://fapi2.binance.com", "https://fapi3.binance.com"];
  let lastError;
  for (const host of hosts) {
    try {
      const response = await fetch(host + path, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status + " from " + host);
      return await response.json();
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("All Binance Futures REST endpoints failed");
}

async function bootstrapBinanceFutures() {
  const results = await Promise.allSettled(SYMBOLS.map(async (symbol) => {
    const query = "?symbol=" + encodeURIComponent(symbol);
    const [ticker, premium, rows] = await Promise.all([
      fetchBinanceJson("/fapi/v1/ticker/price" + query),
      fetchBinanceJson("/fapi/v1/premiumIndex" + query),
      fetchBinanceJson("/fapi/v1/klines" + query + "&interval=1m&limit=100")
    ]);
    const currentRow = rows[rows.length - 1];
    const patch = {
      lastPrice: toNumber(ticker.price), markPrice: toNumber(premium.markPrice),
      indexPrice: toNumber(premium.indexPrice), fundingRate: toNumber(premium.lastFundingRate),
      restSnapshotAt: now(), restStatus: "READY", restError: null
    };
    if (currentRow) patch.candle1m = {
      openTime: Number(currentRow[0]), open: Number(currentRow[1]), high: Number(currentRow[2]),
      low: Number(currentRow[3]), close: Number(currentRow[4]), volume: Number(currentRow[5]),
      closeTime: Number(currentRow[6]), quoteVolume: Number(currentRow[7]),
      closed: Number(currentRow[6]) < Date.now()
    };
    updateMarket(symbol, "binanceFutures", patch);
    return { symbol, candles: rows.length, price: patch.lastPrice };
  }));
  for (let i = 0; i < results.length; i++) {
    const result = results[i], symbol = SYMBOLS[i];
    if (result.status === "fulfilled") log("info", "Binance Futures REST bootstrap loaded", result.value);
    else {
      const error = result.reason?.message || "Unknown REST bootstrap error";
      updateMarket(symbol, "binanceFutures", { restStatus: "ERROR", restError: error, restAttemptAt: now() });
      log("warn", "Binance Futures REST bootstrap failed", { symbol, error });
    }
  }
}

function startBinanceFutures() {
  const streams = SYMBOLS.flatMap((s) => {
    const x = s.toLowerCase();
    return [x + "@aggTrade", x + "@depth@100ms", x + "@kline_1m", x + "@kline_15m", x + "@kline_1h", x + "@kline_4h", x + "@forceOrder"];
  }).join("/");
  for (const symbol of SYMBOLS) depthHandlers.binanceFutures.set(symbol, startBinanceBookSync("binanceFutures", symbol, "https://fapi.binance.com"));
  void bootstrapBinanceFutures();
  return connectSocket(
    "binanceFutures",
    "wss://fstream.binance.com/stream?streams=" + streams,
    (packet) => {
      const d = packet?.data ?? packet;
      if (!d || typeof d !== "object") return;
      if (d.e === "aggTrade") {
        updateMarket(d.s, "binanceFutures", { lastPrice: Number(d.p), priceTimestamp: Number(d.T) });
        addTrade({
          exchange: "Binance Futures", id: "futures:" + d.a, symbol: symbolFrom(d.s),
          price: Number(d.p), quantity: Number(d.q),
          quoteValue: Number(d.p) * Number(d.q),
          side: d.m ? "SELL" : "BUY", timestamp: d.T, aggregate: true
        });
      } else if (d.e === "depthUpdate") {
        depthHandlers.binanceFutures.get(symbolFrom(d.s))?.(d);
      } else if (d.e === "kline") {
        const k = d.k;
        updateCandle(d.s, "binanceFutures", k, k.i || "1m");
      } else if (d.e === "forceOrder" && d.o) {
        const o = d.o;
        addLiquidation({
          exchange: "Binance Futures", symbol: symbolFrom(o.s),
          side: o.S, price: Number(o.ap || o.p),
          quantity: Number(o.z), quoteValue: Number(o.ap || o.p) * Number(o.z),
          timestamp: o.T
        });
      }
    }
  );
}

function startBybit() {
  return connectSocket(
    "bybitLinear",
    "wss://stream.bybit.com/v5/public/linear",
    (packet) => {
      if (!packet.topic || packet.data == null) return;
      const rows = Array.isArray(packet.data) ? packet.data : [packet.data];
      const topic = packet.topic;

      for (const d of rows) {
        const symbol = symbolFrom(d.s || d.symbol || topic.split(".").at(-1));
        if (topic.startsWith("tickers.")) {
          const patch = {};
          for (const [key, value] of Object.entries({
            lastPrice: d.lastPrice, markPrice: d.markPrice, indexPrice: d.indexPrice,
            fundingRate: d.fundingRate, openInterest: d.openInterest,
            openInterestValue: d.openInterestValue, price24hPcnt: d.price24hPcnt,
            turnover24h: d.turnover24h
          })) {
            if (value !== undefined && value !== "") patch[key] = toNumber(value);
          }
          updateMarket(symbol, "bybitLinear", patch);
        } else if (topic.startsWith("publicTrade.")) {
          addTrade({
            exchange: "Bybit Linear", id: d.i ? "bybit:" + d.i : undefined, symbol, price: Number(d.p),
            quantity: Number(d.v), quoteValue: Number(d.p) * Number(d.v),
            side: d.S === "Buy" ? "BUY" : "SELL", timestamp: Number(d.T)
          });
        } else if (topic.startsWith("orderbook.")) {
          const book = state.markets[symbol]?.bybitLinear || {};
          const bids = packet.type === "snapshot" ? [] : (book.bids || []).map(([p, q]) => [p, q]);
          const asks = packet.type === "snapshot" ? [] : (book.asks || []).map(([p, q]) => [p, q]);
          const mergeSide = (levels, updates, descending) => {
            const map = new Map(levels.map(([price, qty]) => [String(price), Number(qty)]));
            for (const [rawPrice, rawQty] of (updates || [])) {
              const price = Number(rawPrice), qty = Number(rawQty);
              if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
              if (qty === 0) map.delete(String(price));
              else map.set(String(price), qty);
            }
            return [...map.entries()].map(([price, qty]) => [Number(price), qty])
              .sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]).slice(0, 50);
          };
          updateMarket(symbol, "bybitLinear", {
            bids: mergeSide(bids, d.b, true),
            asks: mergeSide(asks, d.a, false),
            orderbookUpdatedAt: now()
          });
        } else if (topic.startsWith("allLiquidation.")) {
          addLiquidation({
            exchange: "Bybit Linear", symbol, side: d.S,
            price: Number(d.p), quantity: Number(d.v),
            quoteValue: Number(d.p) * Number(d.v), timestamp: Number(d.T)
          });
        }
      }
    },
    (socket) => {
      socket.send(JSON.stringify({
        op: "subscribe",
        args: SYMBOLS.flatMap((s) => [
          "tickers." + s, "publicTrade." + s,
          "orderbook.50." + s, "allLiquidation." + s
        ])
      }));
      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: "ping" }));
        else clearInterval(heartbeat);
      }, 20000);
      socket.once("close", () => clearInterval(heartbeat));
    }
  );
}

const smartMoneyCache = new Map();

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", "http://localhost");

  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  // Serve the Telegram Mini App from the same Render service as the data API.
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/engine/")) {
    try {
      const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(PUBLIC_DIR, "." + requestedPath);
      if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const body = await readFile(filePath);
      const extension = filePath.split(".").pop().toLowerCase();
      const mime = {
        html: "text/html; charset=utf-8",
        js: "text/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        json: "application/json; charset=utf-8",
        svg: "image/svg+xml"
      }[extension] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
      return res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Mini App asset not found");
    }
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      ok: true, service: "telegram-kripto-analysis-engine",
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: state.startedAt, storage: storage.enabled ? "postgresql" : "memory",
      exchanges: state.exchanges,
      dataStatus: Object.fromEntries(Object.entries(state.exchanges).map(([name, item]) => [name, {
        connected: item.connected, lastMessageAt: item.lastMessageAt, lastDataAt: item.lastDataAt,
        lastMessageType: item.lastMessageType, messageCounts: item.messageCounts,
        lastError: item.lastError, reconnects: item.reconnects
      }]))
    }));
  }

  if (url.pathname === "/api/v1/snapshot") {
    const requested = url.searchParams.get("symbol");
    const key = requested ? symbolFrom(requested) : null;
    const markets = key ? (state.markets[key] ? [state.markets[key]] : []) : Object.values(state.markets);
    res.writeHead(200);
    return res.end(JSON.stringify({
      time: now(), symbols: SYMBOLS, markets,
      analysis: getAnalysis().filter((item) => !key || item.symbol === key),
      marketSignals: getMarketSignals().filter((item) => !key || item.symbol === key),
      latestTrades: state.trades.slice(0, 50),
      latestLiquidations: state.liquidations.slice(0, 50),
      exchanges: state.exchanges
    }));
  }

  if (url.pathname === "/api/v1/market-signals") {
    const requested = url.searchParams.get("symbol");
    const key = requested ? symbolFrom(requested) : null;
    res.writeHead(200);
    return res.end(JSON.stringify(getMarketSignals().filter((item) => !key || item.symbol === key)));
  }

  if (url.pathname === "/api/v1/analysis") {
    const requested = url.searchParams.get("symbol");
    const key = requested ? symbolFrom(requested) : null;
    res.writeHead(200);
    return res.end(JSON.stringify(getAnalysis().filter((item) => !key || item.symbol === key)));
  }

  if (url.pathname === "/api/v1/trades") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 300);
    res.writeHead(200);
    return res.end(JSON.stringify(state.trades.slice(0, limit)));
  }

  if (url.pathname === "/api/v1/whales") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
    res.writeHead(200);
    return res.end(JSON.stringify(state.whales.slice(0, limit)));
  }

  if (url.pathname === "/api/v1/liquidations") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
    res.writeHead(200);
    return res.end(JSON.stringify(state.liquidations.slice(0, limit)));
  }

  if (url.pathname === "/api/v1/smartmoney/liquidations/heatmap" || url.pathname === "/api/v1/smartmoney/liquidations/symbols") {
    const isSymbols = url.pathname.endsWith("/symbols");
    const symbol = (url.searchParams.get("symbol") || "BTC").trim().toUpperCase();
    const windowMinutes = Number(url.searchParams.get("window_minutes") || 240);
    const priceBuckets = Number(url.searchParams.get("price_buckets") || 50);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 500), 1), 2000);
    if (!isSymbols && (!/^[A-Z0-9]{2,20}$/.test(symbol) || !Number.isInteger(windowMinutes) || windowMinutes < 5 || windowMinutes > 1440 || !Number.isInteger(priceBuckets) || priceBuckets < 5 || priceBuckets > 100)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "invalid_parameters", message: "symbol, window_minutes veya price_buckets değeri geçersiz." }));
    }
    const cacheKey = isSymbols ? "symbols:" + limit : ["heatmap", symbol, windowMinutes, priceBuckets].join(":");
    const hit = smartMoneyCache.get(cacheKey);
    const ttl = isSymbols ? 300000 : 30000;
    if (hit && Date.now() - hit.at < ttl) {
      res.writeHead(200);
      return res.end(JSON.stringify({ payload: hit.payload, cached: true, upstreamStatus: 200 }));
    }
    const params = new URLSearchParams(isSymbols ? { limit: String(limit) } : {
      symbol, window_minutes: String(windowMinutes), price_buckets: String(priceBuckets)
    });
    const path = isSymbols ? "/v1/liquidations/symbols" : "/v1/liquidations/heatmap";
    try {
      const upstream = await fetch("https://api.smartmoneyapi.com" + path + "?" + params, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(18000)
      });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok || body.error || body.ok === false) {
        const status = upstream.status || 502;
        res.writeHead(status >= 400 ? status : 502);
        return res.end(JSON.stringify({
          error: "smartmoney_upstream_error",
          upstreamStatus: upstream.status,
          message: body.message || body.msg || body.error || "SmartMoneyAPI likidasyon isteği başarısız."
        }));
      }
      smartMoneyCache.set(cacheKey, { at: Date.now(), payload: body });
      if (smartMoneyCache.size > 120) smartMoneyCache.delete(smartMoneyCache.keys().next().value);
      res.writeHead(200);
      return res.end(JSON.stringify({ payload: body, cached: false, upstreamStatus: upstream.status }));
    } catch (error) {
      res.writeHead(502);
      return res.end(JSON.stringify({
        error: "smartmoney_unavailable",
        message: error.name === "TimeoutError" ? "SmartMoneyAPI zaman aşımı." : error.message
      }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ server, path: "/stream" });
wss.on("connection", (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({
    type: "snapshot", time: now(),
    data: { markets: state.markets, exchanges: state.exchanges, analysis: getAnalysis(), marketSignals: getMarketSignals(), latestWhales: state.whales.slice(0, 50) }
  }));
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

const analysisTimer = setInterval(() => {
  publish("analysis", getAnalysis());
  publish("marketSignals", getMarketSignals());
}, 5000);

server.listen(PORT, HOST, () => {
  log("info", "Analysis engine API listening", { host: HOST, port: PORT, symbols: SYMBOLS });
  void (async () => {
    try {
      storage = await createStorage();
      log("info", "Storage initialized", { mode: storage.enabled ? "postgresql" : "memory" });
    } catch (error) {
      log("error", "PostgreSQL initialization failed; continuing in memory", { error: error.message });
    }
    await loadCandleHistory();
  })();
  upstreamStops.push(startBinanceSpot(), startBinanceFutures(), startBybit());
  // Başlangıç yüklemesi başarısız/eksik kalan sembolleri otomatik tamamla.
  const historyRetry = setInterval(() => {
    const incomplete = SYMBOLS.some(symbol => ["15m","1h","4h"].some(i => (state.markets[symbol]?.["candles"+i]?.length || 0) < 100));
    if (incomplete) void loadCandleHistory();
  }, 60000);
  upstreamStops.push(() => clearInterval(historyRetry));
});

function shutdown(signal) {
  log("info", signal + " received; shutting down");
  clearInterval(analysisTimer);
  for (const stop of upstreamStops) stop();
  void storage.close().catch((error) => log("warn", "Storage close failed", { error: error.message }));
  for (const client of wss.clients) client.close();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
