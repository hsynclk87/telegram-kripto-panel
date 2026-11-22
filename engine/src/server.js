import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { analyzeMarkets } from "./analysis.js";
import { detectWhaleTrade } from "./whales.js";
import { analyzeCandleMarket } from "./market-signals.js";
import { createStorage } from "./storage.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const WHALE_TRADE_USD = Math.max(1, Number(process.env.WHALE_TRADE_USD || 100000));
const SYMBOLS = (process.env.SYMBOLS || "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT")
  .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

const state = {
  startedAt: new Date().toISOString(),
  exchanges: {
    binanceSpot: { connected: false, lastMessageAt: null, reconnects: 0 },
    binanceFutures: { connected: false, lastMessageAt: null, reconnects: 0 },
    bybitLinear: { connected: false, lastMessageAt: null, reconnects: 0 }
  },
  markets: {},
  trades: [],
  liquidations: [],
  whales: []
};

for (const symbol of SYMBOLS) {
  state.markets[symbol] = {
    symbol, binanceSpot: {}, binanceFutures: {}, bybitLinear: {}, candles1m: [], updatedAt: null
  };
}

const clients = new Set();
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

function updateCandle(symbol, exchange, k) {
  const key = symbolFrom(symbol);
  if (!key || !state.markets[key]) return;
  const candle = {
    openTime: Number(k.t), closeTime: Number(k.T),
    open: Number(k.o), high: Number(k.h), low: Number(k.l),
    close: Number(k.c), volume: Number(k.v), quoteVolume: Number(k.q),
    closed: Boolean(k.x)
  };
  updateMarket(key, exchange, { candle1m: candle });
  if (!candle.closed) return;

  const history = state.markets[key].candles1m;
  const existing = history.findIndex((item) => item.openTime === candle.openTime);
  if (existing >= 0) history[existing] = candle;
  else history.push(candle);
  history.sort((a, b) => a.openTime - b.openTime);
  if (history.length > 200) history.splice(0, history.length - 200);
  publish("candle", { symbol: key, candle });
  void storage.saveCandle(key, candle).catch((error) => log("warn", "Candle persistence failed", { error: error.message }));
}

async function loadCandleHistory() {
  const results = await Promise.allSettled(SYMBOLS.map(async (symbol) => {
    const endpoint = "https://data-api.binance.vision/api/v3/klines?symbol="
      + encodeURIComponent(symbol) + "&interval=1m&limit=100";
    let history = [];
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Binance kline history HTTP " + response.status);
      const rows = await response.json();
      history = rows
      .filter((row) => Number(row[6]) < Date.now())
      .map((row) => ({
        openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
        low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
        closeTime: Number(row[6]), quoteVolume: Number(row[7]), closed: true
      }));
    } catch (error) {
      log("warn", "Binance REST history unavailable; checking database", { symbol, error: error.message });
      try {
        history = await storage.loadCandles(symbol, 100);
      } catch (storageError) {
        log("warn", "Database candle restore failed", { symbol, error: storageError.message });
        history = [];
      }
    }
    if (storage.enabled && history.length) {
      const writes = await Promise.allSettled(history.map((candle) => storage.saveCandle(symbol, candle)));
      const failures = writes.filter((item) => item.status === "rejected").length;
      if (failures) log("warn", "Some candle history rows were not persisted", { symbol, failures });
    }
    state.markets[symbol].candles1m = history.slice(-200);
    return { symbol, candles: history.length };
  }));
  for (const result of results) {
    if (result.status === "fulfilled") log("info", "Candle history loaded", result.value);
    else log("warn", "Candle history load failed", { error: result.reason?.message });
  }
}

