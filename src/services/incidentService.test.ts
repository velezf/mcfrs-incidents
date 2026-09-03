import { describe, expect, it } from "vitest";
import { IncidentService } from "./incidentService";
import type { SourceAdapter, FetchResult } from "@/adapters/types";
import type { Incident } from "@/types/incident";

const t0 = new Date("2026-09-03T17:31:02Z");
const mk = (id: string, extra: Partial<Incident> = {}): Incident => ({
  id, dispatchedAt: t0, callType: "ALS", category: "als", status: "dispatched", units: [{ unit: "A714" }], rawSource: "t", ...extra,
});
function fake(snapshots: (Incident[] | Error)[]): SourceAdapter & { calls: number } {
  let n = 0;
  return {
    name: "fake", calls: 0,
    describe: () => ({ name: "fake", config: {} }),
    async fetchActive(): Promise<FetchResult> {
      this.calls++;
      const s = snapshots[Math.min(n++, snapshots.length - 1)];
      if (s instanceof Error) throw s;
      return { incidents: s, report: { fetchedAt: t0, latencyMs: 7, received: s.length, parsed: s.length, errors: [] } };
    },
  };
}

describe("IncidentService", () => {
  it("first poll adds, second closes the missing one into history and emits", async () => {
    const svc = new IncidentService({ adapter: fake([[mk("a"), mk("b")], [mk("a", { status: "onscene" })]]), pollIntervalMs: 1000, now: () => t0 });
    const seen: string[] = [];
    svc.subscribe((c) => seen.push(`+${c.added.length}~${c.changed.length}-${c.closed.length}`));
    await svc.pollOnce();
    await svc.pollOnce();
    expect(seen).toEqual(["+2~0-0", "+0~1-1"]);
    expect(svc.getActive().map((i) => i.id)).toEqual(["a"]);
    expect(svc.getHistory()[0]).toMatchObject({ id: "b", status: "closed" });
    expect(svc.getHealth()).toMatchObject({ state: "connected", activeCount: 1, lastLatencyMs: 7 });
  });

  it("failure marks delayed then down, keeps last data, and backs off", async () => {
    let clock = t0.getTime();
    const svc = new IncidentService({ adapter: fake([[mk("a")], new Error("boom")]), pollIntervalMs: 1000, staleAfterMs: 5000, now: () => new Date(clock) });
    await svc.pollOnce();
    clock += 1000;
    await svc.pollOnce();
    expect(svc.getHealth()).toMatchObject({ state: "delayed", consecutiveFailures: 1, lastError: "boom" });
    expect(svc.getActive()).toHaveLength(1);
    clock += 10_000;
    await svc.pollOnce();
    expect(svc.getHealth().state).toBe("down");
  });

  it("never overlaps polls", async () => {
    let resolve!: (r: FetchResult) => void;
    const adapter: SourceAdapter = { name: "slow", describe: () => ({ name: "slow", config: {} }), fetchActive: () => new Promise<FetchResult>((r) => (resolve = r)) };
    const svc = new IncidentService({ adapter, pollIntervalMs: 1000, now: () => t0 });
    const p1 = svc.pollOnce();
    const p2 = svc.pollOnce();
    expect(await p2).toBeNull();
    resolve({ incidents: [], report: { fetchedAt: t0, latencyMs: 1, received: 0, parsed: 0, errors: [] } });
    expect(await p1).not.toBeNull();
  });

  it("connected health goes stale at read time", async () => {
    let clock = t0.getTime();
    const svc = new IncidentService({ adapter: fake([[]]), pollIntervalMs: 1000, staleAfterMs: 4000, now: () => new Date(clock) });
    await svc.pollOnce();
    expect(svc.getHealth().state).toBe("connected");
    clock += 60_000;
    expect(svc.getHealth().state).toBe("delayed");
  });
});
