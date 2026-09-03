"""Timeline from facts the source actually supplied, merged with what this
instance observed. No invented events."""

from __future__ import annotations

from datetime import timedelta

from mcfrs_api.models import Incident, TimelineEvent


def source_timeline(i: Incident) -> list[TimelineEvent]:
    ev = [TimelineEvent(at=i.dispatched_at, kind="created", text=f"Incident created — {i.call_type}")]
    for u in i.units:
        if u.dispatched_at:
            later = u.dispatched_at - i.dispatched_at > timedelta(minutes=1)
            ev.append(
                TimelineEvent(
                    at=u.dispatched_at,
                    kind="unit_added" if later else "unit_dispatched",
                    text=f"{u.unit} {'added' if later else 'dispatched'}",
                    unit=u.unit,
                )
            )
    if i.updated_at and i.updated_at > i.dispatched_at:
        ev.append(TimelineEvent(at=i.updated_at, kind="updated", text="Incident updated"))
    if i.closed_at:
        ev.append(TimelineEvent(at=i.closed_at, kind="closed", text="Incident closed"))
    return sorted(ev, key=lambda e: e.at)


def merge_timeline(source: list[TimelineEvent], observed: list[TimelineEvent]) -> list[TimelineEvent]:
    """Observed events add detail (unit added at HH:MM as seen by us); duplicates of a
    source-supplied event within a minute are dropped."""
    out = list(source)
    for o in observed:
        dup = any(s.kind == o.kind and s.unit == o.unit and abs((s.at - o.at).total_seconds()) < 60 for s in source)
        if not dup:
            out.append(o)
    return sorted(out, key=lambda e: e.at)
