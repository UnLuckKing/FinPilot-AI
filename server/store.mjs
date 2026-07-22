import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { computeEvidence } from "./engine.mjs";

export class EventStore {
  constructor(filePath, { maxInMemory = 5_000 } = {}) {
    this.filePath = filePath;
    this.maxInMemory = maxInMemory;
    this.analyses = new Map();
    this.outcomes = [];
    this.nonces = new Set();
    this.writeChain = Promise.resolve();
    this.corruptLines = 0;
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
    let source = "";
    try { source = await readFile(this.filePath, "utf8"); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }

    for (const line of source.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      try { this.apply(JSON.parse(line)); }
      catch { this.corruptLines += 1; }
    }
    this.trim();
  }

  hasNonce(nonce) { return this.nonces.has(String(nonce)); }

  async appendAnalysis(analysis, nonce) {
    const event = { kind: "ANALYSIS", recordedAt: new Date().toISOString(), nonce: String(nonce), payload: analysis };
    await this.append(event);
    return analysis;
  }

  async appendOutcome(outcome, nonce) {
    const event = { kind: "OUTCOME", recordedAt: new Date().toISOString(), nonce: String(nonce), payload: outcome };
    await this.append(event);
    return outcome;
  }

  async append(event) {
    const line = `${JSON.stringify(event)}\n`;
    this.writeChain = this.writeChain.then(() => appendFile(this.filePath, line, { encoding: "utf8", mode: 0o600 }));
    await this.writeChain;
    this.apply(event);
    this.trim();
  }

  apply(event) {
    if (!event || typeof event !== "object") return;
    if (event.nonce) this.nonces.add(String(event.nonce));
    if (event.kind === "ANALYSIS" && event.payload?.id) this.analyses.set(String(event.payload.id), event.payload);
    if (event.kind === "OUTCOME" && event.payload?.signalId) this.outcomes.push(event.payload);
  }

  trim() {
    while (this.analyses.size > this.maxInMemory) this.analyses.delete(this.analyses.keys().next().value);
    if (this.outcomes.length > this.maxInMemory) this.outcomes.splice(0, this.outcomes.length - this.maxInMemory);
    if (this.nonces.size > this.maxInMemory * 2) {
      this.nonces = new Set([...this.nonces].slice(-this.maxInMemory));
    }
  }

  snapshot() {
    const analyses = [...this.analyses.values()].sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
    const evidence = computeEvidence(this.outcomes);
    const verdictCounts = Object.create(null);
    const marketCounts = Object.create(null);
    for (const item of analyses) {
      verdictCounts[item.verdict] = (verdictCounts[item.verdict] ?? 0) + 1;
      marketCounts[item.market] = (marketCounts[item.market] ?? 0) + 1;
    }
    const outcomesBySignal = new Map(this.outcomes.map((outcome) => [String(outcome.signalId), outcome]));
    return {
      generatedAt: new Date().toISOString(),
      analyses: analyses.map((item) => ({ ...item, outcome: outcomesBySignal.get(String(item.id)) ?? null })),
      totals: { analyses: analyses.length, outcomes: this.outcomes.length, verdictCounts, marketCounts },
      evidence,
      diagnostics: { corruptLines: this.corruptLines }
    };
  }
}
