"""The server-side heart: owns the active set, runs the poll loop against ONE
adapter (browsers never poll upstream), detects changes, tracks source health
honestly, persists through the repository, and fans changes out to subscribers
(SSE)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

from mcfrs_api.adapters.base import SourceAdapter
from mcfrs_api.db.repository import HistoryQuery, IncidentRepository, PollRecord
from mcfrs_api.models import Incident, IncidentStatus, SourceHealth, SourceState
from mcfrs_api.services.change_detection import ChangeSet, detect_changes

log = logging.getLogger(__name__)
Listener = Callable[[ChangeSet, SourceHealth], Awaitable[None] | None]


class IncidentService:
    def __init__(
        self,
        adapter: SourceAdapter,
        repository: IncidentRepository,
        poll_interval_s: float,
        stale_after_s: float | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.adapter = adapter
        self.repo = repository
        self.poll_interval_s = poll_interval_s
        self.stale_after_s = stale_after_s if stale_after_s is not None else poll_interval_s * 4
        self._now = now or (lambda: datetime.now(UTC))
        self._active: dict[str, Incident] = {}
        self._listeners: set[Listener] = set()
        self._lock = asyncio.Lock()
        self._task: asyncio.Task[None] | None = None
        self._failures = 0
        self._health = SourceHealth(adapter=adapter.name)
        self.last_raw_sample: object = None
        self.last_parse_errors: list[dict[str, str | None]] = []

    # ---- lifecycle ----
    async def start(self) -> None:
        """Restores the last known active set from storage, then polls on a loop."""
        try:
            for i in await self.repo.load_active():
                self._active[i.id] = i
            self._health = self._health.model_copy(update={"active_count": len(self._active)})
        except Exception as err:  # storage never takes the feed down
            self._health = self._health.model_copy(update={"last_error": f"storage: {err}"})
        await self.poll_once()
        self._task = asyncio.create_task(self._loop(), name="incident-poll")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self._next_delay())
            await self.poll_once()

    def _next_delay(self) -> float:
        """Exponential backoff on failure, capped at 8x the interval."""
        base = self.poll_interval_s
        return base if self._failures == 0 else min(base * 2**self._failures, base * 8)

    # ---- one poll ----
    async def poll_once(self) -> ChangeSet | None:
        """Never overlaps: a call while one is in flight returns None."""
        if self._lock.locked():
            return None
        async with self._lock:
            started = self._now()
            try:
                result = await self.adapter.fetch_active()
            except Exception as err:
                self._failures += 1
                last_ok = self._health.last_success_at
                stale = last_ok is None or (started - last_ok).total_seconds() > self.stale_after_s
                self._health = self._health.model_copy(
                    update={
                        "state": SourceState.DOWN if stale else SourceState.DELAYED,
                        "last_poll_at": started,
                        "consecutive_failures": self._failures,
                        "last_error": str(err),
                    }
                )
                await self._record(PollRecord(started, self.adapter.name, False, error=str(err)))
                return None
            changes = self._apply(result.incidents, started)
            await self._persist(changes, result.incidents, started)
            await self._record(
                PollRecord(
                    started,
                    self.adapter.name,
                    True,
                    result.report.latency_ms,
                    result.report.received,
                    result.report.parsed,
                )
            )
            self._failures = 0
            self.last_raw_sample = result.raw_sample
            self.last_parse_errors = [{"message": e.message, "record": e.record} for e in result.report.errors]
            update = {
                "state": SourceState.CONNECTED,
                "last_poll_at": started,
                "last_success_at": started,
                "last_latency_ms": result.report.latency_ms,
                "consecutive_failures": 0,
                "last_error": self._storage_error(),
                "active_count": len(self._active),
            }
            if changes.total:
                update["last_incident_update_at"] = started
            self._health = self._health.model_copy(update=update)
            if changes.total:
                await self._emit(changes)
            return changes

    def _apply(self, incidents: list[Incident], now: datetime) -> ChangeSet:
        changes = detect_changes(self._active, incidents, now)
        for i in [*changes.added, *changes.changed]:
            self._active[i.id] = i
        for i in changes.closed:
            self._active.pop(i.id, None)
        for i in incidents:  # an upstream may also report closed incidents explicitly
            if i.status == IncidentStatus.CLOSED:
                self._active.pop(i.id, None)
        return changes

    _storage_err: str | None = None

    def _storage_error(self) -> str | None:
        return self._storage_err

    async def _persist(self, changes: ChangeSet, snapshot: list[Incident], seen_at: datetime) -> None:
        try:
            await self.repo.apply_changes(changes, seen_at)
            touched = {i.id for i in [*changes.added, *changes.changed, *changes.closed]}
            await self.repo.touch([i.id for i in snapshot if i.id not in touched], seen_at)
            self._storage_err = None
        except Exception as err:
            log.exception("storage failure")
            self._storage_err = f"storage: {err}"

    async def _record(self, p: PollRecord) -> None:
        try:
            await self.repo.record_poll(p)
        except Exception:
            log.debug("poll record failed", exc_info=True)

    # ---- subscribers ----
    def subscribe(self, listener: Listener) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    async def _emit(self, changes: ChangeSet) -> None:
        health = self.get_health()
        for fn in list(self._listeners):
            try:
                r = fn(changes, health)
                if r is not None:
                    await r
            except Exception:
                log.exception("listener failed")

    # ---- reads ----
    def get_active(self) -> list[Incident]:
        return sorted(self._active.values(), key=lambda i: i.dispatched_at, reverse=True)

    async def get_by_id(self, incident_id: str) -> Incident | None:
        return self._active.get(incident_id) or await self.repo.get_by_id(incident_id)

    async def get_history(self, q: HistoryQuery | None = None):
        return await self.repo.history(q or HistoryQuery())

    def get_health(self) -> SourceHealth:
        """Staleness re-evaluated at read time, so "connected" cannot go stale silently."""
        h = self._health.model_copy(update={"active_count": len(self._active)})
        if (
            h.state == SourceState.CONNECTED
            and h.last_success_at
            and self._now() - h.last_success_at > timedelta(seconds=self.stale_after_s)
        ):
            h = h.model_copy(update={"state": SourceState.DELAYED})
        return h
