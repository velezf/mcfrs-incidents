from datetime import timedelta

import pytest

from mcfrs_api.adapters.base import AdapterDescription, FetchResult, ParseReport, SourceAdapter
from mcfrs_api.db.repository import HistoryQuery, MemoryRepository
from mcfrs_api.models import IncidentStatus, SourceState
from mcfrs_api.services.incident_service import IncidentService
from tests.conftest import T0, mk


def unit_station(u: str):
    return 14 if u.endswith("714") else None


class Fake(SourceAdapter):
    name = "fake"

    def __init__(self, snapshots):
        self.snapshots, self.n, self.calls = snapshots, 0, 0

    async def fetch_active(self) -> FetchResult:
        self.calls += 1
        s = self.snapshots[min(self.n, len(self.snapshots) - 1)]
        self.n += 1
        if isinstance(s, Exception):
            raise s
        return FetchResult(incidents=s, report=ParseReport(T0, 7, len(s), len(s)))

    def describe(self) -> AdapterDescription:
        return AdapterDescription("fake", {})


def make(snapshots, **kw) -> IncidentService:
    return IncidentService(
        Fake(snapshots), MemoryRepository(unit_station), poll_interval_s=1, now=kw.pop("now", lambda: T0), **kw
    )


async def test_add_then_close_into_history_and_emit():
    svc = make([[mk("a"), mk("b")], [mk("a", status=IncidentStatus.ONSCENE)]])
    seen = []
    svc.subscribe(lambda c, h: seen.append(f"+{len(c.added)}~{len(c.changed)}-{len(c.closed)}"))
    await svc.poll_once()
    await svc.poll_once()
    assert seen == ["+2~0-0", "+0~1-1"]
    assert [i.id for i in svc.get_active()] == ["a"]
    page = await svc.get_history(HistoryQuery())
    assert page.incidents[0].id == "b" and page.incidents[0].status == IncidentStatus.CLOSED
    assert svc.get_health().state == SourceState.CONNECTED and svc.get_health().last_latency_ms == 7


async def test_failure_delayed_then_down_keeps_data_and_backs_off():
    clock = {"t": T0}
    svc = make([[mk("a")], RuntimeError("boom")], stale_after_s=5, now=lambda: clock["t"])
    await svc.poll_once()
    clock["t"] = T0 + timedelta(seconds=1)
    await svc.poll_once()
    h = svc.get_health()
    assert h.state == SourceState.DELAYED and h.consecutive_failures == 1 and h.last_error == "boom"
    assert len(svc.get_active()) == 1
    clock["t"] = T0 + timedelta(seconds=11)
    await svc.poll_once()
    assert svc.get_health().state == SourceState.DOWN
    assert svc._next_delay() == 4  # 1 * 2**2


async def test_connected_goes_stale_at_read_time():
    clock = {"t": T0}
    svc = make([[]], stale_after_s=4, now=lambda: clock["t"])
    await svc.poll_once()
    assert svc.get_health().state == SourceState.CONNECTED
    clock["t"] = T0 + timedelta(seconds=60)
    assert svc.get_health().state == SourceState.DELAYED


async def test_polls_are_recorded():
    svc = make([[mk("a")]])
    await svc.poll_once()
    polls = await svc.repo.recent_polls(5)
    assert polls and polls[0].ok and polls[0].latency_ms == 7


@pytest.mark.parametrize("n", [1])
async def test_start_restores_active_from_storage(n):
    repo = MemoryRepository(unit_station)
    svc1 = IncidentService(Fake([[mk("a")]]), repo, poll_interval_s=1, now=lambda: T0)
    await svc1.poll_once()
    svc2 = IncidentService(Fake([[]]), repo, poll_interval_s=100, now=lambda: T0 + timedelta(minutes=1))
    await svc2.start()
    await svc2.stop()
    # "a" was known from storage, so the empty snapshot CLOSES it rather than never knowing it existed
    page = await repo.history(HistoryQuery())
    assert page.total == 1 and page.incidents[0].id == "a"
