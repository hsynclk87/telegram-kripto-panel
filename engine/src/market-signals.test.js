import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCandleMarket } from "./market-signals.js";

const makeCandle = (i, volume = 1000) => ({
  openTime: i, high: 100 + i, low: 80 - i / 10,
  close: 90 + i / 10, volume, quoteVolume: volume
});

test("waits for a 20-candle baseline", () => {
  const result = analyzeCandleMarket(Array.from({ length: 19 }, (_, i) => makeCandle(i)), makeCandle(20, 5000));
  assert.equal(result.status, "WARMING_UP");
  assert.equal(result.abnormalVolume, false);
});

test("detects abnormal volume against the prior 20 candles", () => {
  const history = Array.from({ length: 20 }, (_, i) => makeCandle(i, 1000));
  const result = analyzeCandleMarket(history, makeCandle(21, 3000));
  assert.equal(result.abnormalVolume, true);
  assert.equal(result.volumeRatio, 3);
});

test("reports recent range support and resistance", () => {
  const history = Array.from({ length: 20 }, (_, i) => makeCandle(i, 1000));
  const result = analyzeCandleMarket(history, makeCandle(21, 1000));
  assert.equal(result.resistance, 119);
  assert.equal(result.support, 78.1);
});
