"""Storage selection is the ONLY place DATABASE_URL is read."""

from __future__ import annotations

from mcfrs_api.config import settings
from mcfrs_api.db.repository import IncidentRepository, MemoryRepository
from mcfrs_api.parsers.unit import unit_station


def create_repository() -> IncidentRepository:
    url = settings().database_url
    if not url:
        return MemoryRepository(unit_station)
    from mcfrs_api.db.postgres import PostgresRepository, make_engine

    return PostgresRepository(make_engine(url), unit_station)
