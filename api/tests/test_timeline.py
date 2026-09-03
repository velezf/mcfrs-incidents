from datetime import UTC, datetime

from mcfrs_api.db.repository import ObservedEvent
from mcfrs_api.models import IncidentCategory, IncidentStatus, UnitAssignment
from mcfrs_api.services.timeline import merge_timeline, source_timeline
from tests.conftest import mk


def t(s: str) -> datetime:
    h, m, sec = map(int, s.split(":"))
    return datetime(2026, 9, 3, h, m, sec, tzinfo=UTC)


def test_source_supported_events_only_sorted():
    i = mk(
        "x",
        dispatched_at=t("17:31:02"),
        call_type="HOUSE FIRE",
        category=IncidentCategory.STRUCTURE_FIRE,
        status=IncidentStatus.CLOSED,
        units=[
            UnitAssignment(unit="PE714", dispatched_at=t("17:31:05")),
            UnitAssignment(unit="AT714"),
            UnitAssignment(unit="BC705", dispatched_at=t("17:34:12")),
        ],
        updated_at=t("17:40:22"),
        closed_at=t("18:02:11"),
    )
    assert [f"{e.kind}:{e.text}" for e in source_timeline(i)] == [
        "created:Incident created — HOUSE FIRE",
        "unit_dispatched:PE714 dispatched",
        "unit_added:BC705 added",
        "updated:Incident updated",
        "closed:Incident closed",
    ]


def test_merge_drops_near_duplicates_keeps_new_observations():
    src = source_timeline(mk("x", dispatched_at=t("17:31:02"), closed_at=t("18:02:11")))
    obs = [
        ObservedEvent("x", t("18:02:30"), "closed", "Incident closed (left the active list)").as_timeline(),
        ObservedEvent("x", t("17:45:00"), "unit_added", "M729 added", "M729").as_timeline(),
    ]
    merged = merge_timeline(src, obs)
    assert [e.kind for e in merged] == ["created", "unit_added", "closed"]
