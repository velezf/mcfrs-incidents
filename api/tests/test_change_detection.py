from datetime import UTC, datetime

from mcfrs_api.models import IncidentStatus
from mcfrs_api.services.change_detection import detect_changes
from tests.conftest import T0, mk


def test_first_snapshot_is_all_added():
    c = detect_changes({}, [mk("a"), mk("b")], T0)
    assert [i.id for i in c.added] == ["a", "b"] and c.closed == []


def test_status_change_is_change_and_raw_payload_churn_is_not():
    prev = {"a": mk("a"), "b": mk("b")}
    c = detect_changes(prev, [mk("a", status=IncidentStatus.ONSCENE), mk("b", raw_payload={"x": 1})], T0)
    assert [i.id for i in c.changed] == ["a"] and c.unchanged == 1


def test_missing_is_closed_not_deleted():
    now = datetime(2026, 9, 3, 18, 0, tzinfo=UTC)
    c = detect_changes({"a": mk("a")}, [], now)
    assert c.closed[0].status == IncidentStatus.CLOSED and c.closed[0].closed_at == now


def test_already_closed_previous_does_not_close_again():
    assert detect_changes({"a": mk("a", status=IncidentStatus.CLOSED)}, [], T0).closed == []
