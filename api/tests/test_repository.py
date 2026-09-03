"""Contract every repository must satisfy. Memory always; Postgres when DATABASE_URL is set."""

import os
from datetime import UTC, datetime

import pytest

from mcfrs_api.db.repository import HistoryQuery, MemoryRepository, PollRecord, compute_analytics, events_from_changes
from mcfrs_api.models import IncidentStatus, UnitAssignment
from mcfrs_api.services.change_detection import ChangeSet
from tests.conftest import mk


def t(s: str) -> datetime:
    h, m, sec = map(int, s.split(":"))
    return datetime(2026, 9, 3, h, m, sec, tzinfo=UTC)


def unit_station(u: str):
    n = int("".join(ch for ch in u if ch.isdigit()) or 0)
    return n - 700 if 700 <= n <= 799 else None


async def make_memory():
    return MemoryRepository(unit_station), None


async def make_postgres():
    from mcfrs_api.db.postgres import PostgresRepository, make_engine

    engine = make_engine(os.environ["DATABASE_URL"])
    repo = PostgresRepository(engine, unit_station)
    await repo.purge_prefix("t:")
    return repo, engine.dispose


IMPLS = [make_memory] + ([make_postgres] if os.environ.get("DATABASE_URL") else [])


@pytest.mark.parametrize("factory", IMPLS, ids=lambda f: f.__name__.removeprefix("make_"))
async def test_contract(factory):
    repo, dispose = await factory()
    try:
        b_units = [UnitAssignment(unit="PE729"), UnitAssignment(unit="A714")]
        await repo.apply_changes(ChangeSet(added=[mk("t:a"), mk("t:b", units=b_units)]), t("17:31:10"))
        assert sorted(i.id for i in await repo.load_active()) == ["t:a", "t:b"]
        closed_b = mk("t:b", units=b_units, status=IncidentStatus.CLOSED, closed_at=t("18:00:00"))
        await repo.apply_changes(
            ChangeSet(changed=[mk("t:a", status=IncidentStatus.ONSCENE)], closed=[closed_b]), t("18:00:00")
        )
        assert [i.id for i in await repo.load_active()] == ["t:a"]
        h = await repo.history(HistoryQuery())
        assert h.total == 1 and h.incidents[0].id == "t:b" and h.incidents[0].closed_at == t("18:00:00")
        assert (await repo.get_by_id("t:a")).status == IncidentStatus.ONSCENE

        # filters
        assert (await repo.history(HistoryQuery(unit="pe729"))).total == 1
        assert (await repo.history(HistoryQuery(unit="M701"))).total == 0
        assert (await repo.history(HistoryQuery(station=29))).total == 1
        assert (await repo.history(HistoryQuery(station=14))).total == 1
        assert (await repo.history(HistoryQuery(municipality="poolesville"))).total == 1
        assert (await repo.history(HistoryQuery(address="test"))).total == 1
        assert (await repo.history(HistoryQuery(text="als pe729"))).total == 1
        assert (await repo.history(HistoryQuery(from_=t("18:00:00")))).total == 0
        assert (await repo.history(HistoryQuery(include_active=True))).total == 2

        # events
        assert [e.kind for e in await repo.events("t:b")] == ["created", "unit_dispatched", "unit_dispatched", "closed"]
        await repo.apply_changes(
            ChangeSet(changed=[mk("t:a", status=IncidentStatus.ONSCENE, units=[UnitAssignment(unit="M729")])]),
            t("18:05:00"),
        )
        assert [u.unit for u in (await repo.get_by_id("t:a")).units] == ["M729"]
        assert any(e.kind == "unit_added" and e.unit == "M729" for e in await repo.events("t:a"))

        # polls
        await repo.record_poll(PollRecord(t("18:00:00"), "t", True, latency_ms=5))
        await repo.record_poll(PollRecord(t("18:00:15"), "t", False, error="boom"))
        p = await repo.recent_polls(2)
        assert p[0].ok is False and p[1].latency_ms == 5

        a = await repo.analytics(HistoryQuery(include_active=True))
        assert a.total == 2 and a.per_category[0] == {"category": "als", "count": 2}
    finally:
        if dispose:
            await dispose()


def test_events_from_changes_status_vs_update():
    prev = {"a": mk("a")}
    ev = events_from_changes(ChangeSet(changed=[mk("a", status=IncidentStatus.RESPONDING)]), t("17:40:00"), prev)
    assert [e.kind for e in ev] == ["status"]


def test_compute_analytics():
    a = compute_analytics(
        [mk("a"), mk("b", dispatched_at=datetime(2026, 9, 5, 3, 0, tzinfo=UTC))]
    )  # Sept 5 2026 = Saturday
    assert a.weekday + a.weekend == 2 and sum(a.per_hour) == 2 and a.busiest_units[0] == {"unit": "A714", "count": 2}
