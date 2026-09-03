"""Reference data: MCFRS stations and hospitals (sourced JSON in mcfrs_api/data;
provenance in data/README.md) with apparatus designators parsed once."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from math import asin, cos, radians, sin, sqrt

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from mcfrs_api.parsers.unit import parse_unit


class Wire(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Apparatus(Wire):
    unit: str
    type: str
    category: str
    station: int | None
    uncertain: bool = False


class Station(Wire):
    number: int
    name: str
    address: str
    municipality: str | None = None
    latitude: float
    longitude: float
    battalion: int | None = None
    apparatus: list[str]
    apparatus_parsed: list[Apparatus] = []
    notes: str | None = None


class Hospital(Wire):
    id: str
    name: str
    short_name: str
    address: str
    latitude: float
    longitude: float
    trauma_level: str | None = None
    notes: str | None = None


def _load(name: str) -> list[dict]:
    with resources.files("mcfrs_api.data").joinpath(name).open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def stations() -> list[Station]:
    out = []
    for raw in _load("stations.json"):
        st = Station(**raw)
        st.apparatus_parsed = [
            Apparatus(
                unit=u.rstrip("?"),
                type=(p := parse_unit(u.rstrip("?"))).type,
                category=str(p.category),
                station=p.station,
                uncertain=u.endswith("?"),
            )
            for u in st.apparatus
        ]
        out.append(st)
    return out


@lru_cache
def hospitals() -> list[Hospital]:
    return [Hospital(**raw) for raw in _load("hospitals.json")]


def station(number: int) -> Station | None:
    return next((s for s in stations() if s.number == number), None)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    h = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(h))
