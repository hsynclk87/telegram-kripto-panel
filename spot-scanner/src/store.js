import { mkdir, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export class Journal {
  constructor(dir) { this.dir = dir; this.file = join(dir, "signals.jsonl"); this.rows = []; }
  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      const events = raw.split("\n").filter(Boolean).map(line => JSON.parse(line));
      const signals = new Map();
      for (const event of events) {
        if (event.type === "signal") signals.set(event.id, event);
        else if (event.type === "mark") {
          const signal = signals.get(event.signalId);
          if (signal) {
            signal.outcomes ??= { marks: {}, highPrice: signal.price, lowPrice: signal.price, mfePct: 0, maePct: 0 };
            signal.outcomes.marks ??= {};
            signal.outcomes.marks[event.minute] = event;
            signal.outcomes.highPrice = Math.max(signal.outcomes.highPrice ?? signal.price, event.highPrice);
            signal.outcomes.lowPrice = Math.min(signal.outcomes.lowPrice ?? signal.price, event.lowPrice);
            signal.outcomes.mfePct = event.mfePct;
            signal.outcomes.maePct = event.maePct;
            if (event.minute === 60) signal.outcomes.maturedAt = event.createdAt;
          }
        }
      }
      this.rows = [...signals.values()];
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  async add(row) {
    await appendFile(this.file, JSON.stringify(row) + "\n");
    if (row.type === "signal") this.rows.push(row);
    if (row.type === "mark") {
      const signal = this.rows.find(x => x.id === row.signalId);
      if (signal) {
        signal.outcomes ??= { marks: {}, highPrice: signal.price, lowPrice: signal.price, mfePct: 0, maePct: 0 };
        signal.outcomes.marks ??= {};
        signal.outcomes.marks[row.minute] = row;
        signal.outcomes.highPrice = row.highPrice;
        signal.outcomes.lowPrice = row.lowPrice;
        signal.outcomes.mfePct = row.mfePct;
        signal.outcomes.maePct = row.maePct;
        if (row.minute === 60) signal.outcomes.maturedAt = row.createdAt;
      }
    }
  }
  recent(limit = 30) { return this.rows.slice(-limit).reverse(); }
  performance() {
    const matured = this.rows.filter(r => r.outcomes?.marks?.[60]);
    const wins = matured.filter(r => (r.outcomes.marks[60].returnPct ?? 0) > 0).length;
    const avg = key => matured.length ? +(matured.reduce((s,r)=>s+(r.outcomes.marks[60][key]??0),0)/matured.length).toFixed(4) : null;
    return { totalSignals:this.rows.length, maturedSignals:matured.length, positive60m:wins,
      hitRate60mPct:matured.length?+(wins/matured.length*100).toFixed(1):null,
      averageReturn60mPct:avg("returnPct"), averageMfePct:avg("mfePct"), averageMaePct:avg("maePct") };
  }
}
