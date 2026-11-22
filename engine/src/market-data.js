export function createTradeDeduplicator(maxEntries = 20000) {
  const seen = new Map();
  return (trade) => {
    if (!trade || typeof trade !== "object") return false;
    const identity = trade.id
      ? String(trade.exchange || "") + "|" + String(trade.id)
      : [trade.exchange, trade.symbol, trade.timestamp, trade.price, trade.quantity, trade.side].join("|");
    if (seen.has(identity)) return true;
    seen.set(identity, true);
    if (seen.size > maxEntries) {
      const oldest = seen.keys().next().value;
      seen.delete(oldest);
    }
    return false;
  };
}

export function isFirstFuturesDepthEventValid(event, lastUpdateId) {
  const first = Number(event?.U);
  const final = Number(event?.u);
  const snapshot = Number(lastUpdateId);
  return Number.isFinite(first) && Number.isFinite(final) && Number.isFinite(snapshot)
    && first <= snapshot + 1 && final >= snapshot + 1;
}
