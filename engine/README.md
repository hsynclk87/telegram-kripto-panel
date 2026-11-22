# Telegram Mini App - Analysis Engine

Independent Node.js service for collecting public Binance and Bybit market streams. It does not create or use a Telegram bot.

## V1 collector
- Binance Spot: trades, top-20 order book, 1-minute candles.
- Binance USD-M Futures: aggregate trades, top-20 order book, 1-minute candles, force orders.
- Bybit Linear: tickers (last/mark/index price, funding, open interest), public trades, order book and liquidations.
- HTTP snapshot/health endpoints and a WebSocket push stream for the Mini App.

## Run locally
Requires Node.js 20 or newer.

```bash
cd engine
cp .env.example .env
npm install
npm start
```

Default port: 8080.

## API
- `GET /health`
- `GET /api/v1/health`
- `GET /api/v1/snapshot`
- `GET /api/v1/snapshot?symbol=BTCUSDT`
- `GET /api/v1/trades?limit=50`
- `GET /api/v1/liquidations?limit=50`
- `WS /stream`

## Configuration
- `PORT` (default 8080)
- `HOST` (default 0.0.0.0)
- `CORS_ORIGIN` (default *)
- `SYMBOLS` (comma-separated USDT symbols)

## V1 limitations
- Data is held in memory; restarts clear rolling trade/liquidation buffers.
- This is a collector/transport layer, not yet the final signal engine.
- Public market streams require no API keys.
- Production requires HTTPS/WSS, restricted CORS, process supervision and persistent storage.
- The existing `index.html` is unchanged; the Mini App still needs to be connected to the deployed service URL.