function addTrade(trade) {
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
      log("info", name + " connected");
      if (onOpen) onOpen(socket);
      publish("connection", { exchange: name, connected: true });
    });

    socket.on("message", (buffer) => {
      state.exchanges[name].lastMessageAt = now();
      try {
        onMessage(JSON.parse(buffer.toString()));
      } catch (error) {
        log("warn", name + " message parse failed", { error: error.message });
      }
    });

    socket.on("error", (error) => {
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
    initialized: false, syncing: false, buffer: [], exchangeTime: null, receivedAt: null
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

  const resync = async () => {
    if (book.syncing) return;
    book.syncing = true;
    book.initialized = false;
    try {
      const path = exchange === "binanceSpot" ? "/api/v3/depth" : "/fapi/v1/depth";
      const response = await fetch(restBase + path + "?symbol=" + encodeURIComponent(symbol) + "&limit=1000", {
        signal: AbortSignal.timeout(10000), cache: "no-store"
      });
      if (!response.ok) throw new Error("Depth snapshot HTTP " + response.status);
      const snapshot = await response.json();
      book.bids = new Map((snapshot.bids || []).map(([p, q]) => [String(p), Number(q)]));
      book.asks = new Map((snapshot.asks || []).map(([p, q]) => [String(p), Number(q)]));
      book.lastUpdateId = Number(snapshot.lastUpdateId);
      const pending = book.buffer.splice(0).sort((a, b) => Number(a.U) - Number(b.U));
      const firstIndex = pending.findIndex((event) =>
        Number(event.U) <= book.lastUpdateId + 1 && Number(event.u) >= book.lastUpdateId + 1
      );
      if (firstIndex < 0 && pending.length) {
        book.buffer.push(...pending);
        book.syncing = false;
        return void resync();
      }
      const usable = firstIndex >= 0 ? pending.slice(firstIndex) : [];
      for (const event of usable) {
        if (Number(event.u) <= book.lastUpdateId) continue;
        if (exchange === "binanceFutures" && event.pu != null && Number(event.pu) !== book.lastUpdateId) {
          book.buffer.push(...usable.slice(usable.indexOf(event)));
          book.syncing = false;
          return void resync();
        }
        if (exchange === "binanceSpot" && Number(event.U) > book.lastUpdateId + 1) {
          book.buffer.push(...usable.slice(usable.indexOf(event)));
          book.syncing = false;
          return void resync();
        }
        applySide(book.bids, event.b);
        applySide(book.asks, event.a);
        book.lastUpdateId = Number(event.u);
        book.exchangeTime = Number(event.E || event.T || 0) || null;
        book.receivedAt = Date.now();
      }
      book.initialized = true;
      publishBinanceBook(exchange, symbol, book);
    } catch (error) {
      log("warn", "Binance order book snapshot failed", { exchange, symbol, error: error.message });
      setTimeout(resync, 1500).unref?.();
    } finally {
      book.syncing = false;
    }
  };

  const onDepth = (event) => {
    if (!book.initialized) {
      book.buffer.push(event);
      if (book.buffer.length > 5000) book.buffer.splice(0, book.buffer.length - 5000);
      return;
    }
    if (Number(event.u) <= book.lastUpdateId) return;
    const gap = exchange === "binanceFutures"
      ? event.pu != null && Number(event.pu) !== book.lastUpdateId
      : Number(event.U) > book.lastUpdateId + 1;
    if (gap) {
      book.buffer.push(event);
      void resync();
      return;
    }
    applySide(book.bids, event.b);
    applySide(book.asks, event.a);
    book.lastUpdateId = Number(event.u);
    book.exchangeTime = Number(event.E || event.T || 0) || null;
    book.receivedAt = Date.now();
    publishBinanceBook(exchange, symbol, book);
  };

  void resync();
  return onDepth;
}

function startBinanceSpot() {
  const streams = SYMBOLS.flatMap((s) => {
    const x = s.toLowerCase();
    return [x + "@trade", x + "@depth@100ms", x + "@kline_1m"];
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
        addTrade({
          exchange: "Binance Spot", symbol, price: Number(d.p),
          quantity: Number(d.q), quoteValue: Number(d.p) * Number(d.q),
          side: d.m ? "SELL" : "BUY", timestamp: d.T
        });
      } else if (d.e === "depthUpdate") {
        depthHandlers.binanceSpot.get(symbol)?.(d);
      } else if (d.e === "kline") {
        const k = d.k;
        updateCandle(symbol, "binanceSpot", k);
      }
    }
  );
}

function startBinanceFutures() {
  const streams = SYMBOLS.flatMap((s) => {
    const x = s.toLowerCase();
    return [x + "@aggTrade", x + "@depth@100ms", x + "@kline_1m", x + "@forceOrder"];
  }).join("/");
  for (const symbol of SYMBOLS) depthHandlers.binanceFutures.set(symbol, startBinanceBookSync("binanceFutures", symbol, "https://fapi.binance.com"));
  return connectSocket(
    "binanceFutures",
    "wss://fstream.binance.com/stream?streams=" + streams,
    (packet) => {
      const d = packet.data;
      if (!d) return;
      if (d.e === "aggTrade") {
        addTrade({
          exchange: "Binance Futures", symbol: symbolFrom(d.s),
          price: Number(d.p), quantity: Number(d.q),
          quoteValue: Number(d.p) * Number(d.q),
          side: d.m ? "SELL" : "BUY", timestamp: d.T, aggregate: true
        });
      } else if (d.e === "depthUpdate") {
        depthHandlers.binanceFutures.get(symbolFrom(d.s))?.(d);
      } else if (d.e === "kline") {
        const k = d.k;
        updateCandle(d.s, "binanceFutures", k);
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
            exchange: "Bybit Linear", symbol, price: Number(d.p),
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

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", "http://localhost");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      ok: true, service: "telegram-kripto-analysis-engine",
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: state.startedAt, storage: storage.enabled ? "postgresql" : "memory", exchanges: state.exchanges
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
