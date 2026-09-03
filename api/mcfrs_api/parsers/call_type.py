"""Classify a dispatched call-type string ("HOUSE FIRE", "PIC", "ALS1") into an
``IncidentCategory`` plus a display label and a severity rank. The rule table is
ordered, first match wins, and is exported so callers can supply their own.

Categories are for icons and filters only; never trust them for anything
safety-critical (see ``Incident.category``).

Port of ``src/parsers/callType.ts``; that file is the behavioural spec.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from mcfrs_api.models import IncidentCategory


@dataclass(frozen=True)
class CallTypeInfo:
    category: IncidentCategory
    label: str
    severity: int
    """1 = routine service call, 5 = working structure fire / mass casualty."""
    major: bool
    """True for incidents worth surfacing prominently (working fire, MCI, special ops)."""


@dataclass(frozen=True)
class CallTypeRule:
    pattern: re.Pattern[str]
    """Searched against the whitespace-collapsed call type. Must carry ``re.IGNORECASE``."""
    category: IncidentCategory
    label: str | None
    """Display label; when None the call type text is title-cased."""
    severity: int
    major: bool = False


# The JS originals are `/.../i`. JS `\b` and `\d` are ASCII-only, so re.ASCII keeps
# the boundary semantics identical; input reaches the rules already collapsed to
# plain spaces (see _normalize), so the narrower `\s` changes nothing.
_FLAGS = re.IGNORECASE | re.ASCII


def _rule(pattern: str, category: IncidentCategory, label: str, severity: int, *, major: bool = False) -> CallTypeRule:
    return CallTypeRule(re.compile(pattern, _FLAGS), category, label, severity, major)


CALL_TYPE_RULES: list[CallTypeRule] = [
    # Top-severity escalations
    _rule(r"WORKING\s*FIRE", IncidentCategory.WORKING_FIRE, "Working Fire", 5, major=True),
    _rule(r"MASS\s*CASUALTY|\bMCI\b", IncidentCategory.MASS_CASUALTY, "Mass Casualty Incident", 5, major=True),
    _rule(
        r"SPECIAL\s*OP(ERATION)?S?\b|\bBOMB\b|EXPLOSI(ON|VE)|ACTIVE\s*(ASSAILANT|SHOOTER|THREAT)",
        IncidentCategory.SPECIAL_OPS,
        "Special Operations",
        5,
        major=True,
    ),
    # Hazard families with overlapping vocabulary
    _rule(
        r"HAZ\s*-?\s*MAT|GAS\s*LEAK|ODOR\s*OF\s*(NATURAL\s*)?GAS|NATURAL\s*GAS|CHEMICAL|FUEL\s*SPILL|\bSPILL\b",
        IncidentCategory.HAZMAT,
        "Hazmat",
        3,
    ),
    _rule(
        r"WATER\s*RESCUE|SWIFT\s*WATER|\bRIVER\b|DROWN|\bBOAT\b|\bCREEK\b",
        IncidentCategory.WATER_RESCUE,
        "Water Rescue",
        4,
    ),
    _rule(
        r"TECH(NICAL)?\s*RESCUE|CONFINED\s*SPACE|TRENCH|COLLAPSE|HIGH\s*ANGLE|ROPE\s*RESCUE|MACHINERY",
        IncidentCategory.TECHNICAL_RESCUE,
        "Technical Rescue",
        4,
    ),
    # Fires. "FIRE ALARM" must not read as a structure fire, so alarms come first.
    _rule(
        r"FIRE\s*ALARM|ALARM\s*(SOUNDING|BELLS?|ACTIVATION)|\bCO\s*(ALARM|DETECTOR)|CARBON\s*MONOXIDE"
        r"|SMOKE\s*(DETECTOR|ALARM)|WATER\s*FLOW",
        IncidentCategory.FIRE_ALARM,
        "Fire Alarm",
        2,
    ),
    _rule(
        r"(HOUSE|APARTMENT|APT|BUILDING|STRUCTURE|TOWNHOUSE|COMMERCIAL|DWELLING|HIGH\s*-?\s*RISE|GARAGE|BASEMENT"
        r"|CHIMNEY)\s*FIRE",
        IncidentCategory.STRUCTURE_FIRE,
        "Structure Fire",
        4,
    ),
    _rule(
        r"(VEHICLE|CAR|AUTO|TRUCK|BUS|MOTORCYCLE|TRACTOR\s*TRAILER)\s*FIRE",
        IncidentCategory.VEHICLE_FIRE,
        "Vehicle Fire",
        2,
    ),
    _rule(
        r"(BRUSH|OUTSIDE|WOODS|GRASS|FIELD|MULCH|WILDLAND|TRASH|DUMPSTER)\s*FIRE",
        IncidentCategory.BRUSH_FIRE,
        "Brush Fire",
        2,
    ),
    # Collisions. Entrapment / rollover escalates to rescue.
    _rule(r"ENTRAP|OVERTURN|ROLL\s*-?\s*OVER|PINNED", IncidentCategory.RESCUE, "Collision with Entrapment", 4),
    _rule(
        r"\bPIC\b|PERSONAL\s*INJURY|\bMVC\b|\bMVA\b|(AUTO|VEHICLE|MOTOR\s*VEHICLE|MOTORCYCLE|BICYCLE|BIKE)\s*"
        r"(ACCIDENT|CRASH)|COLLISION|\bCRASH\b|(PEDESTRIAN|PED|BICYCLIST|CYCLIST)\s*STRUCK",
        IncidentCategory.COLLISION,
        "Personal Injury Collision",
        3,
    ),
    # EMS
    _rule(
        r"\bALS\s?\d?\b|CARDIAC|CHEST\s*PAIN|STROKE|\bCVA\b|DIFF(ICULTY)?\s*BREATH|SHORTNESS\s*OF\s*BREATH|\bSOB\b"
        r"|UNCONSCIOUS|UNRESPONSIVE|SEIZURE|OVERDOSE|\bOD\b|ALLERGIC|ANAPHYLA|CHOKING|SHOOTING|STABBING|GUNSHOT"
        r"|\bGSW\b|TRAUMA",
        IncidentCategory.ALS,
        "ALS",
        3,
    ),
    _rule(
        r"\bBLS\s?\d?\b|SICK\s*PERSON|\bSICK\b|\bFALLS?\b|BACK\s*PAIN|ABDOMINAL|NAUSEA|MEDICAL\s*ALARM|LIFT\s*ASSIST",
        IncidentCategory.BLS,
        "BLS",
        2,
    ),
    # Generic rescue (after water / technical / entrapment above)
    _rule(r"ELEVATOR|\bRESCUE\b|TRAPPED|LOCKED\s*IN\b|ANIMAL", IncidentCategory.RESCUE, "Rescue", 3),
    _rule(r"LOCK\s*-?\s*OUT|LOCKED\s*OUT", IncidentCategory.RESCUE, "Lockout", 1),
    # Generic EMS (after ALS / BLS / lift assist)
    _rule(r"\bEMS\b|MEDICAL|\bMEDIC\b|INJUR|\bILL\b|PATIENT|BLEED", IncidentCategory.EMS, "EMS", 2),
    # Any other fire ("ELECTRICAL FIRE", "APPLIANCE FIRE"): category unknown, but it
    # is still a fire, so it outranks a service call and never falls into one.
    _rule(r"\bFIRE\b", IncidentCategory.OTHER, "Fire", 3),
    # Service
    _rule(
        r"SERVICE\s*CALL|PUBLIC\s*SERVICE|\bASSIST|WIRES?\s*DOWN|TREE\s*DOWN|POLE\s*DOWN|INVESTIGAT"
        r"|WATER\s*(LEAK|PROBLEM)|FLOOD|ELECTRICAL\s*(PROBLEM|HAZARD|ODOR)|TRANSFORMER|STAND\s*-?\s*BY|\bDETAIL\b"
        r"|\bCOVER\b",
        IncidentCategory.SERVICE,
        "Service Call",
        1,
    ),
]
"""Ordered rule table. Earlier rules win, so the list runs from most to least
specific: escalations (working fire, MCI) first, then hazard families whose
phrasing overlaps generic words ("COLLAPSE" before "STRUCTURE FIRE",
"WATER RESCUE" before "RESCUE"), then EMS, then service and the fallback."""

_WHITESPACE = re.compile(r"\s+")

_FALLBACK_CATEGORY = IncidentCategory.OTHER
_FALLBACK_SEVERITY = 1
_FALLBACK_MAJOR = False


def _normalize(text: str) -> str:
    return _WHITESPACE.sub(" ", text.strip())


def _title_case(text: str) -> str:
    return " ".join(w[:1].upper() + w[1:] for w in text.lower().split(" "))


def _classify_one(text: str, rules: Sequence[CallTypeRule]) -> tuple[CallTypeInfo, bool]:
    """Classify one string; the flag says whether any rule matched."""
    normalized = _normalize(text)
    for rule in rules:
        if rule.pattern.search(normalized):
            label = rule.label if rule.label is not None else _title_case(normalized)
            return CallTypeInfo(rule.category, label, rule.severity, rule.major), True
    label = _title_case(normalized) if normalized else "Other"
    return CallTypeInfo(_FALLBACK_CATEGORY, label, _FALLBACK_SEVERITY, _FALLBACK_MAJOR), False


def classify_call_type(
    call_type: str, subtype: str | None = None, rules: Sequence[CallTypeRule] | None = None
) -> CallTypeInfo:
    """Classify a call type, optionally escalated by a subtype: the subtype's
    classification is used when it outranks the call type's severity, or when the
    call type itself is unrecognized. A subtype never de-escalates."""
    table = CALL_TYPE_RULES if rules is None else rules
    primary, primary_matched = _classify_one(call_type, table)
    if subtype is None or not _normalize(subtype):
        return primary

    secondary, secondary_matched = _classify_one(subtype, table)
    if not secondary_matched:
        return primary
    if not primary_matched or secondary.severity > primary.severity:
        return secondary
    return primary
