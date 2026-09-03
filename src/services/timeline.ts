import type { Incident, TimelineEvent } from "@/types/incident";

/** Timeline from facts the source actually supplied. No invented events. */
export function buildTimeline(i: Incident): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ at: i.dispatchedAt, kind: "created", text: `Incident created — ${i.callType}` }];
  for (const u of i.units) {
    if (u.dispatchedAt) {
      const later = u.dispatchedAt.getTime() - i.dispatchedAt.getTime() > 60_000;
      ev.push({ at: u.dispatchedAt, kind: later ? "unit_added" : "unit_dispatched", text: `${u.unit} ${later ? "added" : "dispatched"}`, unit: u.unit });
    }
  }
  if (i.updatedAt && i.updatedAt.getTime() > i.dispatchedAt.getTime()) ev.push({ at: i.updatedAt, kind: "updated", text: "Incident updated" });
  if (i.closedAt) ev.push({ at: i.closedAt, kind: "closed", text: "Incident closed" });
  return ev.sort((a, b) => a.at.getTime() - b.at.getTime());
}
