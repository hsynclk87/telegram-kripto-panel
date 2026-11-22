import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "./storage.js";

test("uses a safe in-memory fallback when DATABASE_URL is absent", async () => {
  const storage = await createStorage({ connectionString: "" });
  assert.equal(storage.enabled, false);
  assert.deepEqual(await storage.loadCandles("BTCUSDT"), []);
  await storage.saveEvent("trade", { symbol: "BTCUSDT" });
  await storage.saveCandle("BTCUSDT", { openTime: 1 });
  await storage.close();
});
