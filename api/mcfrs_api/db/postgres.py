"""PostgreSQL repository (SQLAlchemy 2 async, psycopg 3)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from mcfrs_api.db.repository import (
    Analytics,
    HistoryPage,
    HistoryQuery,
    IncidentRepository,
    ObservedEvent,
    PollRecord,
    compute_analytics,
    events_from_changes,
)
from mcfrs_api.db.schema import EventRow, IncidentRow, SourcePollRow, UnitRow
from mcfrs_api.models import Incident, IncidentCategory, IncidentStatus, UnitAssignment, UnitCategory
from mcfrs_api.services.change_detection import ChangeSet


def make_engine(url: str) -> AsyncEngine:
    """Accepts postgresql:// and normalizes to the async psycopg driver."""
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return create_async_engine(url, pool_pre_ping=True)


def _to_incident(r: IncidentRow) -> Incident:
    return Incident(
        id=r.id,
        incident_number=r.incident_number,
        dispatched_at=r.dispatched_at,
        updated_at=r.updated_at,
        closed_at=r.closed_at,
        call_type=r.call_type,
        call_subtype=r.call_subtype,
        category=IncidentCategory(r.category),
        priority=r.priority,
        status=IncidentStatus(r.status),
        address=r.address,
        cross_street=r.cross_street,
        municipality=r.municipality,
        latitude=r.latitude,
        longitude=r.longitude,
        geo_source=r.geo_source,
        station_area=r.station_area,
        battalion=r.battalion,
        talkgroup=r.talkgroup,
        channel=r.channel,
        alarm_level=r.alarm_level,
        raw_source=r.raw_source,
        raw_payload=r.raw_payload,
        units=[
            UnitAssignment(
                unit=u.unit,
                station=u.station,
                type=u.type,
                category=UnitCategory(u.category) if u.category else UnitCategory.UNKNOWN,
                dispatched_at=u.dispatched_at,
                status=u.status,
            )
            for u in r.units
        ],
    )


def _fill(row: IncidentRow, i: Incident, seen_at: datetime) -> None:
    for k in (
        "incident_number",
        "dispatched_at",
        "updated_at",
        "closed_at",
        "call_type",
        "call_subtype",
        "priority",
        "address",
        "cross_street",
        "municipality",
        "latitude",
        "longitude",
        "geo_source",
        "station_area",
        "battalion",
        "talkgroup",
        "channel",
        "alarm_level",
        "raw_source",
    ):
        setattr(row, k, getattr(i, k))
    row.category = str(i.category)
    row.status = str(i.status)
    row.raw_payload = i.raw_payload if isinstance(i.raw_payload, dict | list) else None
    row.last_seen_at = seen_at


