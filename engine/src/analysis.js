const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function sumQuote(rows, side) {
  return rows.reduce((total, row) => total + (row.side === side ? (finite(row.quoteValue) || 0) : 0), 0);
}

function bookImbalance(book) {
  if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) return null;
  const bid = book.bids.reduce((s, level) => s + (finite(level[1]) || 0), 0);
  const ask = book.asks.reduce((s, level) => s + (finite(level[1]) || 0), 0);
  const total = bid + ask;
  return total > 0 ? (bid - ask) / total : null;
}

function analyzeSymbol(symbol, market, trades, liquidations, nowMs) {
  const cutoff = nowMs - 5 * 60 * 1000;
  const recentTrades = trades.filter((t) => t.symbol === symbol && Number(t.timestamp) >= cutoff);
  const buyQuote = sumQuote(recentTrades, "BUY");
  const sellQuote = sumQuote(recentTrades, "SELL");
  const flowTotal = buyQuote + sellQuote;
  const flow = flowTotal > 0 ? (buyQuote - sellQuote) / flowTotal : null;

  const spotBook = market?.binanceSpot;
  const futuresBook = market?.binanceFutures;
  const bybitBook = market?.bybitLinear;
  const imbalanceValues = [
    bookImbalance(futuresBook),
    bookImbalance(bybitBook),
    bookImbalance(spotBook)
  ].filter((v) => v !== null);
  const imbalance = imbalanceValues.length
    ? imbalanceValues.reduce((a, b) => a + b, 0) / imbalanceValues.length
    : null;

  const candle = futuresBook?.candle1m || spotBook?.candle1m;
  const candleChangePct = candle && candle.open > 0
    ? ((candle.close - candle.open) / candle.open) * 100
    : null;

  const bybit = bybitBook || {};
  const fundingRate = finite(bybit.fundingRate);
  const openInterest = finite(bybit.openInterest);
  const price24hPcnt = finite(bybit.price24hPcnt);

  const recentLiquidations = liquidations.filter(
    (item) => item.symbol === symbol && Number(item.timestamp) >= cutoff
  );
  const liquidationBuy = recentLiquidations
    .filter((item) => item.side === "Buy")
    .reduce((s, item) => s + (finite(item.quoteValue) || 0), 0);
  const liquidationSell = recentLiquidations
    .filter((item) => item.side === "Sell")
    .reduce((s, item) => s + (finite(item.quoteValue) || 0), 0);

  const components = [];
  if (flow !== null) components.push({ name: "tradeFlow", value: flow * 35, weight: 1 });
  if (imbalance !== null) components.push({ name: "orderBook", value: imbalance * 30, weight: 1 });
  if (candleChangePct !== null) {
    components.push({ name: "candleMomentum", value: Math.max(-1, Math.min(1, candleChangePct / 0.35)) * 20, weight: 1 });
  }
  if (fundingRate !== null) {
    // Crowded positive funding is a mild contrarian risk, not a standalone short signal.
    components.push({ name: "fundingRisk", value: Math.max(-1, Math.min(1, -fundingRate / 0.001)) * 5, weight: 1 });
  }

  const weight = components.reduce((s, c) => s + c.weight, 0);
  const score = weight
    ? Math.round(components.reduce((s, c) => s + c.value, 0) / weight)
    : 0;
  const signal = components.length < 2 ? "INSUFFICIENT_DATA"
    : score >= 35 ? "BUY"
    : score <= -35 ? "SELL"
    : "WAIT";
  const quality = components.length >= 4 ? "HIGH"
    : components.length >= 2 ? "MEDIUM"
    : "LOW";

  return {
    symbol,
    signal,
    score,
    quality,
    calculatedAt: new Date(nowMs).toISOString(),
    windowMinutes: 5,
    inputs: {
      buyQuote5m: Math.round(buyQuote),
      sellQuote5m: Math.round(sellQuote),
      tradeFlowRatio: flow,
      orderBookImbalance: imbalance,
      candleChangePct,
      fundingRate,
      openInterest,
      price24hPcnt,
      liquidations5m: {
        buySideQuote: Math.round(liquidationBuy),
        sellSideQuote: Math.round(liquidationSell),
        count: recentLiquidations.length
      }
    },
    components,
    explanation: signal === "BUY"
      ? "Kısa vadeli işlem akışı ve emir defteri alıcı yönünü destekliyor; tek başına işlem tavsiyesi değildir."
      : signal === "SELL"
      ? "Kısa vadeli işlem akışı ve emir defteri satıcı yönünü destekliyor; tek başına işlem tavsiyesi değildir."
      : signal === "WAIT"
      ? "Veriler net bir yön oluşturmuyor."
      : "Karar üretmek için yeterli canlı veri henüz toplanmadı."
  };
}

export function analyzeMarkets({ symbols, markets, trades, liquidations, nowMs = Date.now() }) {
  return symbols.map((symbol) =>
    analyzeSymbol(symbol, markets[symbol], trades, liquidations, nowMs)
  );
}
