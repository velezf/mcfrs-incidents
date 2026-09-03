import { describe, expect, it } from "vitest";
import { INCIDENT_CATEGORIES, INCIDENT_STATUSES, type Incident } from "@/types/incident";
import { MockAdapter } from "./index";
import { buildFixtures } from "./fixtures";

const T0 = new Date("2026-09-03T14:00:00Z");
const MINUTE = 60_000;

/** A controllable clock for injecting into the adapter. */
function fakeClock(start: Date): { now: () => Date; advanceMinutes: (m: number) => void; advanceSeconds: (s: number) => void } {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advanceMinutes: (m) => {
      t += m * MINUTE;
    },
    advanceSeconds: (s) => {
      t += s * 1000;
    },
  };
}

const NO_SPAWN = 10 ** 9;

const isEms = (i: Incident): boolean => i.category === "ems" || i.category === "als" || i.category === "bls";
const usesStation14 = (i: Incident): boolean => i.units.some((u) => /^[A-Z]+714$/.test(u.unit));

describe("buildFixtures", () => {
  it("returns at least 12 incidents with valid categories and statuses", () => {
    const fixtures = buildFixtures(T0);
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
    for (const i of fixtures) {
      expect(INCIDENT_CATEGORIES).toContain(i.category);
      expect(INCIDENT_STATUSES).toContain(i.status);
      expect(i.id.startsWith("mock:")).toBe(true);
      expect(i.rawSource).toBe("mock");
      expect(i.units.length).toBeGreaterThan(0);
      expect(i.dispatchedAt.getTime()).toBeLessThanOrEqual(T0.getTime());
      expect(i.rawPayload).toBeTypeOf("object");
    }
  });

  it("has unique ids", () => {
    const ids = buildFixtures(T0).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes incidents involving Station 14 units", () => {
    const fixtures = buildFixtures(T0);
    expect(fixtures.filter(usesStation14).length).toBeGreaterThanOrEqual(3);
  });

  it("never invents talkgroups for EMS incidents", () => {
    for (const i of buildFixtures(T0).filter(isEms)) {
      expect(i.talkgroup).toBeUndefined();
      expect(i.channel).toBeUndefined();
    }
  });

  it("includes a 2nd alarm apartment fire and some closed incidents", () => {
    const fixtures = buildFixtures(T0);
    const second = fixtures.find((i) => i.alarmLevel === "2nd alarm");
    expect(second).toBeDefined();
    expect(second?.units.length ?? 0).toBeGreaterThanOrEqual(15);
    const closed = fixtures.filter((i) => i.status === "closed");
    expect(closed.length).toBeGreaterThanOrEqual(2);
    for (const c of closed) expect(c.closedAt).toBeInstanceOf(Date);
  });
});