class PostgresRepository(IncidentRepository):
    kind = "postgres"

    def __init__(self, engine: AsyncEngine, unit_station: Callable[[str], int | None]) -> None:
        self.engine = engine
        self.sessions = async_sessionmaker(engine, expire_on_commit=False)
        self._unit_station = unit_station

    async def purge_prefix(self, prefix: str) -> None:
        """Test helper: remove rows whose id starts with prefix (and polls from adapter 't')."""
        async with self.sessions.begin() as s:
            await s.execute(delete(IncidentRow).where(IncidentRow.id.like(f"{prefix}%")))
            await s.execute(delete(SourcePollRow).where(SourcePollRow.adapter == "t"))

    async def load_active(self) -> list[Incident]:
        async with self.sessions() as s:
            rows = (await s.execute(select(IncidentRow).where(IncidentRow.status != "closed"))).scalars().all()
            return [_to_incident(r) for r in rows]

    async def apply_changes(self, c: ChangeSet, seen_at: datetime) -> None:
        items = [*c.added, *c.changed, *c.closed]
        if not items:
            return
        async with self.sessions.begin() as s:
            existing = (
                (await s.execute(select(IncidentRow).where(IncidentRow.id.in_([i.id for i in items])))).scalars().all()
            )
            by_id = {r.id: r for r in existing}
            prev = {r.id: _to_incident(r) for r in existing}
            for i in items:
                row = by_id.get(i.id)
                if row is None:
                    row = IncidentRow(id=i.id, first_seen_at=seen_at)
                    s.add(row)
                _fill(row, i, seen_at)
                want = {u.unit: u for u in i.units}
                keep = []
                for u in list(row.units):
                    if u.unit in want:
                        keep.append(u)
                    else:
                        row.units.remove(u)
                have = {u.unit for u in keep}
                for unit, u in want.items():
                    data = dict(
                        station=u.station if u.station is not None else self._unit_station(u.unit),
                        type=u.type,
                        category=str(u.category) if u.category else None,
                        dispatched_at=u.dispatched_at,
                        status=u.status,
                    )
                    if unit in have:
                        ur = next(x for x in keep if x.unit == unit)
                        for k, v in data.items():
                            setattr(ur, k, v)
                    else:
                        row.units.append(UnitRow(unit=unit, **data))
            for e in events_from_changes(c, seen_at, prev):
                s.add(EventRow(incident_id=e.incident_id, at=e.at, kind=e.kind, text=e.text, unit=e.unit))

    async def touch(self, ids: list[str], seen_at: datetime) -> None:
        if not ids:
            return
        async with self.sessions.begin() as s:
            await s.execute(update(IncidentRow).where(IncidentRow.id.in_(ids)).values(last_seen_at=seen_at))

    async def get_by_id(self, incident_id: str) -> Incident | None:
        async with self.sessions() as s:
            r = await s.get(IncidentRow, incident_id)
            return _to_incident(r) if r else None

    def _where(self, q: HistoryQuery):
        conds = []
        if not q.include_active:
            conds.append(IncidentRow.status == "closed")
        if q.from_:
            conds.append(IncidentRow.dispatched_at >= q.from_)
        if q.to:
            conds.append(IncidentRow.dispatched_at <= q.to)
        if q.unit:
            conds.append(IncidentRow.units.any(func.upper(UnitRow.unit) == q.unit.upper()))
        if q.station is not None:
            conds.append(
                or_(IncidentRow.station_area == q.station, IncidentRow.units.any(UnitRow.station == q.station))
            )
        if q.station_area is not None:
            conds.append(IncidentRow.station_area == q.station_area)
        if q.category:
            conds.append(IncidentRow.category == q.category)
        if q.municipality:
            conds.append(func.lower(IncidentRow.municipality) == q.municipality.lower())
        if q.address:
            conds.append(IncidentRow.address.ilike(f"%{q.address}%"))
        if q.text:
            for term in q.text.split():
                like = f"%{term}%"
                conds.append(
                    or_(
                        IncidentRow.incident_number.ilike(like),
                        IncidentRow.address.ilike(like),
                        IncidentRow.municipality.ilike(like),
                        IncidentRow.call_type.ilike(like),
                        IncidentRow.call_subtype.ilike(like),
                        IncidentRow.units.any(UnitRow.unit.ilike(like)),
                    )
                )
        return conds

    async def history(self, q: HistoryQuery) -> HistoryPage:
        conds = self._where(q)
        async with self.sessions() as s:
            total = (await s.execute(select(func.count()).select_from(IncidentRow).where(*conds))).scalar_one()
            rows = (
                (
                    await s.execute(
                        select(IncidentRow)
                        .where(*conds)
                        .order_by(IncidentRow.dispatched_at.desc())
                        .offset(q.offset)
                        .limit(min(q.limit, 1000))
                    )
                )
                .scalars()
                .all()
            )
            return HistoryPage([_to_incident(r) for r in rows], total)

    async def analytics(self, q: HistoryQuery) -> Analytics:
        q2 = HistoryQuery(**{**q.__dict__, "include_active": True})
        async with self.sessions() as s:
            rows = (
                (
                    await s.execute(
                        select(IncidentRow)
                        .where(*self._where(q2))
                        .order_by(IncidentRow.dispatched_at.desc())
                        .limit(50_000)
                    )
                )
                .scalars()
                .all()
            )
            return compute_analytics([_to_incident(r) for r in rows])

    async def events(self, incident_id: str) -> list[ObservedEvent]:
        async with self.sessions() as s:
            rows = (
                (await s.execute(select(EventRow).where(EventRow.incident_id == incident_id).order_by(EventRow.at)))
                .scalars()
                .all()
            )
            return [ObservedEvent(r.incident_id, r.at, r.kind, r.text, r.unit) for r in rows]

    async def record_poll(self, p: PollRecord) -> None:
        async with self.sessions.begin() as s:
            s.add(
                SourcePollRow(
                    at=p.at,
                    adapter=p.adapter,
                    ok=p.ok,
                    latency_ms=p.latency_ms,
                    received=p.received,
                    parsed=p.parsed,
                    error=p.error,
                )
            )

    async def recent_polls(self, limit: int) -> list[PollRecord]:
        async with self.sessions() as s:
            rows = (
                (await s.execute(select(SourcePollRow).order_by(SourcePollRow.at.desc()).limit(limit))).scalars().all()
            )
            return [PollRecord(r.at, r.adapter, r.ok, r.latency_ms, r.received, r.parsed, r.error) for r in rows]


def utcnow() -> datetime:
    return datetime.now(UTC)
