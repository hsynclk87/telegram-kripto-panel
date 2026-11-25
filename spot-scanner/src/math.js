export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
export function stddev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map(v => (v - m) ** 2)));
}
export function zScore(value, history) {
  if (history.length < 20) return { value: 0, ready: false };
  const sd = stddev(history);
  if (sd < 1e-12) return { value: 0, ready: true };
  return { value: (value - mean(history)) / sd, ready: true };
}
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function pctChange(a, b) { return a > 0 ? ((b - a) / a) * 100 : 0; }
export function weightedScore(parts) {
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(clamp(parts.reduce((s, p) => s + clamp(p.score, 0, 1) * p.weight, 0) / totalWeight * 100, 0, 100));
}
