import { mkdir, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
export class Journal {
  constructor(dir) { this.dir = dir; this.file = join(dir, "signals.jsonl"); this.rows = []; }
  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      this.rows = raw.split("\n").filter(Boolean).map(line => JSON.parse(line));
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  async add(row) {
    this.rows.push(row);
    await appendFile(this.file, JSON.stringify(row) + "\n");
  }
  recent(limit = 30) { return this.rows.slice(-limit).reverse(); }
  performance(now = Date.now()) {
    const matured = this.rows.filter(r => r.type === "signal" && r.outcomes?.maturedAt);
    const latest = matured.filter(r => now - r.outcomes.maturedAt < 7 * 86400000);
    const wins = latest.filter(r => (r.outcomes.return60mPct ?? 0) > 0).length;
    return { maturedSignals: latest.length, positive60m: wins, hitRate60mPct: latest.length ? +(wins / latest.length * 100).toFixed(1) : null };
  }
}
