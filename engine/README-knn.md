# KNN Market Intelligence

Read-only kNN analysis endpoint for the Telegram Mini App.

GET /api/knn?symbol=BTCUSDT&timeframe=15m&k=10&horizon=5&distance=lorentzian&history=2500

Timeframes: 15m, 1h, 4h, 1d, 1w. K values: 5, 10, 20, 30. Forecast horizons: 3, 5, 10, 20 closed candles. Distance methods: Lorentzian and Euclidean.

The engine paginates Binance Spot klines, removes the still-open candle, computes RSI, Stoch RSI, MFI, CCI, normalized OBV slope, ADX, ATR%, VWAP deviation, relative volume, ROC and candle body/ATR. Historical labels are only used after their forward horizon has elapsed. Walk-forward testing uses only examples whose outcomes were known before each test timestamp.

Current futures OI, funding and global long/short ratio are returned as context only; they are not inserted into historical training vectors. Weighted neighbor votes are similarity scores, not calibrated probabilities.
