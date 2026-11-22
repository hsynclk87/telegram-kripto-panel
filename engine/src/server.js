import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
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
  events: []
};

for (const symbol of SYMBOLS) {
  state.markets[symbol] = {
    symbol,
    binanceSpot: {},
    binanceFutures: {},
    bybitLinear: {},
    updatedAt: null
  };
}

const clients = new Set();
const now = () => new Date().toISOString();

function log(level, message, extra = {}) {
  const row = { time: now(), level, message, ...extra };
  console.log(JSON.stringify(row));
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

function addTrade(trade) {
  state.trades.unshift(trade);
  if (state.trades.length > 300) state.trades.length = 300;
  publish("trade", trade);
}

function addLiquidation(item) {
  state.liquidations.unshift(item);
  if (state.liquidations.length > 200) state.liquidations.length = 200;
  publish("liquidation", item);
}

function connectSocket(name, url, onMessage, onOpen) {
  let socket;
  let retry = 1000;
  let stopped = false;

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
      state.exchanges[name].connected = false;
      state.exchanges[name].reconnects += 1;
      publish("connection", { exchange: name, connected: false });
      const delay = retry;
      retry = Math.min(retry * 2, 30000);
      log("warn", name + " disconnected; reconnect scheduled", { delayMs: delay });
      setTimeout(connect, delay);
    });
  };

  connect();
  return () => {
    stopped = true;
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
      } else if (d.e === "depthUpdate") {
        updateMarket(symbol, "binanceSpot", {
          bids: (d.b || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)]),
          asks: (d.a || []).slice(0, 20).map(([p, q]) => [Number(p), Number(q)])
        });
      } else if (d.e === "kline") {
        const k = d.k;
        updateMarket(symbol, "binanceSpot", {
          candle1m: {
            openTime: k.t, open: Number(k.o), high: Number(k.h),
            low: Number(k.l), close: Number(k.c), volume: Number(k.v),
            quoteVolume: Number(k.q), closed: Boolean(k.x)
          }
        });
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
        updateMarket(d.s, "binanceFutures", {
          candle1m: {
            openTime: k.t, open: Number(k.o), high: Number(k.h),
            low: Number(k.l), close: Number(k.c), volume: Number(k.v),
            quoteVolume: Number(k.q), closed: Boolean(k.x)
          }
        });
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
  const socketUrl = "wss://stream.bybit.com/v5/public/linear";
  return connectSocket(
    "bybitLinear",
    socketUrl,
    (packet) => {
      if (!packet.topic || !Array.isArray(packet.data)) return;
      const topic = packet.topic;
      for (const d of packet.data) {
        const symbol = symbolFrom(d.s || d.symbol || topic.split(".").at(-1));
        if (topic.startsWith("tickers.")) {
          updateMarket(symbol, "bybitLinear", {
            lastPrice: Number(d.lastPrice),
            markPrice: Number(d.markPrice),
            indexPrice: Number(d.indexPrice),
            fundingRate: Number(d.fundingRate),
            openInterest: Number(d.openInterest),
            openInterestValue: Number(d.openInterestValue),
            price24hPcnt: Number(d.price24hPcnt),
            turnover24h: Number(d.turnover24h)
          });
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
          "tickers." + s,
          "publicTrade." + s,
          "orderbook.50." + s,
          "allLiquidation." + s
        ])
      }));
      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ op: "ping" }));
        } else {
          clearInterval(heartbeat);
        }
      }, 20000);
      socket.once("close", () => clearInterval(heartbeat));
    }
  );
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
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
    const markets = requested
      ? (state.markets[symbolFrom(requested)] ? [state.markets[symbolFrom(requested)]] : [])
      : Object.values(state.markets);
    res.writeHead(200);
    return res.end(JSON.stringify({
      time: now(), symbols: SYMBOLS, markets,
      latestTrades: state.trades.slice(0, 50),
      latestLiquidations: state.liquidations.slice(0, 50),
      exchanges: state.exchanges
    }));
  }

  if (url.pathname === "/api/v1/trades") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 300);
    res.writeHead(200);
    return res.end(JSON.stringify(state.trades.slice(0, limit)));
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
    data: { markets: state.markets, exchanges: state.exchanges }
  }));
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

server.listen(PORT, HOST, () => {
  log("info", "Analysis engine API listening", { host: HOST, port: PORT, symbols: SYMBOLS });
  startBinanceSpot();
  startBinanceFutures();
  startBybit();
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received; shutting down");
  for (const client of wss.clients) client.close();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  log("info", "SIGINT received; shutting down");
  for (const client of wss.clients) client.close();
  server.close(() => process.exit(0));
});
