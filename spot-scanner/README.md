# Project 7 — Binance Spot Scanner

Independent real-time Binance Spot flow scanner. It does not modify the existing Mini App, live-price server, or Finansal Ajan Merkezi V2. It is analysis/alert-only and never places orders.

## Signals
- TPS Z-score (rolling 5-minute baseline)
- Aggressor-side CVD and CVD acceleration
- Buy ratio
- Trade notional and intensity Z-score
- Best-bid/ask spread compression
- Top-5 order-book imbalance
- Heuristic absorption classification
- 0–100 early-momentum score and price-extension filter
- Telegram alerts with cooldown and JSONL signal/outcome journal

## Run
1. Copy .env.example to .env and set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
2. npm install
3. npm test
4. npm start

No Binance API key is required. Public market-data endpoints and streams are used.

## HTTP
- GET /health
- GET /api/status
- GET /api/universe
- GET /api/signals?limit=30
- GET /api/metrics/:symbol
- POST /api/scan (manual snapshot scan)
- GET /api/performance (matured signal outcomes)

## Telegram commands
/start, /help, /durum, /tarama, /erken, /coin BTCUSDT, /performans

## Important operational notes
- Binance combined streams are used for aggTrade, bookTicker and depth5@100ms for the selected universe. The scanner reconnects and refreshes its universe periodically.
- A 5-minute rolling baseline is built after startup. Until enough observations exist, Z-score confidence is marked as warming-up and alerts are suppressed.
- Absorption is a heuristic, not proof of a named whale or iceberg order.
- JSONL records are durable only when DATA_DIR is mounted to persistent storage. The included Render blueprint provisions a disk and a paid worker plan; check current Render pricing before deployment.
- The score is a ranking aid, not a profitability guarantee. Validate on forward data after fees and slippage before acting.
