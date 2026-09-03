"""Parser for MCFRS apparatus designators ("PE714", "A714", "BC705", "E714B").

A designator is LETTERS + NUMBER [+ TRAILING LETTERS]. The letter prefix names
the apparatus type; the number is the county unit number, where 7xx means
"Montgomery County station xx". The nomenclature table is configurable: pass a
custom table to ``parse_unit`` to override ``DEFAULT_NOMENCLATURE`` entirely.

Port of ``src/parsers/unit.ts``; that file is the behavioural spec.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from mcfrs_api.models import UnitCategory


@dataclass(frozen=True)
class UnitNomenclature:
    """One row of the apparatus nomenclature table."""

    prefix: str
    """Letter prefix as dispatched, upper case, e.g. "PE"."""
    type: str
    """Human label, e.g. "Paramedic Engine"."""
    category: UnitCategory
    role: str | None = None
    """Optional qualifier, e.g. "ALS" / "BLS"."""


@dataclass(frozen=True)
class ParsedUnit:
    unit: str
    """Normalized designator (trimmed, upper case, whitespace and separators removed)."""
    prefix: str
    """Letter prefix, upper case; "" when the designator has none."""
    station: int | None
    """Home station (1..MAX_STATION) when derivable from the unit number."""
    number: int | None
    """Raw numeric part of the designator, e.g. 714."""
    type: str
    """Apparatus type label; "Unknown" when the prefix is not in the nomenclature."""
    category: UnitCategory
    suffix: str | None
    """Trailing letters, e.g. "B" in "E714B"."""
    known: bool
    """True when the prefix was found in the nomenclature."""
    role: str | None = None
    """Optional qualifier from the nomenclature, e.g. "ALS"."""


MAX_STATION = 54
"""Highest MCFRS station number considered plausible."""

COUNTY_UNIT_BASE = 700
"""County prefix: unit 7xx belongs to station xx."""

UNKNOWN_TYPE = "Unknown"

DEFAULT_NOMENCLATURE: list[UnitNomenclature] = [
    # Suppression
    # Station 14 (UMCVFD) roster designators, sourced 2026-09-03 (src/data/stations.ts header)
    UnitNomenclature("PRE", "Paramedic Rescue Engine", UnitCategory.ENGINE, role="ALS"),
    UnitNomenclature("RE", "Rescue Engine", UnitCategory.ENGINE),
    UnitNomenclature("BE", "Brush Engine", UnitCategory.SPECIAL),
    UnitNomenclature("BT", "Boat", UnitCategory.SPECIAL),
    UnitNomenclature("BS", "Boat Support", UnitCategory.SUPPORT),
    UnitNomenclature("CT", "Canteen", UnitCategory.SUPPORT),
    UnitNomenclature("UT", "Utility", UnitCategory.SUPPORT),
    UnitNomenclature("SU", "Support Unit", UnitCategory.SUPPORT),
    UnitNomenclature("UTV", "UTV", UnitCategory.SPECIAL),
    UnitNomenclature("CH", "Chief", UnitCategory.CHIEF),
    UnitNomenclature("PE", "Paramedic Engine", UnitCategory.ENGINE, role="ALS"),
    UnitNomenclature("E", "Engine", UnitCategory.ENGINE),
    UnitNomenclature("T", "Truck", UnitCategory.TRUCK),
    UnitNomenclature("AT", "Aerial Tower", UnitCategory.TRUCK),
    UnitNomenclature("TW", "Tower", UnitCategory.TRUCK),
    # Rescue
    UnitNomenclature("RS", "Rescue Squad", UnitCategory.RESCUE),
    UnitNomenclature("R", "Rescue", UnitCategory.RESCUE),
    # EMS transport
    UnitNomenclature("A", "Ambulance", UnitCategory.AMBULANCE, role="BLS"),
    UnitNomenclature("M", "Medic", UnitCategory.MEDIC, role="ALS"),
    # Chiefs and command
    UnitNomenclature("BC", "Battalion Chief", UnitCategory.CHIEF),
    UnitNomenclature("DC", "Duty Chief", UnitCategory.CHIEF),
    UnitNomenclature("EMS", "EMS Duty Officer", UnitCategory.COMMAND),
    UnitNomenclature("SO", "Safety Officer", UnitCategory.COMMAND),
    # Special service
    UnitNomenclature("B", "Brush", UnitCategory.SPECIAL),
    UnitNomenclature("BR", "Brush", UnitCategory.SPECIAL),
    UnitNomenclature("TK", "Tanker", UnitCategory.SPECIAL),
    UnitNomenclature("W", "Water Supply", UnitCategory.SPECIAL),
    UnitNomenclature("MAB", "Mobile Ambulance Bus", UnitCategory.SPECIAL),
    UnitNomenclature("HM", "Hazmat", UnitCategory.SPECIAL),
    UnitNomenclature("CS", "Collapse Support", UnitCategory.SPECIAL),
    # Support
    UnitNomenclature("U", "Utility", UnitCategory.SUPPORT),
]
"""Default MCFRS nomenclature. Order does not matter for matching (the longest
prefix always wins); it is grouped by category for readability."""

# ASCII-only classes, matching the JS `\d` / `[A-Z]` semantics of the original.
_SEPARATORS = re.compile(r"[\s\-_.]+")
_DIGIT = re.compile(r"[0-9]")
_DESIGNATOR = re.compile(r"([A-Z]*)([0-9]*)([A-Z]*)")
_TAIL = re.compile(r"([0-9]*)([A-Z]*)")


def station_from_unit_number(n: int | float) -> int | None:
    """Map a unit number to a station number: 714 -> 14, 705 -> 5.

    A bare number that is itself a plausible station (1..MAX_STATION) is
    returned as-is; anything else (including non-integers such as NaN) is None.
    """
    if isinstance(n, float):
        if not n.is_integer():  # NaN, +/-inf, fractional
            return None
        n = int(n)
    if n <= 0:
        return None
    candidate = n - COUNTY_UNIT_BASE if COUNTY_UNIT_BASE < n < COUNTY_UNIT_BASE + 100 else n
    return candidate if 1 <= candidate <= MAX_STATION else None


def _normalize(designator: str) -> str:
    """Trim, drop whitespace and separator punctuation ("PE-714", "A.714"), upper-case."""
    return _SEPARATORS.sub("", designator).upper()


def _match_prefix(unit: str, nomenclature: Sequence[UnitNomenclature]) -> UnitNomenclature | None:
    """Longest nomenclature prefix that the designator starts with and that is
    followed by a digit or the end of the string."""
    best: UnitNomenclature | None = None
    for entry in nomenclature:
        prefix = entry.prefix.upper()
        if not prefix or not unit.startswith(prefix):
            continue
        following = unit[len(prefix) : len(prefix) + 1]
        if following and not _DIGIT.fullmatch(following):
            continue
        if best is None or len(prefix) > len(best.prefix):
            best = entry
    return best


def parse_unit(designator: str, nomenclature: Sequence[UnitNomenclature] | None = None) -> ParsedUnit:
    """Parse a dispatched designator. ``nomenclature`` replaces (does not extend)
    ``DEFAULT_NOMENCLATURE`` when given."""
    table = DEFAULT_NOMENCLATURE if nomenclature is None else nomenclature
    unit = _normalize(designator)
    entry = _match_prefix(unit, table)

    if entry is not None:
        prefix = entry.prefix.upper()
        rest = unit[len(prefix) :]
    else:
        m = _DESIGNATOR.fullmatch(unit)
        prefix = m.group(1) if m else ""
        rest = unit[len(prefix) :] if m else ""

    tail = _TAIL.fullmatch(rest)
    digits = tail.group(1) if tail else ""
    suffix = tail.group(2) if tail and tail.group(2) else None
    number = int(digits) if digits else None
    station = None if number is None else station_from_unit_number(number)

    return ParsedUnit(
        unit=unit,
        prefix=prefix,
        station=station,
        number=number,
        type=entry.type if entry is not None else UNKNOWN_TYPE,
        category=entry.category if entry is not None else UnitCategory.UNKNOWN,
        suffix=suffix,
        known=entry is not None,
        role=entry.role if entry is not None else None,
    )


def unit_station(unit: str, nomenclature: Sequence[UnitNomenclature] | None = None) -> int | None:
    """Home station of a designator, or None when it cannot be inferred."""
    return parse_unit(unit, nomenclature).station


def is_station_unit(unit: str, station: int, nomenclature: Sequence[UnitNomenclature] | None = None) -> bool:
    return unit_station(unit, nomenclature) == station


def units_at_station(
    units: Sequence[str], station: int, nomenclature: Sequence[UnitNomenclature] | None = None
) -> list[str]:
    return [u for u in units if is_station_unit(u, station, nomenclature)]
