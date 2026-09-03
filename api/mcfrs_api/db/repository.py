"""Persistence boundary. The incident service talks only to this; memory and
PostgreSQL implementations must pass the same contract tests."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime

from mcfrs_api.models import Incident, IncidentStatus, TimelineEvent
from mcfrs_api.services.change_detection import ChangeSet


@dataclass
class HistoryQuery:
    from_: datetime | None = None
    to: datetime | None = None
    unit: str | None = None
    station: int | None = None  # unit home station OR station area
    station_area: int | None = None
    category: str | None = None
    municipality: str | None = None
    address: str | None = None
    text: str | None = None
    include_active: bool = False
    limit: int = 200
    offset: int = 0


@dataclass
class HistoryPage:
    incidents: list[Incident]
    total: int


@dataclass
class ObservedEvent:
    incident_id: str
    at: datetime
    kind: str
    text: str
    unit: str | None = None

    def as_timeline(self) -> TimelineEvent:
        return TimelineEvent(at=self.at, kind=self.kind, text=self.text, unit=self.unit)


@dataclass
class PollRecord:
    at: datetime
    adapter: str
    ok: bool
    latency_ms: int | None = None
    received: int | None = None
    parsed: int | None = None
    error: str | None = None


@dataclass
class Analytics:
    per_day: list[dict[str, object]] = field(default_factory=list)
    per_hour: list[int] = field(default_factory=lambda: [0] * 24)
    per_station_area: list[dict[str, object]] = field(default_factory=list)
    per_category: list[dict[str, object]] = field(default_factory=list)
    busiest_units: list[dict[str, object]] = field(default_factory=list)
    weekday: int = 0
    weekend: int = 0
    per_municipality: list[dict[str, object]] = field(default_factory=list)
    total: int = 0

    def as_wire(self) -> dict[str, object]:
        return {
            "perDay": self.per_day,
            "perHour": self.per_hour,
            "perStationArea": self.per_station_area,
            "perCategory": self.per_category,
            "busiestUnits": self.busiest_units,
            "weekday": self.weekday,
            "weekend": self.weekend,
            "perMunicipality": self.per_municipality,
            "total": self.total,
        }


class IncidentRepository(ABC):
    kind: str = "abstract"

    @abstractmethod
    async def load_active(self) -> list[Incident]: ...
    @abstractmethod
    async def apply_changes(self, changes: ChangeSet, seen_at: datetime) -> None: ...
    @abstractmethod
    async def touch(self, ids: list[str], seen_at: datetime) -> None: ...
    @abstractmethod
    async def get_by_id(self, incident_id: str) -> Incident | None: ...
    @abstractmethod
    async def history(self, q: HistoryQuery) -> HistoryPage: ...
    @abstractmethod
    async def analytics(self, q: HistoryQuery) -> Analytics: ...
    @abstractmethod
    async def events(self, incident_id: str) -> list[ObservedEvent]: ...
    @abstractmethod
    async def record_poll(self, p: PollRecord) -> None: ...
    @abstractmethod
    async def recent_polls(self, limit: int) -> list[PollRecord]: ...


# ---- pure helpers shared by implementations ----


def events_from_changes(c: ChangeSet, at: datetime, previous: dict[str, Incident]) -> list[ObservedEvent]:
    out: list[ObservedEvent] = []
    for i in c.added:
        out.append(ObservedEvent(i.id, at, "created", f"Observed — {i.call_type}"))
        for u in i.units:
            out.append(ObservedEvent(i.id, u.dispatched_at or at, "unit_dispatched", f"{u.unit} dispatched", u.unit))
    for i in c.changed:
        p = previous.get(i.id)
        had = {u.unit for u in p.units} if p else set()
        for u in i.units:
            if u.unit not in had:
                out.append(ObservedEvent(i.id, at, "unit_added", f"{u.unit} added", u.unit))
        if p and p.status != i.status:
            out.append(ObservedEvent(i.id, at, "status", f"Status {p.status} → {i.status}"))
        elif p is None or len(had) == len(i.units):
            out.append(ObservedEvent(i.id, at, "updated", "Incident updated"))
    for i in c.closed:
        out.append(ObservedEvent(i.id, at, "closed", "Incident closed (left the active list)"))
    return out


def matches_history(i: Incident, q: HistoryQuery, unit_station) -> bool:
    if not q.include_active and i.status != IncidentStatus.CLOSED:
        return False
    if q.from_ and i.dispatched_at < q.from_:
        return False
    if q.to and i.dispatched_at > q.to:
        return False
    if q.unit and not any(u.unit.upper() == q.unit.upper() for u in i.units):
        return False
    if (
        q.station is not None
        and i.station_area != q.station
        and not any((u.station if u.station is not None else unit_station(u.unit)) == q.station for u in i.units)
    ):
        return False
    if q.station_area is not None and i.station_area != q.station_area:
        return False
    if q.category and i.category != q.category:
        return False
    if q.municipality and (i.municipality or "").lower() != q.municipality.lower():
        return False
    if q.address and q.address.lower() not in (i.address or "").lower():
        return False
    if q.text:
        hay = " ".join(
            filter(
                None,
                [i.incident_number, i.address, i.municipality, i.call_type, i.call_subtype, *[u.unit for u in i.units]],
            )
        ).lower()
        if not all(t in hay for t in q.text.lower().split()):
            return False
    return True


def compute_analytics(items: list[Incident]) -> Analytics:
    per_day: Counter[str] = Counter()
    per_hour = [0] * 24
    area: Counter[int] = Counter()
    cat: Counter[str] = Counter()
    units: Counter[str] = Counter()
    muni: Counter[str] = Counter()
    weekday = weekend = 0
    for i in items:
        d = i.dispatched_at
        per_day[d.date().isoformat()] += 1
        per_hour[d.hour] += 1
        if i.station_area is not None:
            area[i.station_area] += 1
        cat[str(i.category)] += 1
        for u in i.units:
            units[u.unit] += 1
        if i.municipality:
            muni[i.municipality] += 1
        if d.weekday() >= 5:
            weekend += 1
        else:
            weekday += 1
    return Analytics(
        per_day=[{"day": k, "count": v} for k, v in sorted(per_day.items())],
        per_hour=per_hour,
        per_station_area=[{"station": k, "count": v} for k, v in area.most_common()],
        per_category=[{"category": k, "count": v} for k, v in cat.most_common()],
        busiest_units=[{"unit": k, "count": v} for k, v in units.most_common(25)],
        weekday=weekday,
        weekend=weekend,
        per_municipality=[{"municipality": k, "count": v} for k, v in muni.most_common()],
        total=len(items),
    )


class MemoryRepository(IncidentRepository):
    """Everything in process memory. History dies with the process."""

    kind = "memory"

    def __init__(self, unit_station, history_limit: int = 5000) -> None:
        self._all: dict[str, Incident] = {}
        self._events: dict[str, list[ObservedEvent]] = defaultdict(list)
        self._polls: list[PollRecord] = []
        self._unit_station = unit_station
        self._limit = history_limit

    async def load_active(self) -> list[Incident]:
        return [i for i in self._all.values() if i.status != IncidentStatus.CLOSED]

    async def apply_changes(self, c: ChangeSet, seen_at: datetime) -> None:
        prev = dict(self._all)
        for i in [*c.added, *c.changed, *c.closed]:
            self._all[i.id] = i.model_copy(deep=True)
        for e in events_from_changes(c, seen_at, prev):
            self._events[e.incident_id].append(e)
        closed = sorted(
            (i for i in self._all.values() if i.status == IncidentStatus.CLOSED),
            key=lambda i: i.dispatched_at,
            reverse=True,
        )
        for i in closed[self._limit :]:
            del self._all[i.id]

    async def touch(self, ids: list[str], seen_at: datetime) -> None:
        return None

    async def get_by_id(self, incident_id: str) -> Incident | None:
        return self._all.get(incident_id)

    def _select(self, q: HistoryQuery) -> list[Incident]:
        rows = [i for i in self._all.values() if matches_history(i, q, self._unit_station)]
        return sorted(rows, key=lambda i: i.dispatched_at, reverse=True)

    async def history(self, q: HistoryQuery) -> HistoryPage:
        rows = self._select(q)
        return HistoryPage(rows[q.offset : q.offset + q.limit], len(rows))

    async def analytics(self, q: HistoryQuery) -> Analytics:
        q2 = HistoryQuery(**{**q.__dict__, "include_active": True})
        return compute_analytics(self._select(q2))

    async def events(self, incident_id: str) -> list[ObservedEvent]:
        return sorted(self._events.get(incident_id, []), key=lambda e: e.at)

    async def record_poll(self, p: PollRecord) -> None:
        self._polls.insert(0, p)
        del self._polls[500:]

    async def recent_polls(self, limit: int) -> list[PollRecord]:
        return self._polls[:limit]
