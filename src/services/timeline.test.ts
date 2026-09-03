import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

describe("buildTimeline", () => {
  it("only source-supported events, sorted", () => {
    const t = (s: string) => new Date(`2026-09-03T${s}Z`);
    const ev = buildTimeline({
      id: "x", dispatchedAt: t("17:31:02"), callType: "HOUSE FIRE", category: "structure_fire", status: "closed", rawSource: "t",
      units: [{ unit: "PE714", dispatchedAt: t("17:31:05") }, { unit: "AT714" }, { unit: "BC705", dispatchedAt: t("17:34:12") }],
      updatedAt: t("17:40:22"), closedAt: t("18:02:11"),
    });
    expect(ev.map((e) => `${e.kind}:${e.text}`)).toEqual([
      "created:Incident created — HOUSE FIRE", "unit_dispatched:PE714 dispatched", "unit_added:BC705 added", "updated:Incident updated", "closed:Incident closed",
    ]);
  });
});
