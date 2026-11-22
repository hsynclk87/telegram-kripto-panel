const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function analyzeCandleMarket(history = [], current = null) {
  const candles = history
    .filter((c) => c && finite(c.high) !== null && finite(c.low) !== null)
    .slice(-60);
  const recent = candles.slice(-20);
  const currentClose = finite(current?.close);
  const currentVolume = finite(current?.quoteVolume ?? current?.volume);

  const resistance = candles.length
    ? Math.max(...candles.map((c) => Number(c.high)))
    : null;
  const support = candles.length
    ? Math.min(...candles.map((c) => Number(c.low)))
    : null;

  const averageQuoteVolume = recent.length
    ? recent.reduce((sum, c) => sum + (finite(c.quoteVolume ?? c.volume) || 0), 0) / recent.length
    : null;
  const volumeRatio = averageQuoteVolume > 0 && currentVolume !== null
    ? currentVolume / averageQuoteVolume
    : null;

  const warmedUp = recent.length >= 20;
  const abnormalVolume = warmedUp && volumeRatio !== null && volumeRatio >= 2.5;
  const breakout = warmedUp && currentClose !== null && resistance !== null
    && currentClose > resistance && volumeRatio !== null && volumeRatio >= 1.5;
  const breakdown = warmedUp && currentClose !== null && support !== null
    && currentClose < support && volumeRatio !== null && volumeRatio >= 1.5;

  return {
    historyCandles: candles.length,
    baselineCandles: recent.length,
    warmedUp,
    support,
    resistance,
    averageQuoteVolume: averageQuoteVolume === null ? null : Math.round(averageQuoteVolume),
    currentQuoteVolume: currentVolume,
    volumeRatio,
    abnormalVolume,
    breakout,
    breakdown,
    status: warmedUp ? "READY" : "WARMING_UP"
  };
}
