import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOWED_WEB_ORIGINS = new Set(["https://hsynclk87.github.io"]);
const INDEX = resolve(fileURLToPath(new URL("../public/index.html", import.meta.url)));
const ANALYSIS_CORE = resolve(fileURLToPath(new URL("../public/analysis-core.js", import.meta.url)));
const ALLOWED = new Set(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","LINKUSDT","AVAXUSDT","HBARUSDT"]);
const CG_IDS = {
  BTCUSDT:"bitcoin", ETHUSDT:"ethereum", SOLUSDT:"solana", BNBUSDT:"binancecoin",
  XRPUSDT:"ripple", DOGEUSDT:"dogecoin", LINKUSDT:"chainlink", AVAXUSDT:"avalanche-2", HBARUSDT:"hedera-hashgraph"
};
async function jsonGet(url) {
  const response = await fetch(url, { headers: { "User-Agent": "crypto-research-engine/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("HTTP " + response.status + " from " + new URL(url).hostname);
  const data = await response.json();
  if (data && typeof data === "object" && "retCode" in data && Number(data.retCode) !== 0) {
    throw new Error("Upstream API error: " + String(data.retMsg || data.retCode));
  }
  return data;
}
async function marketContext(symbol) {
  const q = encodeURIComponent(symbol);
  const jobs = {
    spot24h: jsonGet("https://api.binance.com/api/v3/ticker/24hr?symbol=" + q),
    futures24h: jsonGet("https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=" + q),
    openInterest: jsonGet("https://fapi.binance.com/futures/data/openInterestHist?symbol=" + q + "&period=1h&limit=30"),
    funding: jsonGet("https://fapi.binance.com/fapi/v1/fundingRate?symbol=" + q + "&limit=10"),
    longShortRatio: jsonGet("https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=" + q + "&period=1h&limit=30"),
    topLongShort: jsonGet("https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=" + q + "&period=1h&limit=30"),
    takerRatio: jsonGet("https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=" + q + "&period=1h&limit=30"),
    futuresBook: jsonGet("https://fapi.binance.com/fapi/v1/depth?symbol=" + q + "&limit=100"),
    bybitTicker: jsonGet("https://api.bybit.com/v5/market/tickers?category=linear&symbol=" + q),
    bybitBook: jsonGet("https://api.bybit.com/v5/market/orderbook?category=linear&symbol=" + q + "&limit=50"),
    coingecko: jsonGet("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + encodeURIComponent(CG_IDS[symbol]) + "&sparkline=false")
  };
  const entries = await Promise.all(Object.entries(jobs).map(async ([key, promise]) => {
    try { return [key, { ok: true, data: await promise }]; }
    catch (error) { return [key, { ok: false, error: String(error.message || error) }]; }
  }));
  return Object.fromEntries(entries);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_WEB_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "X-Server-Time");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method Not Allowed");
  }
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ ok: true, service: "telegram-live-price-mini-app", modules: ["live-price","oscillators","analysis-core","market-context","knn","sample-model-test"] }));
  }
  if (path === "/analysis-core.js") {
    try {
      const source = await readFile(ANALYSIS_CORE);
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff" });
      return req.method === "HEAD" ? res.end() : res.end(source);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Analiz motoru yüklenemedi: " + error.message);
    }
  }
  if (path === "/api/klines") {
    const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
    const interval = String(url.searchParams.get("interval") || "15m");
    const requestedLimit = Number(url.searchParams.get("limit") || 500);
    const limit = requestedLimit;
    const allowedIntervals = new Set(["15m","1h","4h","1d","1w"]);
    if (!ALLOWED.has(symbol) || !allowedIntervals.has(interval) || !Number.isInteger(limit) || limit < 100 || limit > 500) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ok: false, error: "Unsupported symbol, interval, or limit" }));
    }
    try {
      const query = "?symbol=" + encodeURIComponent(symbol) + "&interval=" + encodeURIComponent(interval) + "&limit=" + limit;
      let data, primaryError;
      try {
        data = await jsonGet("https://data-api.binance.vision/api/v3/klines" + query);
      } catch (firstError) {
        primaryError = String(firstError.message || firstError);
        data = await jsonGet("https://api.binance.com/api/v3/klines" + query);
      }
      if (!Array.isArray(data) || data.length < 100) throw new Error("Binance yetersiz mum verisi döndürdü: " + (Array.isArray(data) ? data.length : "geçersiz yanıt"));
      console.log("[klines] ok", symbol, interval, data.length, primaryError ? "fallback=api.binance.com" : "source=data-api.binance.vision");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Server-Time": String(Date.now()) });
      return res.end(JSON.stringify(data));
    } catch (error) {
      console.error("[klines] failed", symbol, interval, String(error.message || error));
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ok: false, error: String(error.message || error) }));
    }
  }
  if (path === "/api/market-context") {
    const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
    if (!ALLOWED.has(symbol)) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ok: false, error: "Unsupported symbol" }));
    }
    const result = await marketContext(symbol);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    return res.end(JSON.stringify({ ok: true, symbol, fetchedAt: new Date().toISOString(), sources: result }));
  }
  if (path !== "/" && path !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not Found");
  }
  try {
    const html = await readFile(INDEX);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    });
    return req.method === "HEAD" ? res.end() : res.end(html);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Mini App yüklenemedi: " + error.message);
  }
});
server.listen(PORT, HOST, () => console.log("Telegram live price Mini App listening on " + HOST + ":" + PORT));
