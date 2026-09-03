import { describe, expect, it } from "vitest";
import { detectChanges } from "./changeDetection";
import type { Incident } from "@/types/incident";

const t0 = new Date("2026-09-03T17:31:02Z");
const mk = (id: string, extra: Partial<Incident> = {}): Incident => ({
  id, dispatchedAt: t0, callType: "ALS", category: "als", status: "dispatched", units: [{ unit: "A714" }], rawSource: "t", ...extra,
});

describe("detectChanges", () => {
  it("first snapshot is all added", () => {
    const c = detectChanges(new Map(), [mk("a"), mk("b")], t0);
    expect(c.added.map((i) => i.id)).toEqual(["a", "b"]);
    expect(c.closed).toEqual([]);
  });
  it("status change and unit add are changes; identical is unchanged", () => {
    const prev = new Map([["a", mk("a")], ["b", mk("b")]]);
    const c = detectChanges(prev, [mk("a", { status: "onscene" }), mk("b", { rawPayload: { x: 1 } })], t0);
    expect(c.changed.map((i) => i.id)).toEqual(["a"]);
    expect(c.unchanged).toBe(1);
  });
  it("missing from snapshot => closed with closedAt, not deleted", () => {
    const prev = new Map([["a", mk("a")]]);
    const now = new Date("2026-09-03T18:00:00Z");
    const c = detectChanges(prev, [], now);
    expect(c.closed[0]).toMatchObject({ id: "a", status: "closed", closedAt: now });
  });
  it("already-closed previous does not close again", () => {
    const prev = new Map([["a", mk("a", { status: "closed" })]]);
    expect(detectChanges(prev, [], t0).closed).toEqual([]);
  });
});
