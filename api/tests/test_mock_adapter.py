"""Port of ``src/adapters/mock/mock.test.ts``."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from mcfrs_api.adapters.mock import MockAdapter, mulberry32
from mcfrs_api.adapters.mock_fixtures import build_fixtures
from mcfrs_api.models import Incident, IncidentCategory, IncidentStatus, UnitAssignment

T0 = datetime(2026, 9, 3, 14, 0, 0, tzinfo=UTC)

NO_SPAWN = 10**9

STATUS_RANK = ["dispatching", "dispatched", "responding", "onscene", "transporting", "closed"]


class FakeClock:
    """A controllable clock for injecting into the adapter."""

    def __init__(self, start: datetime) -> None:
        self._t = start

    def now(self) -> datetime:
        return self._t

    def advance_minutes(self, m: float) -> None:
        self._t += timedelta(minutes=m)

    def advance_seconds(self, s: float) -> None:
        self._t += timedelta(seconds=s)


def is_ems(i: Incident) -> bool:
    return i.category in (IncidentCategory.EMS, IncidentCategory.ALS, IncidentCategory.BLS)


def uses_station_14(i: Incident) -> bool:
    return any(u.unit.endswith("714") and u.unit[:-3].isalpha() and u.unit[:-3].isupper() for u in i.units)


def rank(s: IncidentStatus) -> int:
    return STATUS_RANK.index(s.value)


def snapshot(i: Incident) -> dict[str, Any]:
    d = i.model_dump()
    d["raw_payload"] = i.raw_payload
    return d


# ---------------------------------------------------------------------------
# PRNG


def test_mulberry32_matches_reference_sequence() -> None:
    # Reference values produced by the TypeScript mulberry32 in src/adapters/mock/index.ts (node).
    # The last two seeds exceed 32 bits / are all-ones, so they exercise the JS `>>> 0` masking.
    reference = {
        1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849],
        42: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423],
        4294967295: [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677, 0.8452364315744489],
        2**33 + 5: [
            0.6897749109193683,
            0.7727432732935995,
            0.21976301027461886,
            0.6231788222212344,
            0.08513720124028623,
        ],
    }
    for seed, expected in reference.items():
        nxt = mulberry32(seed)
        assert [nxt() for _ in range(5)] == expected


# ---------------------------------------------------------------------------
# build_fixtures


def test_fixtures_have_valid_categories_and_statuses() -> None:
    fixtures = build_fixtures(T0)
    assert len(fixtures) >= 12
    for i in fixtures:
        assert isinstance(i.category, IncidentCategory)
        assert i.category.value in {c.value for c in IncidentCategory}
        assert isinstance(i.status, IncidentStatus)
        assert i.id.startswith("mock:")
        assert i.raw_source == "mock"
        assert len(i.units) > 0
        assert i.dispatched_at <= T0
        assert isinstance(i.raw_payload, dict)


def test_fixtures_have_unique_ids() -> None:
    ids = [i.id for i in build_fixtures(T0)]
    assert len(set(ids)) == len(ids)


def test_fixtures_include_station_14_units() -> None:
    fixtures = build_fixtures(T0)
    assert len([i for i in fixtures if uses_station_14(i)]) >= 3


def test_fixtures_never_invent_talkgroups_for_ems() -> None:
    for i in build_fixtures(T0):
        if is_ems(i):
            assert i.talkgroup is None
            assert i.channel is None


def test_fixtures_include_second_alarm_and_closed_incidents() -> None:
    fixtures = build_fixtures(T0)
    second = next((i for i in fixtures if i.alarm_level == "2nd alarm"), None)
    assert second is not None
    assert len(second.units) >= 15
    closed = [i for i in fixtures if i.status is IncidentStatus.CLOSED]
    assert len(closed) >= 2
    for c in closed:
        assert isinstance(c.closed_at, datetime)
        assert c.closed_at.tzinfo is not None


def test_fixture_datetimes_are_utc_aware() -> None:
    for i in build_fixtures(T0):
        assert i.dispatched_at.tzinfo is not None
        assert i.dispatched_at.utcoffset() == timedelta(0)
        for u in i.units:
            assert u.dispatched_at is not None and u.dispatched_at.utcoffset() == timedelta(0)


# ---------------------------------------------------------------------------
# MockAdapter


def test_describe_without_secrets() -> None:
    adapter = MockAdapter(seed=7, spawn_every_seconds=30, now=FakeClock(T0).now)
    d = adapter.describe()
    assert d.name == "mock"
    assert d.config["seed"] == "7"
    assert d.config["spawnEverySeconds"] == "30"
    assert d.config["fixtures"] == str(len(build_fixtures(T0)))


async def test_first_poll_returns_all_fixtures_with_report_and_raw_sample() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=1, spawn_every_seconds=NO_SPAWN, now=clock.now)
    result = await adapter.fetch_active()
    expected = sorted(i.id for i in build_fixtures(T0))
    assert sorted(i.id for i in result.incidents) == expected
    assert result.report.received == len(expected)
    assert result.report.parsed == len(expected)
    assert result.report.errors == []
    assert 5 <= result.report.latency_ms <= 40
    assert result.report.fetched_at == T0
    assert result.raw_sample == result.incidents[0].raw_payload


async def test_statuses_progress_forward_and_never_backwards() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=3, spawn_every_seconds=NO_SPAWN, now=clock.now)

    previous = {i.id: i.status for i in (await adapter.fetch_active()).incidents}
    saw_change = False
    for _ in range(12):
        clock.advance_minutes(5)
        current = {i.id: i.status for i in (await adapter.fetch_active()).incidents}
        for iid, status in current.items():
            before = previous.get(iid)
            if before is None:
                continue
            assert rank(status) >= rank(before)
            if status is not before:
                saw_change = True
        previous = current
    assert saw_change


async def test_closes_ems_within_60_minutes_and_drops_closed_after_10() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=11, spawn_every_seconds=NO_SPAWN, now=clock.now)
    initial = await adapter.fetch_active()
    ems_ids = {i.id for i in initial.incidents if is_ems(i)}
    assert ems_ids

    clock.advance_minutes(60)
    later = await adapter.fetch_active()
    for i in later.incidents:
        if i.id in ems_ids:
            assert i.status is IncidentStatus.CLOSED
            assert isinstance(i.closed_at, datetime)
            assert all(u.status == "available" for u in i.units)

    clock.advance_minutes(15)
    gone = await adapter.fetch_active()
    assert not any(i.id in ems_ids for i in gone.incidents)
    # Long-running fires are still on the board.
    assert any(i.alarm_level == "2nd alarm" for i in gone.incidents)


async def test_spawns_new_incident_after_spawn_every_seconds() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=5, spawn_every_seconds=45, now=clock.now)
    before = {i.id for i in (await adapter.fetch_active()).incidents}

    clock.advance_seconds(44)
    not_yet = await adapter.fetch_active()
    assert [i for i in not_yet.incidents if i.id not in before] == []

    clock.advance_seconds(1)
    after = await adapter.fetch_active()
    spawned = [i for i in after.incidents if i.id not in before]
    assert len(spawned) == 1
    fresh = spawned[0]
    assert fresh.status is IncidentStatus.DISPATCHED
    assert fresh.dispatched_at == T0 + timedelta(seconds=45)
    assert len(fresh.units) > 0
    assert isinstance(fresh.category, IncidentCategory)
    assert fresh.raw_source == "mock"
    assert isinstance(fresh.raw_payload, dict)
    if is_ems(fresh):
        assert fresh.talkgroup is None

    clock.advance_seconds(90)
    two_more = await adapter.fetch_active()
    assert len([i for i in two_more.incidents if i.id not in before]) == 3


async def test_honours_speed_multiplier() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=5, spawn_every_seconds=60, speed=10, now=clock.now)
    before = {i.id for i in (await adapter.fetch_active()).incidents}
    clock.advance_seconds(6)
    after = await adapter.fetch_active()
    assert len([i for i in after.incidents if i.id not in before]) == 1


async def test_occasionally_adds_units_to_working_incidents() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=2, spawn_every_seconds=NO_SPAWN, now=clock.now)
    initial = {i.id: len(i.units) for i in (await adapter.fetch_active()).incidents}
    grew = False
    for _ in range(12):
        if grew:
            break
        clock.advance_minutes(5)
        for i in (await adapter.fetch_active()).incidents:
            was = initial.get(i.id)
            if was is not None and len(i.units) > was:
                grew = True
    assert grew


async def test_deterministic_for_same_seed_and_clock() -> None:
    async def run() -> list[dict[str, Any]]:
        clock = FakeClock(T0)
        adapter = MockAdapter(seed=42, spawn_every_seconds=30, now=clock.now)
        out: list[dict[str, Any]] = []
        for _ in range(8):
            r = await adapter.fetch_active()
            out.append({"latency": r.report.latency_ms, "incidents": [snapshot(i) for i in r.incidents]})
            clock.advance_minutes(7)
        return out

    a = await run()
    b = await run()
    assert a == b


async def test_differs_for_different_seed() -> None:
    async def run(seed: int) -> list[dict[str, Any]]:
        clock = FakeClock(T0)
        adapter = MockAdapter(seed=seed, spawn_every_seconds=30, now=clock.now)
        clock.advance_minutes(10)
        return [snapshot(i) for i in (await adapter.fetch_active()).incidents]

    assert await run(1) != await run(2)


async def test_never_hands_out_shared_references() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=9, spawn_every_seconds=NO_SPAWN, now=clock.now)
    first = await adapter.fetch_active()
    second = await adapter.fetch_active()
    a = first.incidents[0]
    b = next(i for i in second.incidents if i.id == a.id)
    assert a is not b
    assert a.units is not b.units
    assert a.units[0] is not b.units[0]
    assert a.raw_payload is not b.raw_payload

    # Mutating a returned object must not leak into the next poll.
    a.status = IncidentStatus.UNKNOWN
    a.units.append(UnitAssignment(unit="ZZ999"))
    a.raw_payload["Status"] = "TAMPERED"
    third = await adapter.fetch_active()
    c = next(i for i in third.incidents if i.id == a.id)
    assert c.status is not IncidentStatus.UNKNOWN
    assert not any(u.unit == "ZZ999" for u in c.units)
    assert c.raw_payload["Status"] != "TAMPERED"


async def test_clock_going_backwards_holds_state() -> None:
    clock = FakeClock(T0)
    adapter = MockAdapter(seed=4, spawn_every_seconds=NO_SPAWN, now=clock.now)
    clock.advance_minutes(30)
    forward = await adapter.fetch_active()
    clock.advance_minutes(-20)
    held = await adapter.fetch_active()
    assert [snapshot(i) for i in held.incidents] == [snapshot(i) for i in forward.incidents]
