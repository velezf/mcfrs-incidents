"""Privacy transforms, applied SERVER-SIDE before an incident reaches a public
browser. Member mode passes everything through. Public mode strips what could
identify a patient or a residence for medical calls."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from mcfrs_api.models import Incident, IncidentCategory

MEDICAL = {IncidentCategory.EMS, IncidentCategory.ALS, IncidentCategory.BLS, IncidentCategory.MASS_CASUALTY}
_HOUSE = re.compile(r"^\s*(\d+)([A-Za-z]?)\s+(.+)$")

Precision = Literal["exact", "block", "street"]


@dataclass(frozen=True)
class PrivacyOptions:
    mode: Literal["member", "public"] = "member"
    mask_medical_addresses: bool = True
    precision: Precision = "block"


def is_medical(category: IncidentCategory) -> bool:
    return category in MEDICAL


def mask_address(address: str, precision: Precision) -> str:
    """'12345 Example Farm Rd' -> block: '12300 blk Example Farm Rd', street: 'Example Farm Rd'."""
    if precision == "exact":
        return address
    m = _HOUSE.match(address)
    if not m:
        return address  # no house number: nothing to hide
    num, _, street = m.groups()
    if precision == "street":
        return street
    return f"{int(num) // 100 * 100} blk {street}"


def fuzz_coordinate(v: float, step: float = 0.002) -> float:
    """Snap to ~0.002 deg (~200 m) so a sensitive point is not a rooftop."""
    return round(round(v / step) * step, 6)


def apply_privacy(incident: Incident, opts: PrivacyOptions) -> Incident:
    if opts.mode == "member":
        return incident
    out = incident.model_copy(update={"raw_payload": None})
    if opts.mask_medical_addresses and is_medical(incident.category):
        update: dict[str, object] = {"cross_street": None}
        if out.address:
            update["address"] = mask_address(out.address, opts.precision)
        if out.latitude is not None:
            update["latitude"] = fuzz_coordinate(out.latitude)
        if out.longitude is not None:
            update["longitude"] = fuzz_coordinate(out.longitude)
        out = out.model_copy(update=update)
    return out
