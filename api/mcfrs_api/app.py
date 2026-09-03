"""FastAPI application: one IncidentService per process, started in the lifespan."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mcfrs_api.adapters.registry import create_adapter
from mcfrs_api.config import settings
from mcfrs_api.db.factory import create_repository
from mcfrs_api.routes import api
from mcfrs_api.services.hydrants import load_index
from mcfrs_api.services.incident_service import IncidentService

log = logging.getLogger("mcfrs")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = settings()
    svc = IncidentService(create_adapter(), create_repository(), poll_interval_s=s.poll_interval_seconds)
    app.state.service = svc
    app.state.hydrants = await load_index(getattr(svc.repo, "engine", None))
    await svc.start()
    log.info(
        "incident service started: adapter=%s storage=%s hydrants=%d",
        svc.adapter.name,
        svc.repo.kind,
        len(app.state.hydrants),
    )
    try:
        yield
    finally:
        await svc.stop()


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = FastAPI(
        title="MCFRS Incident Dashboard API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    origins = [o.strip() for o in settings().cors_origins.split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])
    app.include_router(api.router, prefix="/api")
    return app


app = create_app()
