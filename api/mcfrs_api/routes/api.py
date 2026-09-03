"""HTTP surface. Every incident leaving the server goes through `outbound()`:
privacy transform, then wire form (raw_payload excluded by the model)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sse_starlette.sse import EventSourceResponse

from mcfrs_api import reference
from mcfrs_api.config import settings
from mcfrs_api.db.repository import HistoryQuery
from mcfrs_api.models import Incident, SourceHealth
from mcfrs_api.services.change_detection import ChangeSet
from mcfrs_api.services.hydrants import FIRE_CATEGORIES, HydrantIndex
from mcfrs_api.services.incident_service import IncidentService
from mcfrs_api.services.privacy import PrivacyOptions, apply_privacy
from mcfrs_api.services.timeline import merge_timeline, source_timeline

router = APIRouter()


def service(request: Request) -> IncidentService:
    return request.app.state.service


def hydrants(request: Request) -> HydrantIndex:
    return request.app.state.hydrants


def privacy() -> PrivacyOptions:
    s = settings()
    return PrivacyOptions(
        mode=s.privacy_mode, mask_medical_addresses=s.mask_medical_addresses, precision=s.public_map_address_precision
    )


def outbound(i: Incident) -> dict:
    return apply_privacy(i, privacy()).model_dump(mode="json", by_alias=True)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


@router.get("/config")
def get_config():
    return settings().public()


@router.get("/health")
def get_health(svc: IncidentService = Depends(service)):
    d = svc.adapter.describe()
    return {
        "health": svc.get_health().model_dump(mode="json", by_alias=True),
        "adapter": {"name": d.name, "config": d.config, "notes": d.notes},
        "storage": svc.repo.kind,
        "serverTime": now_iso(),
    }


@router.get("/stations")
def get_stations():
    return {
        "stations": [s.model_dump(mode="json", by_alias=True) for s in reference.stations()],
        "hospitals": [h.model_dump(mode="json", by_alias=True) for h in reference.hospitals()],
    }


@router.get("/incidents")
def get_incidents(svc: IncidentService = Depends(service)):
    return {
        "incidents": [outbound(i) for i in svc.get_active()],
        "health": svc.get_health().model_dump(mode="json", by_alias=True),
        "serverTime": now_iso(),
    }


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: str,
    include_hydrants: bool = Query(default=False, alias="hydrants"),
    svc: IncidentService = Depends(service),
    idx: HydrantIndex = Depends(hydrants),
):
    i = await svc.get_by_id(incident_id)
    if i is None:
        raise HTTPException(404, "not found")
    observed = [e.as_timeline() for e in await svc.repo.events(incident_id)]
    timeline = merge_timeline(source_timeline(i), observed)
    out = {"incident": outbound(i), "timeline": [e.model_dump(mode="json", by_alias=True) for e in timeline]}
    # Water supply: shown unprompted for fire-type calls, on request for anything else. Distances are straight-line.
    if i.category in FIRE_CATEGORIES or include_hydrants:
        pub = apply_privacy(i, privacy())  # use the coordinates the client is allowed to see
        if pub.latitude is not None and pub.longitude is not None and len(idx):
            near = idx.nearest(pub.latitude, pub.longitude, n=5, max_km=1.6)
            out["hydrants"] = {
                "nearest": [h.as_wire() for h in near],
                "searchedKm": 1.6,
                "note": "Straight-line distance; county GIS layer",
            }
        else:
            out["hydrants"] = {
                "nearest": [],
                "searchedKm": 1.6,
                "note": "no hydrant data loaded" if not len(idx) else "incident has no coordinates",
            }
    return out


@router.get("/hydrants")
def get_hydrants(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    n: int = Query(default=5, ge=1, le=50),
    max_km: float = Query(default=1.6, alias="maxKm", gt=0, le=10),
    include_oos: bool = Query(default=False, alias="includeOutOfService"),
    idx: HydrantIndex = Depends(hydrants),
):
    """Nearest hydrants to a point (straight-line). Reference data, not incident data: no privacy transform."""
    return {
        "nearest": [h.as_wire() for h in idx.nearest(lat, lon, n=n, max_km=max_km, include_out_of_service=include_oos)],
        "loaded": len(idx),
        "searchedKm": max_km,
    }


def history_query(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    unit: str | None = None,
    station: int | None = None,
    area: int | None = None,
    category: str | None = None,
    municipality: str | None = None,
    address: str | None = None,
    q: str | None = None,
    includeActive: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> HistoryQuery:
    return HistoryQuery(
        from_=from_,
        to=to,
        unit=unit or None,
        station=station,
        station_area=area,
        category=category or None,
        municipality=municipality or None,
        address=address or None,
        text=q or None,
        include_active=includeActive == "1",
        limit=limit,
        offset=offset,
    )


NOTE = "Locally observed feed; not the official MCFRS record."


@router.get("/history")
async def get_history(hq: HistoryQuery = Depends(history_query), svc: IncidentService = Depends(service)):
    page = await svc.get_history(hq)
    return {
        "incidents": [outbound(i) for i in page.incidents],
        "total": page.total,
        "storage": svc.repo.kind,
        "note": NOTE,
    }


@router.get("/analytics")
async def get_analytics(hq: HistoryQuery = Depends(history_query), svc: IncidentService = Depends(service)):
    a = await svc.repo.analytics(hq)
    return {
        "analytics": a.as_wire(),
        "storage": svc.repo.kind,
        "note": "Derived from the feed as observed by this instance; not the official MCFRS record.",
    }


@router.get("/events")
async def events(request: Request, svc: IncidentService = Depends(service)):
    """Server-Sent Events: a full snapshot on connect, then change sets as they happen, plus keepalives."""
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=100)

    def on_change(c: ChangeSet, h: SourceHealth) -> None:
        payload = {
            "added": [outbound(i) for i in c.added],
            "changed": [outbound(i) for i in c.changed],
            "closed": [outbound(i) for i in c.closed],
            "health": h.model_dump(mode="json", by_alias=True),
            "serverTime": now_iso(),
        }
        try:
            queue.put_nowait({"event": "changes", "data": json.dumps(payload)})
        except asyncio.QueueFull:
            pass  # a slow client resyncs from the next snapshot it asks for

    unsubscribe = svc.subscribe(on_change)

    async def gen():
        try:
            snapshot = {
                "incidents": [outbound(i) for i in svc.get_active()],
                "health": svc.get_health().model_dump(mode="json", by_alias=True),
                "serverTime": now_iso(),
            }
            yield {"event": "snapshot", "data": json.dumps(snapshot)}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15)
                    yield msg
                except TimeoutError:
                    yield {
                        "event": "health",
                        "data": json.dumps(
                            {"health": svc.get_health().model_dump(mode="json", by_alias=True), "serverTime": now_iso()}
                        ),
                    }
        finally:
            unsubscribe()

    return EventSourceResponse(gen())


@router.get("/admin")
async def get_admin(svc: IncidentService = Depends(service), x_admin_token: str | None = Header(default=None)):
    """Diagnostics: upstream state, parse errors, raw sample, recent polls. Auth headers/cookies are never included."""
    token = settings().admin_token
    if token and x_admin_token != token:
        raise HTTPException(401, "admin token required")
    d = svc.adapter.describe()
    polls = await svc.repo.recent_polls(20)
    return {
        "health": svc.get_health().model_dump(mode="json", by_alias=True),
        "adapter": {"name": d.name, "config": d.config, "notes": d.notes},
        "config": settings().describe(),
        "storage": svc.repo.kind,
        "activeCount": len(svc.get_active()),
        "parseErrors": svc.last_parse_errors,
        "rawSample": svc.last_raw_sample,
        "normalizedSample": outbound(svc.get_active()[0]) if svc.get_active() else None,
        "recentPolls": [p.__dict__ for p in polls],
        "serverTime": now_iso(),
    }
