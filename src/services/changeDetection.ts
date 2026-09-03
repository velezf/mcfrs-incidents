import type { Incident } from "@/types/incident";

/**
 * Compare two snapshots of the active set. Pure. An incident absent from the new
 * snapshot is CLOSED (the upstream active list dropped it), never deleted.
 */
export interface ChangeSet {
  added: Incident[];
  changed: Incident[];
  closed: Incident[];
  unchanged: number;
}

/** Fields whose change is meaningful to clients (rawPayload/updatedAt churn is ignored). */
function fingerprint(i: Incident): string {
  const units = i.units.map((u) => `${u.unit}:${u.status ?? ""}`).sort().join(",");
  return [i.status, i.callType, i.callSubtype ?? "", i.priority ?? "", i.address ?? "", i.latitude ?? "", i.longitude ?? "",
    i.stationArea ?? "", i.alarmLevel ?? "", i.talkgroup ?? "", i.channel ?? "", units].join("|");
}

export function detectChanges(previous: ReadonlyMap<string, Incident>, next: readonly Incident[], now: Date): ChangeSet {
  const added: Incident[] = [];
  const changed: Incident[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  for (const n of next) {
    seen.add(n.id);
    const p = previous.get(n.id);
    if (!p) added.push(n);
    else if (fingerprint(p) !== fingerprint(n)) changed.push({ ...n, updatedAt: n.updatedAt ?? now });
    else unchanged++;
  }
  const closed: Incident[] = [];
  for (const [id, p] of previous) {
    if (!seen.has(id) && p.status !== "closed") closed.push({ ...p, status: "closed", closedAt: p.closedAt ?? now, updatedAt: now });
  }
  return { added, changed, closed, unchanged };
}
