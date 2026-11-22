import test from "node:test";
import assert from "node:assert/strict";
import { detectWhaleTrade, detectWhaleTrades } from "./whales.js";

test("flags trades at or above the configured quote threshold", () => {
  const trade = { symbol: "BTCUSDT", quoteValue: 125_000, side: "BUY" };
  const alert = detectWhaleTrade(trade, 100_000);
  assert.equal(alert.alertType, "LARGE_TRADE");
  assert.equal(alert.thresholdUsd, 100_000);
  assert.equal(alert.symbol, "BTCUSDT");
});

test("does not flag trades below threshold or with invalid quote value", () => {
  assert.equal(detectWhaleTrade({ quoteValue: 99_999 }, 100_000), null);
  assert.equal(detectWhaleTrade({ quoteValue: "not-a-number" }, 100_000), null);
});

test("filters a mixed trade batch", () => {
  const alerts = detectWhaleTrades([
    { quoteValue: 10_000 },
    { quoteValue: 200_000 },
    { quoteValue: 150_000 }
  ], 100_000);
  assert.equal(alerts.length, 2);
});
