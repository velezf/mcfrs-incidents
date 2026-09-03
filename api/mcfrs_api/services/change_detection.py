"""Compare two snapshots of the active set. Pure. An incident absent from the
new snapshot is CLOSED (the upstream active list dropped it), never deleted."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from mcfrs_api.models import Incident, IncidentStatus


@dataclass
class ChangeSet:
    added: list[Incident] = field(default_factory=list)
    changed: list[Incident] = field(default_factory=list)
    closed: list[Incident] = field(default_factory=list)
    unchanged: int = 0

    @property
    def total(self) -> int:
        return len(self.added) + len(self.changed) + len(self.closed)


def fingerprint(i: Incident) -> str:
    """Fields whose change is meaningful to clients (raw_payload/updated_at churn is ignored)."""
    units = ",".join(sorted(f"{u.unit}:{u.status or ''}" for u in i.units))
    parts = [
        i.status,
        i.call_type,
        i.call_subtype or "",
        i.priority or "",
        i.address or "",
        i.latitude,
        i.longitude,
        i.station_area,
        i.alarm_level or "",
        i.talkgroup or "",
        i.channel or "",
        units,
    ]
    return "|".join("" if p is None else str(p) for p in parts)


def detect_changes(previous: dict[str, Incident], nxt: list[Incident], now: datetime) -> ChangeSet:
    cs = ChangeSet()
    seen: set[str] = set()
    for n in nxt:
        seen.add(n.id)
        p = previous.get(n.id)
        if p is None:
            cs.added.append(n)
        elif fingerprint(p) != fingerprint(n):
            cs.changed.append(n.model_copy(update={"updated_at": n.updated_at or now}))
        else:
            cs.unchanged += 1
    for pid, p in previous.items():
        if pid not in seen and p.status != IncidentStatus.CLOSED:
            cs.closed.append(
                p.model_copy(
                    update={"status": IncidentStatus.CLOSED, "closed_at": p.closed_at or now, "updated_at": now}
                )
            )
    return cs
