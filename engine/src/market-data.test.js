import test from "node:test";
import assert from "node:assert/strict";
import { createTradeDeduplicator, isFirstFuturesDepthEventValid } from "./market-data.js";

test("deduplicates exchange trade IDs but retains distinct trades", () => {
  const isDuplicate = createTradeDeduplicator(10);
  const trade = { exchange: "Binance Spot", id: "spot:123", symbol: "BTCUSDT", price: 10 };
  assert.equal(isDuplicate(trade), false);
  assert.equal(isDuplicate({ ...trade }), true);
  assert.equal(isDuplicate({ ...trade, id: "spot:124" }), false);
});

test("bounds deduplication memory", () => {
  const isDuplicate = createTradeDeduplicator(2);
  isDuplicate({ exchange: "x", id: "1" });
  isDuplicate({ exchange: "x", id: "2" });
  isDuplicate({ exchange: "x", id: "3" });
  assert.equal(isDuplicate({ exchange: "x", id: "1" }), false);
});

test("accepts the first futures depth event contiguous with REST snapshot", () => {
  assert.equal(isFirstFuturesDepthEventValid({ U: 101, u: 105 }, 100), true);
  assert.equal(isFirstFuturesDepthEventValid({ U: 102, u: 105 }, 100), false);
  assert.equal(isFirstFuturesDepthEventValid({ U: 90, u: 99 }, 100), false);
});
