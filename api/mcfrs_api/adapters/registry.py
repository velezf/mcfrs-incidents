"""Adapter selection is the ONLY place INCIDENT_SOURCE is read."""

from __future__ import annotations

from mcfrs_api.adapters.base import SourceAdapter
from mcfrs_api.config import settings


def create_adapter() -> SourceAdapter:
    s = settings()
    if s.incident_source == "everbridge":
        from mcfrs_api.adapters.everbridge import EverbridgeAdapter

        return EverbridgeAdapter()
    from mcfrs_api.adapters.mock import MockAdapter

    return MockAdapter(seed=s.mock_seed, spawn_every_seconds=s.mock_spawn_seconds, speed=s.mock_speed)
