import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { analyzeMarkets } from "./analysis.js";
import { detectWhaleTrade } from "./whales.js";
import { analyzeCandleMarket } from "./market-signals.js";

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
}

async function loadCandleHistory() {
  const results = await Promise.allSettled(SYMBOLS.map(async (symbol) => {
    const endpoint = "https://fapi.binance.com/fapi/v1/klines?symbol="
      + encodeURIComponent(symbol) + "&interval=1m&limit=100";
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Binance kline history HTTP " + response.status);
    const rows = await response.json();
    const history = rows
      .filter((row) => Number(row[6]) < Date.now())
      .map((row) => ({
        openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
        low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
        closeTime: Number(row[6]), quoteVolume: Number(row[7]), closed: true
      }));
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
  const whale = detectWhaleTrade(trade, WHALE_TRADE_USD);
  if (whale) {
    state.whales.unshift(whale);
    if (state.whales.length > 500) state.whales.length = 500;
    publish("whale", whale);
  }
}

function addLiquidation(item) {
  state.liquidations.unshift(item);
  if (state.liquidations.length > 1000) state.liquidations.length = 1000;
  publish("liquidation", item);
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

function startBinanceSpot() {
  const streams = SYMBOLS.flatMap((s) => {
    const x = s.toLowerCase();
    return [x + "@trade", x + "@depth20@100ms", x + "@kline_1m"];
  }).join("/");
  return connectSocket(
    "binanceSpot",
    "wss://stream.binance.com:9443/stream?streams=" + streams,
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
      } else if (d.e === "depthUpdate" || (Array.isArray(d.b) && Array.isArray(d.a))) {
        updateMarket(symbol, "binanceSpot", {
          bids: (d.b || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)]),
          asks: (d.a || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)])
        });
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
    return [x + "@aggTrade", x + "@depth20@100ms", x + "@kline_1m", x + "@forceOrder"];
  }).join("/");
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
        updateMarket(d.s, "binanceFutures", {
          bids: (d.b || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)]),
          asks: (d.a || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)])
        });
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
          updateMarket(symbol, "bybitLinear", {
            bids: (d.b || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)]),
            asks: (d.a || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)])
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
      startedAt: state.startedAt, exchanges: state.exchanges
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
  void loadCandleHistory();
  upstreamStops.push(startBinanceSpot(), startBinanceFutures(), startBybit());
});

function shutdown(signal) {
  log("info", signal + " received; shutting down");
  clearInterval(analysisTimer);
  for (const stop of upstreamStops) stop();
  for (const client of wss.clients) client.close();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
