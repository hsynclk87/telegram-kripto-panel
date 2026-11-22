const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function detectWhaleTrade(trade, thresholdUsd = 100_000) {
  const quoteValue = finite(trade?.quoteValue);
  if (quoteValue === null || quoteValue < thresholdUsd) return null;
  return {
    ...trade,
    alertType: "LARGE_TRADE",
    thresholdUsd,
    detectedAt: new Date().toISOString()
  };
}

export function detectWhaleTrades(trades, thresholdUsd = 100_000) {
  return trades
    .map((trade) => detectWhaleTrade(trade, thresholdUsd))
    .filter(Boolean);
}
