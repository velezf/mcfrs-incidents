"""OBVIOUSLY FICTIONAL incidents for the mock adapter.

Municipalities and rough coordinates are real Montgomery County, MD places so
the map looks right; every address, incident number and unit assignment is
invented. Nothing here is a record of anything that happened.

Station 14 (Beallsville) and its neighbours are over-represented on purpose so
the Station 14 mode has something to show.

Port of ``src/adapters/mock/fixtures.ts``; that file is the spec.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from mcfrs_api.models import Incident, IncidentCategory, IncidentStatus, UnitAssignment, UnitCategory
from mcfrs_api.parsers.call_type import classify_call_type
from mcfrs_api.parsers.unit import parse_unit

MOCK_SOURCE = "mock"


def utc(dt: datetime) -> datetime:
    """Coerce to an aware UTC datetime (naive input is taken as UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def iso_z(dt: datetime) -> str:
    """JS ``Date.toISOString()``: UTC, millisecond precision, trailing ``Z``."""
    dt = utc(dt)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def category_for_call_type(call_type: str) -> IncidentCategory:
    """Category comes from the shared classifier so the mock and real adapters agree."""
    return IncidentCategory(classify_call_type(call_type).category)


def make_unit(unit: str, dispatched_at: datetime, status: str) -> UnitAssignment:
    """Build a unit assignment, filling station/type from the shared designator parser when known."""
    parsed = parse_unit(unit)
    return UnitAssignment(
        unit=unit,
        station=parsed.station,
        type=parsed.type if parsed.known else None,
        category=UnitCategory(parsed.category),
        dispatched_at=dispatched_at,
        status=status,
    )


def unit_status_for(status: IncidentStatus) -> str:
    """Map an incident status to the unit-level status label a CAD feed would show."""
    match status:
        case IncidentStatus.DISPATCHING | IncidentStatus.DISPATCHED:
            return "dispatched"
        case IncidentStatus.RESPONDING:
            return "enroute"
        case IncidentStatus.ONSCENE:
            return "onscene"
        case IncidentStatus.TRANSPORTING:
            return "transporting"
        case IncidentStatus.CLOSED:
            return "available"
        case _:
            return "unknown"


def _yymmdd(d: datetime) -> str:
    return utc(d).strftime("%y%m%d")


def mock_incident_number(at: datetime, seq: int) -> str:
    """e.g. F26090300123 — "F" + yymmdd + 5-digit sequence."""
    return f"F{_yymmdd(at)}{seq:05d}"


def build_raw_record(i: Incident) -> dict[str, str]:
    """A plausible upstream CAD-export record. Strings only, like a real export."""
    raw: dict[str, str] = {
        "IncidentNumber": i.incident_number or "",
        "DispatchTime": iso_z(i.dispatched_at),
        "CallType": i.call_type,
        "Address": i.address or "",
        "City": i.municipality or "",
        "Status": i.status.value.upper(),
        "Units": ",".join(u.unit for u in i.units),
        "Latitude": f"{i.latitude:.5f}" if i.latitude is not None else "",
        "Longitude": f"{i.longitude:.5f}" if i.longitude is not None else "",
    }
    if i.station_area is not None:
        raw["StationArea"] = str(i.station_area)
    if i.talkgroup is not None:
        raw["Talkgroup"] = i.talkgroup
    if i.alarm_level is not None:
        raw["AlarmLevel"] = i.alarm_level
    if i.closed_at is not None:
        raw["ClosedTime"] = iso_z(i.closed_at)
    return raw


@dataclass(frozen=True)
class FixtureSpec:
    seq: int
    """Sequence within the day; becomes the incident number suffix."""
    minutes_ago: float
    call_type: str
    status: IncidentStatus
    address: str
    municipality: str
    lat: float
    lng: float
    units: list[str] = field(default_factory=list)
    station_area: int | None = None
    battalion: int | None = None
    talkgroup: str | None = None
    alarm_level: str | None = None
    priority: str | None = None
    cross_street: str | None = None
    closed_minutes_ago: float | None = None
    """Only for closed incidents: how many minutes ago it closed."""


def _make_incident(now: datetime, spec: FixtureSpec) -> Incident:
    now = utc(now)
    dispatched_at = now - timedelta(minutes=spec.minutes_ago)
    closed_at: datetime | None = None
    if spec.status is IncidentStatus.CLOSED:
        closed_at = now - timedelta(minutes=spec.closed_minutes_ago or 0)
    incident_number = mock_incident_number(dispatched_at, spec.seq)
    unit_status = unit_status_for(spec.status)
    units = [make_unit(unit, dispatched_at, unit_status) for unit in spec.units]

    incident = Incident(
        id=f"{MOCK_SOURCE}:{incident_number}",
        incident_number=incident_number,
        dispatched_at=dispatched_at,
        updated_at=closed_at if closed_at is not None else now,
        closed_at=closed_at,
        call_type=spec.call_type,
        category=category_for_call_type(spec.call_type),
        priority=spec.priority,
        status=spec.status,
        address=spec.address,
        cross_street=spec.cross_street,
        municipality=spec.municipality,
        latitude=spec.lat,
        longitude=spec.lng,
        geo_source="source",
        station_area=spec.station_area,
        battalion=spec.battalion,
        units=units,
        talkgroup=spec.talkgroup,
        alarm_level=spec.alarm_level,
        raw_source=MOCK_SOURCE,
    )
    incident.raw_payload = build_raw_record(incident)
    return incident


# The fixture set, relative to `now` so dispatch times are always recent.
# Closed fixtures closed within the last 10 minutes so they are still "active"
# on the first poll and age out shortly after.
FIXTURE_SPECS: list[FixtureSpec] = [
    # --- Station 14 (Beallsville) first-due area ---------------------------------
    FixtureSpec(
        seq=123,
        minutes_ago=25,
        call_type="HOUSE FIRE",
        status=IncidentStatus.ONSCENE,
        address="12345 Example Farm Rd",
        cross_street="Fictional Orchard Ln",
        municipality="Beallsville",
        lat=39.1712,
        lng=-77.4138,
        station_area=14,
        battalion=5,
        units=["PE714", "AT714", "A714", "TK714", "E735", "TK735", "E722", "T729", "RS729", "M729", "BC705", "B714"],
        talkgroup="7A4 Inc 10",
        alarm_level="1st alarm",
        priority="1",
    ),
    FixtureSpec(
        seq=131,
        minutes_ago=8,
        call_type="PIC W/ENTRAPMENT",
        status=IncidentStatus.RESPONDING,
        address="100 Test Ln",
        cross_street="Fictional Mill Rd",
        municipality="Dickerson",
        lat=39.2201,
        lng=-77.4249,
        station_area=14,
        battalion=5,
        units=["RS729", "A714", "PE714", "M729", "BC705"],
        talkgroup="7A3 Inc 8",
        priority="1",
    ),
    FixtureSpec(
        seq=138,
        minutes_ago=1,
        call_type="BLS",
        status=IncidentStatus.DISPATCHING,
        address="1600 Example Farm Rd",
        municipality="Beallsville",
        lat=39.1745,
        lng=-77.4092,
        station_area=14,
        battalion=5,
        units=["A714"],
        priority="3",
    ),
    FixtureSpec(
        seq=118,
        minutes_ago=30,
        call_type="BRUSH FIRE",
        status=IncidentStatus.ONSCENE,
        address="800 Example Woods Rd",
        municipality="Barnesville",
        lat=39.2185,
        lng=-77.3771,
        station_area=14,
        battalion=5,
        units=["B714", "BR714", "E735", "B735"],
        talkgroup="7A4 Inc 11",
        priority="2",
    ),
    FixtureSpec(
        seq=133,
        minutes_ago=6,
        call_type="WATER RESCUE",
        status=IncidentStatus.RESPONDING,
        address="1000 Test Boat Ramp Rd",
        cross_street="C&O Canal towpath (fictional marker)",
        municipality="Dickerson",
        lat=39.2035,
        lng=-77.4602,
        station_area=14,
        battalion=5,
        units=["RS729", "BT729", "E714", "A714", "BC705"],
        talkgroup="7A5 Inc 12",
        priority="1",
    ),
    FixtureSpec(
        seq=126,
        minutes_ago=22,
        call_type="ALS",
        status=IncidentStatus.TRANSPORTING,
        address="200 Sample St",
        municipality="Poolesville",
        lat=39.1453,
        lng=-77.4162,
        battalion=5,
        units=["A714", "M729"],
        priority="2",
    ),
    FixtureSpec(
        seq=116,
        minutes_ago=48,
        call_type="ALS",
        status=IncidentStatus.CLOSED,
        closed_minutes_ago=8,
        address="1700 Sample Hollow Ln",
        municipality="Boyds",
        lat=39.1866,
        lng=-77.3226,
        battalion=5,
        units=["A735", "M735"],
        priority="2",
    ),
    # --- Up-county / mid-county ---------------------------------------------------
    FixtureSpec(
        seq=128,
        minutes_ago=15,
        call_type="BLS",
        status=IncidentStatus.ONSCENE,
        address="300 Placeholder Ct",
        municipality="Germantown",
        lat=39.1731,
        lng=-77.2716,
        station_area=22,
        units=["A722"],
        priority="3",
    ),
    FixtureSpec(
        seq=137,
        minutes_ago=3,
        call_type="ALS",
        status=IncidentStatus.DISPATCHED,
        address="400 Mock Ave",
        municipality="Rockville",
        lat=39.0812,
        lng=-77.1524,
        station_area=31,
        units=["A731", "M731"],
        priority="2",
    ),
    FixtureSpec(
        seq=129,
        minutes_ago=12,
        call_type="FIRE ALARM",
        status=IncidentStatus.ONSCENE,
        address="500 Demo Blvd",
        municipality="Gaithersburg",
        lat=39.1434,
        lng=-77.2012,
        station_area=8,
        units=["E708", "T708", "E728"],
        talkgroup="7A3 Inc 9",
        priority="2",
    ),
    FixtureSpec(
        seq=112,
        minutes_ago=70,
        call_type="VEHICLE FIRE",
        status=IncidentStatus.CLOSED,
        closed_minutes_ago=6,
        address="1400 Example Hwy",
        municipality="Clarksburg",
        lat=39.2387,
        lng=-77.2794,
        station_area=35,
        units=["E735", "E729"],
        priority="2",
    ),
    FixtureSpec(
        seq=130,
        minutes_ago=10,
        call_type="ALS",
        status=IncidentStatus.ONSCENE,
        address="1200 Mock Manor Dr",
        municipality="Olney",
        lat=39.1521,
        lng=-77.0697,
        station_area=40,
        units=["A740", "M740"],
        priority="2",
    ),
    FixtureSpec(
        seq=136,
        minutes_ago=2,
        call_type="BLS",
        status=IncidentStatus.RESPONDING,
        address="1300 Placeholder Rd",
        municipality="Damascus",
        lat=39.2884,
        lng=-77.2031,
        station_area=13,
        units=["A713"],
        priority="3",
    ),
    # --- Down-county ----------------------------------------------------------------
    FixtureSpec(
        seq=114,
        minutes_ago=55,
        call_type="APARTMENT FIRE",
        status=IncidentStatus.ONSCENE,
        address="1100 Sample Tower Ct",
        cross_street="Fictional Gardens Way",
        municipality="Silver Spring",
        lat=38.9936,
        lng=-77.0288,
        station_area=1,
        battalion=1,
        units=[
            "E701",
            "E716",
            "E719",
            "E702",
            "E721",
            "E724",
            "T701",
            "T716",
            "T719",
            "RS701",
            "RS719",
            "A701",
            "M716",
            "M719",
            "BC701",
            "BC703",
            "DC701",
            "SO701",
        ],
        talkgroup="7A2 Inc 6",
        alarm_level="2nd alarm",
        priority="1",
    ),
    FixtureSpec(
        seq=121,
        minutes_ago=35,
        call_type="MASS CASUALTY",
        status=IncidentStatus.ONSCENE,
        address="900 Test Pkwy",
        cross_street="Sample Transit Center (fictional)",
        municipality="Wheaton",
        lat=39.0386,
        lng=-77.0546,
        station_area=18,
        battalion=3,
        units=["E718", "E724", "T718", "RS718", "A718", "A724", "M718", "M724", "EMS703", "BC703", "MAB702"],
        talkgroup="7A1 Inc 3",
        priority="1",
    ),
    FixtureSpec(
        seq=119,
        minutes_ago=40,
        call_type="TECHNICAL RESCUE",
        status=IncidentStatus.ONSCENE,
        address="600 Sandbox Dr",
        cross_street="Trench collapse, one worker trapped (fictional)",
        municipality="Bethesda",
        lat=38.9852,
        lng=-77.0997,
        station_area=41,
        battalion=2,
        units=["RS741", "E741", "T741", "M741", "A741", "BC702"],
        talkgroup="7A6 Inc 14",
        priority="1",
    ),
    FixtureSpec(
        seq=127,
        minutes_ago=18,
        call_type="GAS LEAK",
        status=IncidentStatus.ONSCENE,
        address="700 Fictional Pl",
        municipality="Silver Spring",
        lat=38.9971,
        lng=-77.0312,
        station_area=1,
        battalion=1,
        units=["E701", "HM701", "BC701"],
        talkgroup="7A2 Inc 5",
        priority="2",
    ),
    FixtureSpec(
        seq=117,
        minutes_ago=50,
        call_type="ALS",
        status=IncidentStatus.CLOSED,
        closed_minutes_ago=5,
        address="1500 Test Ave",
        municipality="Takoma Park",
        lat=38.9779,
        lng=-77.0075,
        station_area=2,
        units=["A702", "M702"],
        priority="2",
    ),
    FixtureSpec(
        seq=120,
        minutes_ago=40,
        call_type="ELEVATOR RESCUE",
        status=IncidentStatus.CLOSED,
        closed_minutes_ago=3,
        address="1800 Example Office Plz",
        municipality="Bethesda",
        lat=38.9812,
        lng=-77.0963,
        station_area=6,
        units=["E706", "T706"],
        priority="3",
    ),
]


def build_fixtures(now: datetime) -> list[Incident]:
    return [_make_incident(now, spec) for spec in FIXTURE_SPECS]


def fixture_incidents() -> list[Incident]:
    """Convenience snapshot relative to the wall clock; prefer ``build_fixtures(now)`` for controlled times."""
    return build_fixtures(datetime.now(UTC))


__all__: list[str] = [
    "FIXTURE_SPECS",
    "MOCK_SOURCE",
    "FixtureSpec",
    "build_fixtures",
    "build_raw_record",
    "category_for_call_type",
    "fixture_incidents",
    "iso_z",
    "make_unit",
    "mock_incident_number",
    "unit_status_for",
    "utc",
]
