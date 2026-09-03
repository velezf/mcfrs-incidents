import type { SourceAdapter } from "@/adapters/types";
import type { Incident, SourceHealth } from "@/types/incident";
import { detectChanges, type ChangeSet } from "./changeDetection";

/**
 * The server-side heart: owns the active set + history (in memory in phase 1;
 * PostgreSQL behind the same interface in phase 2), runs the poll loop against
 * ONE adapter (browsers never poll upstream), detects changes, tracks source
 * health honestly, and fans changes out to subscribers (SSE in phase 4).
 */
export interface ServiceOptions {
  adapter: SourceAdapter;
  pollIntervalMs: number;
  /** Consider the source "delayed" after this many ms without a successful poll. */
  staleAfterMs?: number;
  historyLimit?: number;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export type ChangeListener = (changes: ChangeSet, health: SourceHealth) => void;

export class IncidentService {
  private active = new Map<string, Incident>();
  private history: Incident[] = []; // closed incidents, newest first
  private listeners = new Set<ChangeListener>();
  private timer: unknown = null;
  private inFlight = false;
  private stopped = true;
  private failures = 0;
  private health: SourceHealth;
  private readonly now: () => Date;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;
  readonly opts: Required<Pick<ServiceOptions, "pollIntervalMs" | "staleAfterMs" | "historyLimit">> & { adapter: SourceAdapter };
  /** Most recent raw sample + parse report for the admin page. */
  lastRawSample: unknown = undefined;
  lastParseErrors: { message: string; record?: string }[] = [];

  constructor(o: ServiceOptions) {
    this.opts = { adapter: o.adapter, pollIntervalMs: o.pollIntervalMs, staleAfterMs: o.staleAfterMs ?? o.pollIntervalMs * 4, historyLimit: o.historyLimit ?? 5000 };
    this.now = o.now ?? (() => new Date());
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
    this.health = { adapter: o.adapter.name, state: "starting", consecutiveFailures: 0, activeCount: 0 };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.pollOnce().then(() => this.schedule(this.opts.pollIntervalMs));
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = this.setTimer(() => {
      void this.pollOnce().then(() => this.schedule(this.nextDelay()));
    }, ms);
  }

  /** Exponential backoff on failure, capped at 8x the interval. */
  private nextDelay(): number {
    const base = this.opts.pollIntervalMs;
    return this.failures === 0 ? base : Math.min(base * 2 ** this.failures, base * 8);
  }

  /** One poll. Never overlaps: a second call while one is in flight is a no-op. */
  async pollOnce(): Promise<ChangeSet | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    const started = this.now();
    try {
      const result = await this.opts.adapter.fetchActive();
      const changes = this.apply(result.incidents, started);
      this.failures = 0;
      this.lastRawSample = result.rawSample;
      this.lastParseErrors = result.report.errors;
      this.health = {
        ...this.health, state: "connected", lastPollAt: started, lastSuccessAt: started, lastLatencyMs: result.report.latencyMs,
        consecutiveFailures: 0, lastError: undefined, activeCount: this.active.size,
        lastIncidentUpdateAt: changes.added.length + changes.changed.length + changes.closed.length > 0 ? started : this.health.lastIncidentUpdateAt,
      };
      if (changes.added.length + changes.changed.length + changes.closed.length > 0) this.emit(changes);
      return changes;
    } catch (err) {
      this.failures++;
      const msg = err instanceof Error ? err.message : String(err);
      const stale = !this.health.lastSuccessAt || started.getTime() - this.health.lastSuccessAt.getTime() > this.opts.staleAfterMs;
      this.health = { ...this.health, state: stale ? "down" : "delayed", lastPollAt: started, consecutiveFailures: this.failures, lastError: msg };
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  private apply(incidents: Incident[], now: Date): ChangeSet {
    const changes = detectChanges(this.active, incidents, now);
    for (const i of [...changes.added, ...changes.changed]) this.active.set(i.id, i);
    for (const i of changes.closed) {
      this.active.delete(i.id);
      this.history.unshift(i);
    }
    // An upstream may also report closed incidents explicitly in its active list.
    for (const i of incidents) {
      if (i.status === "closed" && this.active.has(i.id)) {
        this.active.delete(i.id);
        this.history.unshift(i);
      }
    }
    if (this.history.length > this.opts.historyLimit) this.history.length = this.opts.historyLimit;
    return changes;
  }

  private emit(changes: ChangeSet): void {
    for (const l of this.listeners) l(changes, this.getHealth());
  }

  subscribe(l: ChangeListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getActive(): Incident[] {
    return [...this.active.values()].sort((a, b) => b.dispatchedAt.getTime() - a.dispatchedAt.getTime());
  }

  getHistory(): Incident[] {
    return [...this.history];
  }

  getById(id: string): Incident | undefined {
    return this.active.get(id) ?? this.history.find((i) => i.id === id);
  }

  /** Health with staleness re-evaluated at read time, so "connected" cannot go stale silently. */
  getHealth(): SourceHealth {
    const h = { ...this.health, activeCount: this.active.size };
    const last = h.lastSuccessAt?.getTime();
    if (h.state === "connected" && last !== undefined && this.now().getTime() - last > this.opts.staleAfterMs) h.state = "delayed";
    return h;
  }
}
