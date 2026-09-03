from __future__ import annotations

from datetime import UTC, datetime

import pytest

from mcfrs_api.models import Incident, IncidentCategory, IncidentStatus, UnitAssignment

T0 = datetime(2026, 9, 3, 17, 31, 2, tzinfo=UTC)


def mk(id_: str, **extra) -> Incident:
    base = dict(
        id=id_,
        dispatched_at=T0,
        call_type="ALS",
        category=IncidentCategory.ALS,
        status=IncidentStatus.DISPATCHED,
        units=[UnitAssignment(unit="A714")],
        raw_source="t",
        municipality="Poolesville",
        address="1 Test Ln",
    )
    base.update(extra)
    return Incident(**base)


@pytest.fixture
def t0() -> datetime:
    return T0