describe("MockAdapter", () => {
  it("describes itself without secrets", () => {
    const adapter = new MockAdapter({ seed: 7, spawnEverySeconds: 30, now: fakeClock(T0).now });
    const d = adapter.describe();
    expect(d.name).toBe("mock");
    expect(d.config.seed).toBe("7");
    expect(d.config.spawnEverySeconds).toBe("30");
  });

  it("returns all fixtures on the first poll, with a parse report and raw sample", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 1, spawnEverySeconds: NO_SPAWN, now: clock.now });
    const result = await adapter.fetchActive();
    const expected = buildFixtures(T0).map((i) => i.id).sort();
    expect(result.incidents.map((i) => i.id).sort()).toEqual(expected);
    expect(result.report.received).toBe(expected.length);
    expect(result.report.parsed).toBe(expected.length);
    expect(result.report.errors).toEqual([]);
    expect(result.report.latencyMs).toBeGreaterThanOrEqual(5);
    expect(result.report.latencyMs).toBeLessThanOrEqual(40);
    expect(result.rawSample).toEqual(result.incidents[0]?.rawPayload);
  });

  it("progresses statuses forward over time and never backwards", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 3, spawnEverySeconds: NO_SPAWN, now: clock.now });
    const rank = (s: string): number =>
      ["dispatching", "dispatched", "responding", "onscene", "transporting", "closed"].indexOf(s);

    let previous = new Map((await adapter.fetchActive()).incidents.map((i) => [i.id, i.status]));
    let sawChange = false;
    for (let step = 0; step < 12; step++) {
      clock.advanceMinutes(5);
      const current = new Map((await adapter.fetchActive()).incidents.map((i) => [i.id, i.status]));
      for (const [id, status] of current) {
        const before = previous.get(id);
        if (before === undefined) continue;
        expect(rank(status)).toBeGreaterThanOrEqual(rank(before));
        if (status !== before) sawChange = true;
      }
      previous = current;
    }
    expect(sawChange).toBe(true);
  });

  it("closes EMS incidents within ~60 minutes and drops closed ones after ~10 minutes", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 11, spawnEverySeconds: NO_SPAWN, now: clock.now });
    const initial = await adapter.fetchActive();
    const emsIds = new Set(initial.incidents.filter(isEms).map((i) => i.id));
    expect(emsIds.size).toBeGreaterThan(0);

    clock.advanceMinutes(60);
    const later = await adapter.fetchActive();
    for (const i of later.incidents) {
      if (emsIds.has(i.id)) {
        expect(i.status).toBe("closed");
        expect(i.closedAt).toBeInstanceOf(Date);
        expect(i.units.every((u) => u.status === "available")).toBe(true);
      }
    }

    clock.advanceMinutes(15);
    const gone = await adapter.fetchActive();
    expect(gone.incidents.some((i) => emsIds.has(i.id))).toBe(false);
    // Long-running fires are still on the board.
    expect(gone.incidents.some((i) => i.alarmLevel === "2nd alarm")).toBe(true);
  });

  it("spawns a new incident after spawnEverySeconds", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 5, spawnEverySeconds: 45, now: clock.now });
    const before = new Set((await adapter.fetchActive()).incidents.map((i) => i.id));

    clock.advanceSeconds(44);
    const notYet = await adapter.fetchActive();
    expect(notYet.incidents.filter((i) => !before.has(i.id))).toHaveLength(0);

    clock.advanceSeconds(1);
    const after = await adapter.fetchActive();
    const spawned = after.incidents.filter((i) => !before.has(i.id));
    expect(spawned).toHaveLength(1);
    const fresh = spawned[0];
    expect(fresh?.status).toBe("dispatched");
    expect(fresh?.dispatchedAt.getTime()).toBe(T0.getTime() + 45_000);
    expect(fresh?.units.length ?? 0).toBeGreaterThan(0);
    expect(INCIDENT_CATEGORIES).toContain(fresh?.category);

    clock.advanceSeconds(90);
    const twoMore = await adapter.fetchActive();
    expect(twoMore.incidents.filter((i) => !before.has(i.id))).toHaveLength(3);
  });

  it("honours the speed multiplier", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 5, spawnEverySeconds: 60, speed: 10, now: clock.now });
    const before = new Set((await adapter.fetchActive()).incidents.map((i) => i.id));
    clock.advanceSeconds(6);
    const after = await adapter.fetchActive();
    expect(after.incidents.filter((i) => !before.has(i.id))).toHaveLength(1);
  });

  it("occasionally adds units to working incidents", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 2, spawnEverySeconds: NO_SPAWN, now: clock.now });
    const initial = new Map((await adapter.fetchActive()).incidents.map((i) => [i.id, i.units.length]));
    let grew = false;
    for (let step = 0; step < 12 && !grew; step++) {
      clock.advanceMinutes(5);
      for (const i of (await adapter.fetchActive()).incidents) {
        const was = initial.get(i.id);
        if (was !== undefined && i.units.length > was) grew = true;
      }
    }
    expect(grew).toBe(true);
  });

  it("is deterministic for the same seed and clock", async () => {
    const run = async (): Promise<string[]> => {
      const clock = fakeClock(T0);
      const adapter = new MockAdapter({ seed: 42, spawnEverySeconds: 30, now: clock.now });
      const out: string[] = [];
      for (let step = 0; step < 8; step++) {
        const r = await adapter.fetchActive();
        out.push(JSON.stringify({ latency: r.report.latencyMs, incidents: r.incidents }));
        clock.advanceMinutes(7);
      }
      return out;
    };
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toEqual(b);
  });

  it("differs for a different seed", async () => {
    const run = async (seed: number): Promise<string> => {
      const clock = fakeClock(T0);
      const adapter = new MockAdapter({ seed, spawnEverySeconds: 30, now: clock.now });
      clock.advanceMinutes(10);
      return JSON.stringify((await adapter.fetchActive()).incidents);
    };
    expect(await run(1)).not.toEqual(await run(2));
  });

  it("never hands out shared references", async () => {
    const clock = fakeClock(T0);
    const adapter = new MockAdapter({ seed: 9, spawnEverySeconds: NO_SPAWN, now: clock.now });
    const first = await adapter.fetchActive();
    const second = await adapter.fetchActive();
    const a = first.incidents[0];
    const b = second.incidents.find((i) => i.id === a?.id);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) return;
    expect(a).not.toBe(b);
    expect(a.units).not.toBe(b.units);
    expect(a.units[0]).not.toBe(b.units[0]);
    expect(a.dispatchedAt).not.toBe(b.dispatchedAt);
    expect(a.rawPayload).not.toBe(b.rawPayload);

    // Mutating a returned object must not leak into the next poll.
    a.status = "unknown";
    a.units.push({ unit: "ZZ999" });
    const third = await adapter.fetchActive();
    const c = third.incidents.find((i) => i.id === a.id);
    expect(c?.status).not.toBe("unknown");
    expect(c?.units.some((u) => u.unit === "ZZ999")).toBe(false);
  });
});
