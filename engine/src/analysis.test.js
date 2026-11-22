import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMarkets } from "./analysis.js";

test("returns insufficient data when market inputs are missing", () => {
  const result = analyzeMarkets({
    symbols: ["BTCUSDT"], markets: {}, trades: [], liquidations: [], nowMs: 1_800_000_000_000
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, "BTCUSDT");
  assert.equal(result[0].signal, "INSUFFICIENT_DATA");
  assert.equal(result[0].quality, "LOW");
});

test("scores buyer pressure from trades and order book", () => {
  const now = 1_800_000_000_000;
  const markets = {
    BTCUSDT: {
      binanceFutures: {
        bids: [[100, 100]], asks: [[101, 1]],
        candle1m: { open: 100, close: 100.2 }
      }
    }
  };
  const trades = Array.from({ length: 10 }, (_, i) => ({
    symbol: "BTCUSDT", side: "BUY", quoteValue: 1000, timestamp: now - i * 1000
  }));
  const result = analyzeMarkets({
    symbols: ["BTCUSDT"], markets, trades, liquidations: [], nowMs: now
  })[0];
  assert.equal(result.signal, "BUY");
  assert.ok(result.score >= 35);
  assert.equal(result.quality, "MEDIUM");
});

test("ignores trades outside the five-minute analysis window", () => {
  const now = 1_800_000_000_000;
  const trades = [{
    symbol: "BTCUSDT", side: "BUY", quoteValue: 1_000_000, timestamp: now - 600_000
  }];
  const result = analyzeMarkets({
    symbols: ["BTCUSDT"], markets: {}, trades, liquidations: [], nowMs: now
  })[0];
  assert.equal(result.inputs.buyQuote5m, 0);
  assert.equal(result.signal, "INSUFFICIENT_DATA");
});
