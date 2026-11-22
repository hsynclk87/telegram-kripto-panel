const SCHEMA = `
CREATE TABLE IF NOT EXISTS market_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  symbol TEXT,
  exchange_name TEXT,
  event_time TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS market_events_type_time_idx
  ON market_events (event_type, event_time DESC);
CREATE INDEX IF NOT EXISTS market_events_symbol_time_idx
  ON market_events (symbol, event_time DESC);

CREATE TABLE IF NOT EXISTS candles_1m (
  symbol TEXT NOT NULL,
  open_time BIGINT NOT NULL,
  close_time BIGINT,
  open_price NUMERIC NOT NULL,
  high_price NUMERIC NOT NULL,
  low_price NUMERIC NOT NULL,
  close_price NUMERIC NOT NULL,
  base_volume NUMERIC NOT NULL,
  quote_volume NUMERIC NOT NULL,
  PRIMARY KEY (symbol, open_time)
);
CREATE INDEX IF NOT EXISTS candles_1m_symbol_open_idx
  ON candles_1m (symbol, open_time DESC);
`;

export async function createStorage({ connectionString = process.env.DATABASE_URL } = {}) {
  if (!connectionString) {
    return {
      enabled: false,
      async saveEvent() {},
      async saveCandle() {},
      async loadCandles() { return []; },
      async close() {}
    };
  }

  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  await pool.query(SCHEMA);

  return {
    enabled: true,
    async saveEvent(eventType, payload) {
      const timestamp = Number(payload.timestamp);
      const eventTime = Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();
      await pool.query(
        `INSERT INTO market_events (event_type, symbol, exchange_name, event_time, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [eventType, payload.symbol || null, payload.exchange || null, eventTime, JSON.stringify(payload)]
      );
    },
    async saveCandle(symbol, candle) {
      await pool.query(
        `INSERT INTO candles_1m
          (symbol, open_time, close_time, open_price, high_price, low_price, close_price, base_volume, quote_volume)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (symbol, open_time) DO UPDATE SET
          close_time=EXCLUDED.close_time, open_price=EXCLUDED.open_price,
          high_price=EXCLUDED.high_price, low_price=EXCLUDED.low_price,
          close_price=EXCLUDED.close_price, base_volume=EXCLUDED.base_volume,
          quote_volume=EXCLUDED.quote_volume`,
        [symbol, candle.openTime, candle.closeTime, candle.open, candle.high,
          candle.low, candle.close, candle.volume, candle.quoteVolume]
      );
    },
    async loadCandles(symbol, limit = 100) {
      const result = await pool.query(
        `SELECT open_time, close_time, open_price, high_price, low_price,
                close_price, base_volume, quote_volume
         FROM candles_1m WHERE symbol=$1 ORDER BY open_time DESC LIMIT $2`,
        [symbol, limit]
      );
      return result.rows.reverse().map((row) => ({
        openTime: Number(row.open_time),
        closeTime: Number(row.close_time),
        open: Number(row.open_price),
        high: Number(row.high_price),
        low: Number(row.low_price),
        close: Number(row.close_price),
        volume: Number(row.base_volume),
        quoteVolume: Number(row.quote_volume),
        closed: true
      }));
    },
    async close() {
      await pool.end();
    }
  };
}
