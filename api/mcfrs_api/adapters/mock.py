"""MockAdapter — a deterministic, self-advancing fake CAD feed.

It exists so change detection (new / changed / closed) can be exercised
without an upstream. Each ``fetch_active()`` advances an internal scenario
clock and returns the current active set:

 - incidents progress dispatched -> responding -> onscene
   -> (transporting, EMS only) -> closed on category-specific timescales;
 - closed incidents drop out of the active set after ``remove_closed_after_minutes``;
 - working incidents occasionally gain a unit while on scene;
 - a new incident spawns every ``spawn_every_seconds`` of scenario time, drawn
   from a weighted template pool (EMS most common, Station 14 area
   over-represented).

All randomness comes from a seeded mulberry32 PRNG, so two adapters with the
same seed and the same sequence of clock readings produce identical output.

Port of ``src/adapters/mock/index.ts``; that file is the spec. Scenario time is
kept in integer/float milliseconds exactly as the TypeScript does, so the PRNG
call sequence and the resulting schedules line up 1:1.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import TypeVar

from mcfrs_api.adapters.base import AdapterDescription, FetchResult, ParseReport, SourceAdapter
from mcfrs_api.adapters.mock_fixtures import (
    MOCK_SOURCE,
    build_fixtures,
    build_raw_record,
    category_for_call_type,
    make_unit,
    mock_incident_number,
    unit_status_for,
    utc,
)
from mcfrs_api.models import Incident, IncidentCategory, IncidentStatus, UnitAssignment

# ---------------------------------------------------------------------------
# PRNG

_MASK32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """JS ``Math.imul``: 32-bit wrapping multiply (result taken as unsigned here)."""
    return (a * b) & _MASK32


def mulberry32(seed: int) -> Callable[[], float]:
    """mulberry32: tiny, fast, good enough for a fixture generator. Returns [0, 1).

    Bit-for-bit identical to the TypeScript original: JS's ``|0`` / ``>>>`` mix
    is reproduced by keeping the state as an unsigned 32-bit integer.
    """
    a = seed & _MASK32

    def next_float() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _MASK32
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & _MASK32) ^ t
        return ((t ^ (t >> 14)) & _MASK32) / 4294967296

    return next_float


T = TypeVar("T")


class Rng:
    def __init__(self, seed: int) -> None:
        self._next = mulberry32(seed)

    def float(self) -> float:
        return self._next()

    def range(self, lo: float, hi: float) -> float:
        """Uniform in [lo, hi)."""
        return lo + (hi - lo) * self._next()

    def int(self, lo: int, hi: int) -> int:
        """Integer in [lo, hi] inclusive."""
        return lo + math.floor(self._next() * (hi - lo + 1))

    def pick(self, items: Sequence[T]) -> T:
        if not items:
            raise ValueError("pick from empty list")
        return items[math.floor(self._next() * len(items))]

    def weighted(self, items: Sequence[T], weight: Callable[[T], float]) -> T:
        if not items:
            raise ValueError("weighted pick from empty list")
        total = sum(weight(it) for it in items)
        r = self._next() * total
        for it in items:
            r -= weight(it)
            if r <= 0:
                return it
        return items[-1]


# ---------------------------------------------------------------------------
# Time helpers (JS ``Date`` semantics: integer milliseconds since the epoch)

MINUTE = 60_000
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _to_ms(dt: datetime) -> int:
    """``Date.getTime()``: whole milliseconds since the epoch."""
    return (utc(dt) - _EPOCH) // timedelta(milliseconds=1)


def _to_dt(ms: float) -> datetime:
    """``new Date(ms)``: fractional milliseconds are truncated toward zero."""
    return _EPOCH + timedelta(milliseconds=int(ms))


def _js_round(x: float) -> int:
    """``Math.round``: halves round toward +infinity (Python's ``round`` is banker's)."""
    return math.floor(x + 0.5)


# ---------------------------------------------------------------------------
# Scenario schedule

STATUS_ORDER: tuple[IncidentStatus, ...] = (
    IncidentStatus.DISPATCHING,
    IncidentStatus.DISPATCHED,
    IncidentStatus.RESPONDING,
    IncidentStatus.ONSCENE,
    IncidentStatus.TRANSPORTING,
    IncidentStatus.CLOSED,
)


def status_rank(s: IncidentStatus) -> int:
    try:
        return STATUS_ORDER.index(s)
    except ValueError:
        return 0


@dataclass
class Schedule:
    """Absolute scenario times (ms) at which an incident reaches each stage."""

    responding_at: float
    onscene_at: float
    closed_at: float
    transporting_at: float | None = None
    """EMS only."""
    unit_adds_at: list[float] = field(default_factory=list)
    """Scenario times at which an extra unit is added while on scene."""


@dataclass
class SimIncident:
    incident: Incident
    schedule: Schedule


EMS_CATEGORIES: frozenset[IncidentCategory] = frozenset(
    {IncidentCategory.EMS, IncidentCategory.ALS, IncidentCategory.BLS}
)
WORKING_CATEGORIES: frozenset[IncidentCategory] = frozenset(
    {
        IncidentCategory.STRUCTURE_FIRE,
        IncidentCategory.WORKING_FIRE,
        IncidentCategory.MASS_CASUALTY,
        IncidentCategory.TECHNICAL_RESCUE,
        IncidentCategory.WATER_RESCUE,
        IncidentCategory.HAZMAT,
    }
)


def duration_band(category: IncidentCategory) -> tuple[tuple[float, float], tuple[float, float]]:
    """Duration bands ``(onscene, close)`` in minutes, by category. Tuned for "feels live", not realism audits."""
    if category in EMS_CATEGORIES:
        return (5, 10), (30, 50)
    match category:
        case IncidentCategory.FIRE_ALARM | IncidentCategory.SERVICE:
            return (5, 9), (20, 40)
        case IncidentCategory.COLLISION | IncidentCategory.VEHICLE_FIRE | IncidentCategory.BRUSH_FIRE:
            return (6, 12), (45, 90)
        case IncidentCategory.STRUCTURE_FIRE | IncidentCategory.WORKING_FIRE:
            return (6, 12), (120, 240)
        case (
            IncidentCategory.MASS_CASUALTY
            | IncidentCategory.TECHNICAL_RESCUE
            | IncidentCategory.WATER_RESCUE
            | IncidentCategory.HAZMAT
        ):
            return (6, 12), (90, 180)
        case _:
            return (6, 12), (40, 80)


def make_schedule(rng: Rng, incident: Incident) -> Schedule:
    t0 = _to_ms(incident.dispatched_at)
    onscene_band, close_band = duration_band(incident.category)
    responding_at = t0 + rng.range(1, 3) * MINUTE
    onscene_at = responding_at + rng.range(onscene_band[0], onscene_band[1]) * MINUTE
    closed_at = onscene_at + rng.range(close_band[0], close_band[1]) * MINUTE
    schedule = Schedule(responding_at=responding_at, onscene_at=onscene_at, closed_at=closed_at)

    if incident.category in EMS_CATEGORIES:
        # Transport begins roughly halfway through the on-scene window.
        schedule.transporting_at = onscene_at + (closed_at - onscene_at) * rng.range(0.35, 0.6)
    if incident.category in WORKING_CATEGORIES:
        adds = rng.int(0, 2)
        for _ in range(adds):
            schedule.unit_adds_at.append(onscene_at + rng.range(5, 25) * MINUTE)
        schedule.unit_adds_at.sort()
    return schedule


def scheduled_status(schedule: Schedule, at: float) -> IncidentStatus:
    if at >= schedule.closed_at:
        return IncidentStatus.CLOSED
    if schedule.transporting_at is not None and at >= schedule.transporting_at:
        return IncidentStatus.TRANSPORTING
    if at >= schedule.onscene_at:
        return IncidentStatus.ONSCENE
    if at >= schedule.responding_at:
        return IncidentStatus.RESPONDING
    return IncidentStatus.DISPATCHED


# ---------------------------------------------------------------------------
# Spawn templates


@dataclass(frozen=True)
class Place:
    municipality: str
    lat: float
    lng: float
    station_area: int
    battalion: int
    stations: tuple[int, ...]
    """Nearby stations, used for unit designators. Home station first."""


STATION_14_PLACES: tuple[Place, ...] = (
    Place("Beallsville", 39.171, -77.412, 14, 5, (14, 35, 29, 22)),
    Place("Dickerson", 39.219, -77.424, 14, 5, (14, 35, 29)),
    Place("Barnesville", 39.221, -77.376, 14, 5, (14, 35, 29)),
    Place("Poolesville", 39.145, -77.415, 14, 5, (14, 29, 35)),
    Place("Boyds", 39.187, -77.323, 14, 5, (14, 35, 22)),
)

COUNTY_PLACES: tuple[Place, ...] = (
    Place("Germantown", 39.173, -77.272, 22, 5, (22, 29, 34)),
    Place("Clarksburg", 39.239, -77.279, 35, 5, (35, 29, 22)),
    Place("Gaithersburg", 39.143, -77.201, 8, 4, (8, 28, 31)),
    Place("Rockville", 39.081, -77.152, 31, 4, (31, 3, 23)),
    Place("Silver Spring", 38.994, -77.029, 1, 1, (1, 16, 19)),
    Place("Bethesda", 38.985, -77.1, 6, 2, (6, 20, 41)),
    Place("Olney", 39.152, -77.07, 40, 3, (40, 4, 17)),
    Place("Damascus", 39.288, -77.203, 13, 5, (13, 35, 9)),
    Place("Wheaton", 39.039, -77.055, 18, 3, (18, 24, 12)),
    Place("Takoma Park", 38.978, -77.008, 2, 1, (2, 1, 16)),
)

STREET_NAMES: tuple[str, ...] = (
    "Example Farm Rd",
    "Test Ln",
    "Sample St",
    "Placeholder Ct",
    "Mock Ave",
    "Demo Blvd",
    "Fictional Pl",
    "Sandbox Dr",
    "Example Woods Rd",
    "Sample Hollow Ln",
)


@dataclass(frozen=True)
class UnitSlot:
    prefix: str
    at: int
    """Index into ``Place.stations``."""


@dataclass(frozen=True)
class Template:
    weight: float
    call_type: str
    priority: str
    units: tuple[UnitSlot, ...]
    """Unit prefixes in dispatch order."""
    talkgroup: bool
    """Whether a talkgroup is assigned at dispatch (never for EMS)."""


TEMPLATES: tuple[Template, ...] = (
    Template(30, "BLS", "3", (UnitSlot("A", 0),), False),
    Template(25, "ALS", "2", (UnitSlot("A", 0), UnitSlot("M", 1)), False),
    Template(10, "PIC", "2", (UnitSlot("PE", 0), UnitSlot("A", 0), UnitSlot("M", 1)), True),
    Template(8, "FIRE ALARM", "2", (UnitSlot("E", 0), UnitSlot("T", 1), UnitSlot("E", 2)), True),
    Template(
        5,
        "HOUSE FIRE",
        "1",
        (
            UnitSlot("PE", 0),
            UnitSlot("AT", 0),
            UnitSlot("E", 1),
            UnitSlot("E", 2),
            UnitSlot("T", 1),
            UnitSlot("RS", 2),
            UnitSlot("A", 0),
            UnitSlot("BC", 0),
        ),
        True,
    ),
    Template(4, "BRUSH FIRE", "2", (UnitSlot("B", 0), UnitSlot("E", 1)), True),
    Template(4, "VEHICLE FIRE", "2", (UnitSlot("E", 0), UnitSlot("E", 1)), True),
    Template(3, "GAS LEAK", "2", (UnitSlot("E", 0), UnitSlot("HM", 1), UnitSlot("BC", 0)), True),
    Template(2, "ELEVATOR RESCUE", "3", (UnitSlot("E", 0), UnitSlot("T", 1)), True),
)

ADD_UNIT_PREFIXES: tuple[str, ...] = ("E", "T", "A", "M", "RS", "BC")
"""Prefixes that can be added to a working incident while on scene."""

STATION_14_SPAWN_SHARE = 0.4

_STATION_RE = re.compile(r"[A-Z]+7(\d{2})")


def unit_designator(prefix: str, station: int) -> str:
    return f"{prefix}7{station:02d}"


def designator_for(prefix: str, place: Place, station_idx: int) -> str:
    """Battalion chief designators are BC7<battalion>, not per-station."""
    if prefix == "BC":
        return f"BC70{place.battalion}"
    station = place.stations[min(station_idx, len(place.stations) - 1)] if place.stations else 0
    return unit_designator(prefix, station)


# ---------------------------------------------------------------------------
# Cloning


def clone_incident(i: Incident) -> Incident:
    """A deep copy: units, their assignments and the raw payload are all fresh objects."""
    return i.model_copy(deep=True)


# ---------------------------------------------------------------------------
# Adapter


class MockAdapter(SourceAdapter):
    name = MOCK_SOURCE

    def __init__(
        self,
        *,
        seed: int = 1,
        spawn_every_seconds: float = 45,
        speed: float = 1.0,
        now: Callable[[], datetime] | None = None,
        remove_closed_after_minutes: float = 10,
    ) -> None:
        self._seed = seed
        self._spawn_every_seconds = spawn_every_seconds
        self._spawn_every_ms = spawn_every_seconds * 1000
        self._speed = speed
        self._remove_closed_after_minutes = remove_closed_after_minutes
        self._remove_closed_after_ms = remove_closed_after_minutes * MINUTE
        self._now: Callable[[], datetime] = now if now is not None else lambda: datetime.now(UTC)
        self._rng = Rng(seed)

        self._start_wall = _to_ms(self._now())
        self._start_sim = self._start_wall
        self._last_sim: float = self._start_sim
        self._next_spawn_at: float = self._start_sim + self._spawn_every_ms
        self._next_seq = 200

        fixtures = build_fixtures(_to_dt(self._start_sim))
        self._fixture_count = len(fixtures)
        self._sims: list[SimIncident] = [
            SimIncident(incident=incident, schedule=make_schedule(self._rng, incident)) for incident in fixtures
        ]

    def describe(self) -> AdapterDescription:
        return AdapterDescription(
            name=self.name,
            config={
                "seed": str(self._seed),
                "spawnEverySeconds": _js_number(self._spawn_every_seconds),
                "speed": _js_number(self._speed),
                "removeClosedAfterMinutes": _js_number(self._remove_closed_after_minutes),
                "fixtures": str(self._fixture_count),
            },
            notes=[
                "Simulated feed. Every incident, address and unit assignment is fictional.",
                "Deterministic for a given seed and clock; statuses advance with scenario time.",
            ],
        )

    async def fetch_active(self) -> FetchResult:
        sim_now = self._sim_time()
        self._advance(sim_now)

        incidents = [clone_incident(s.incident) for s in self._sims]
        latency_ms = _js_round(self._rng.range(5, 40))
        report = ParseReport(
            fetched_at=_to_dt(sim_now),
            latency_ms=latency_ms,
            received=len(incidents),
            parsed=len(incidents),
            errors=[],
        )
        raw_sample = incidents[0].raw_payload if incidents else None
        return FetchResult(incidents=incidents, report=report, raw_sample=raw_sample)

    # -- scenario clock -------------------------------------------------------

    def _sim_time(self) -> float:
        """Scenario time: wall time since construction, scaled by ``speed``."""
        wall = _to_ms(self._now())
        return self._start_sim + (wall - self._start_wall) * self._speed

    def _advance(self, sim_now: float) -> None:
        if sim_now < self._last_sim:
            return  # clock went backwards; hold state
        self._spawn_due(sim_now)
        for sim in self._sims:
            self._progress(sim, sim_now)
        self._sims = [s for s in self._sims if self._still_active(s.incident, sim_now)]
        self._last_sim = sim_now

    def _still_active(self, incident: Incident, sim_now: float) -> bool:
        if incident.closed_at is None:
            return True
        return sim_now - _to_ms(incident.closed_at) < self._remove_closed_after_ms

    # -- progression ----------------------------------------------------------

    def _progress(self, sim: SimIncident, sim_now: float) -> None:
        incident, schedule = sim.incident, sim.schedule
        if incident.status is IncidentStatus.CLOSED:
            return

        # Never regress a fixture that started further along than its schedule.
        target = scheduled_status(schedule, sim_now)
        nxt = target if status_rank(target) > status_rank(incident.status) else incident.status
        changed = False

        if nxt is not incident.status:
            incident.status = nxt
            changed = True
            if nxt is IncidentStatus.CLOSED:
                incident.closed_at = _to_dt(max(schedule.closed_at, _to_ms(incident.dispatched_at)))

        if incident.status is not IncidentStatus.CLOSED:
            while schedule.unit_adds_at and schedule.unit_adds_at[0] <= sim_now:
                at = schedule.unit_adds_at.pop(0)
                self._add_unit(incident, at)
                changed = True

        if self._refresh_unit_statuses(incident, sim_now):
            changed = True

        if changed:
            incident.updated_at = _to_dt(sim_now)
            incident.raw_payload = build_raw_record(incident)

    def _refresh_unit_statuses(self, incident: Incident, sim_now: float) -> bool:
        """Units follow the incident stage; late-added units catch up on their own clock."""
        incident_label = unit_status_for(incident.status)
        changed = False
        for u in incident.units:
            label = incident_label
            since = sim_now - _to_ms(u.dispatched_at) if u.dispatched_at is not None else math.inf
            if incident.status is not IncidentStatus.CLOSED and u.dispatched_at is not None and since < 6 * MINUTE:
                label = "dispatched" if since < 1 * MINUTE else "enroute"
                if status_rank(incident.status) < status_rank(IncidentStatus.RESPONDING):
                    label = "dispatched"
            if u.status != label:
                u.status = label
                changed = True
        return changed

    def _add_unit(self, incident: Incident, at: float) -> None:
        stations: list[int] = []
        for u in incident.units:
            m = _STATION_RE.fullmatch(u.unit)
            if m is not None:
                stations.append(int(m.group(1)))
        pool: Sequence[int] = stations if stations else [14]
        for _ in range(6):
            prefix = self._rng.pick(ADD_UNIT_PREFIXES)
            if prefix == "BC":
                unit = f"BC70{incident.battalion if incident.battalion is not None else 5}"
            else:
                unit = unit_designator(prefix, self._rng.pick(pool))
            if any(u.unit == unit for u in incident.units):
                continue
            incident.units.append(make_unit(unit, _to_dt(at), "dispatched"))
            return

    # -- spawning -------------------------------------------------------------

    def _spawn_due(self, sim_now: float) -> None:
        while self._next_spawn_at <= sim_now:
            self._spawn(self._next_spawn_at)
            self._next_spawn_at += self._spawn_every_ms

    def _spawn(self, at: float) -> None:
        template = self._rng.weighted(TEMPLATES, lambda t: t.weight)
        place = (
            self._rng.pick(STATION_14_PLACES)
            if self._rng.float() < STATION_14_SPAWN_SHARE
            else self._rng.pick(COUNTY_PLACES)
        )
        dispatched_at = _to_dt(at)
        seq = self._next_seq
        self._next_seq += 1
        incident_number = mock_incident_number(dispatched_at, seq)

        units: list[UnitAssignment] = []
        for slot in template.units:
            unit = designator_for(slot.prefix, place, slot.at)
            if any(u.unit == unit for u in units):
                continue
            units.append(make_unit(unit, dispatched_at, "dispatched"))

        # Field evaluation order below matches the TS object literal, so the PRNG
        # is consumed in the same sequence: address number, street, lat, lng, talkgroup.
        address = f"{self._rng.int(100, 19999)} {self._rng.pick(STREET_NAMES)}"
        latitude = float(f"{place.lat + self._rng.range(-0.02, 0.02):.5f}")
        longitude = float(f"{place.lng + self._rng.range(-0.025, 0.025):.5f}")
        talkgroup = f"7A{place.battalion} Inc {self._rng.int(1, 16)}" if template.talkgroup else None

        incident = Incident(
            id=f"{MOCK_SOURCE}:{incident_number}",
            incident_number=incident_number,
            dispatched_at=dispatched_at,
            updated_at=dispatched_at,
            call_type=template.call_type,
            category=category_for_call_type(template.call_type),
            priority=template.priority,
            status=IncidentStatus.DISPATCHED,
            address=address,
            municipality=place.municipality,
            latitude=latitude,
            longitude=longitude,
            geo_source="source",
            station_area=place.station_area,
            battalion=place.battalion,
            units=units,
            talkgroup=talkgroup,
            raw_source=MOCK_SOURCE,
        )
        incident.raw_payload = build_raw_record(incident)
        self._sims.append(SimIncident(incident=incident, schedule=make_schedule(self._rng, incident)))


def _js_number(x: float) -> str:
    """JS ``String(number)``: integral values print without a trailing ``.0``."""
    return str(int(x)) if float(x).is_integer() else str(x)


__all__ = [
    "ADD_UNIT_PREFIXES",
    "COUNTY_PLACES",
    "EMS_CATEGORIES",
    "MINUTE",
    "STATION_14_PLACES",
    "STATION_14_SPAWN_SHARE",
    "STATUS_ORDER",
    "STREET_NAMES",
    "TEMPLATES",
    "WORKING_CATEGORIES",
    "MockAdapter",
    "Place",
    "Rng",
    "Schedule",
    "SimIncident",
    "Template",
    "UnitSlot",
    "clone_incident",
    "designator_for",
    "duration_band",
    "make_schedule",
    "mulberry32",
    "scheduled_status",
    "status_rank",
    "unit_designator",
]
