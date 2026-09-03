"""Hydrants and water supply.

Source: Montgomery County GIS, `general/hydrants` FeatureServer (27k points,
WSSC + MCFRS + municipal hydrants, with address, main size, out-of-commission
flag, verified flag, station). Imported by `bin/import-hydrants` into the
`hydrant` table (or a JSON snapshot when running without a database) and held
in memory for nearest-neighbour lookups.

Nearest-hydrant answers are straight-line distances from the incident's
coordinates; they are a starting point for the engine company, not a
substitute for the water-supply officer.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from mcfrs_api.models import IncidentCategory

COUNTY_LAYER = "https://gis3.montgomerycountymd.gov/arcgis/rest/services/general/hydrants/FeatureServer/0"
PAGE = 2000
SNAPSHOT = Path(__file__).resolve().parents[2] / "var" / "hydrants.json"

#: Categories for which water supply matters enough to show hydrants unprompted.
FIRE_CATEGORIES = {
    IncidentCategory.STRUCTURE_FIRE,
    IncidentCategory.WORKING_FIRE,
    IncidentCategory.BRUSH_FIRE,
    IncidentCategory.VEHICLE_FIRE,
    IncidentCategory.FIRE_ALARM,
    IncidentCategory.HAZMAT,
}


@dataclass(frozen=True)
class Hydrant:
    id: str
    latitude: float
    longitude: float
    kind: str = "pillar"  # pillar | dry | water_tank | pond | unknown
    address: str | None = None
    city: str | None = None
    main_size: str | None = None  # inches, as provided ("8", "12")
    out_of_service: bool = False
    verified: bool | None = None
    station: str | None = None
    notes: str | None = None
    source: str = "mcgov-gis"

    def as_wire(self) -> dict[str, object]:
        d = asdict(self)
        return {
            "id": d["id"],
            "latitude": d["latitude"],
            "longitude": d["longitude"],
            "kind": d["kind"],
            "address": d["address"],
            "city": d["city"],
            "mainSize": d["main_size"],
            "outOfService": d["out_of_service"],
            "verified": d["verified"],
            "station": d["station"],
            "notes": d["notes"],
            "source": d["source"],
        }


@dataclass
class NearHydrant:
    hydrant: Hydrant
    km: float

    def as_wire(self) -> dict[str, object]:
        return {**self.hydrant.as_wire(), "distanceKm": round(self.km, 4), "distanceFt": round(self.km * 3280.84)}


def _clean(v: object) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def from_county_feature(feature: dict) -> Hydrant | None:
    """One GeoJSON feature from the county layer -> Hydrant. Returns None for a feature without a point."""
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates")
    if not coords or len(coords) < 2:
        return None
    p = feature.get("properties") or {}
    oid = p.get("OBJECTID") or p.get("HYD_ID") or feature.get("id")
    ooc = _clean(p.get("OOC"))
    verified = _clean(p.get("VERIFIED"))
    return Hydrant(
        id=f"mcgov:{int(oid)}" if oid is not None else f"mcgov:{coords[0]:.6f},{coords[1]:.6f}",
        latitude=float(coords[1]),
        longitude=float(coords[0]),
        address=_clean(p.get("FULL_ADDRE")),
        city=_clean(p.get("CITY")),
        main_size=_clean(p.get("MAIN")),
        out_of_service=bool(ooc) and ooc.upper() not in {"N", "NO", "0", "FALSE"},
        verified=None if verified is None else verified.upper() in {"Y", "YES", "1", "TRUE"},
        station=_clean(p.get("STATION")),
        notes=_clean(p.get("NOTES")),
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


@dataclass
class HydrantIndex:
    """27k points is small: a coarse lat/lon grid keeps nearest() to a few hundred distance calcs."""

    hydrants: list[Hydrant] = field(default_factory=list)
    cell_deg: float = 0.01  # ~1.1 km N-S
    _grid: dict[tuple[int, int], list[Hydrant]] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        for h in self.hydrants:
            self._grid.setdefault(self._cell(h.latitude, h.longitude), []).append(h)

    def _cell(self, lat: float, lon: float) -> tuple[int, int]:
        return (math.floor(lat / self.cell_deg), math.floor(lon / self.cell_deg))

    def __len__(self) -> int:
        return len(self.hydrants)

    def nearest(
        self, lat: float, lon: float, n: int = 5, max_km: float = 1.6, include_out_of_service: bool = False
    ) -> list[NearHydrant]:
        rings = max(1, math.ceil(max_km / (self.cell_deg * 111.0)))
        cx, cy = self._cell(lat, lon)
        out: list[NearHydrant] = []
        for dx in range(-rings, rings + 1):
            for dy in range(-rings, rings + 1):
                for h in self._grid.get((cx + dx, cy + dy), ()):
                    if h.out_of_service and not include_out_of_service:
                        continue
                    km = haversine_km(lat, lon, h.latitude, h.longitude)
                    if km <= max_km:
                        out.append(NearHydrant(h, km))
        out.sort(key=lambda x: x.km)
        return out[:n]


# ---- persistence of the snapshot (memory mode) ----


def save_snapshot(hydrants: Iterable[Hydrant], path: Path = SNAPSHOT) -> int:
    rows = [asdict(h) for h in hydrants]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"importedAt": datetime.now(UTC).isoformat(), "hydrants": rows}))
    return len(rows)


def load_snapshot(path: Path = SNAPSHOT) -> HydrantIndex:
    if not path.exists():
        return HydrantIndex()
    data = json.loads(path.read_text())
    return HydrantIndex([Hydrant(**row) for row in data["hydrants"]])


async def load_from_db(engine) -> HydrantIndex:
    """All hydrant rows -> index (27k rows is a few MB; loaded once per process)."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from mcfrs_api.db.schema import HydrantRow

    async with async_sessionmaker(engine)() as s:
        rows = (await s.execute(select(HydrantRow))).scalars().all()
    out = []
    for r in rows:
        a = r.attributes or {}
        out.append(
            Hydrant(
                id=r.id,
                latitude=r.latitude,
                longitude=r.longitude,
                kind=r.kind,
                source=r.source,
                address=a.get("address"),
                city=a.get("city"),
                main_size=a.get("mainSize"),
                out_of_service=bool(a.get("outOfService")),
                verified=a.get("verified"),
                station=a.get("station"),
                notes=a.get("notes"),
            )
        )
    return HydrantIndex(out)


async def load_index(engine=None) -> HydrantIndex:
    """DB when available and populated, else the JSON snapshot, else empty (feature degrades to 'no hydrant data')."""
    if engine is not None:
        try:
            idx = await load_from_db(engine)
            if len(idx):
                return idx
        except Exception:  # table missing, DB down: fall through to the snapshot
            pass
    return load_snapshot()


async def fetch_county_layer(client, layer: str = COUNTY_LAYER, page: int = PAGE) -> list[Hydrant]:
    """Page through the FeatureServer (maxRecordCount 2000) in GeoJSON. `client` is an httpx.AsyncClient."""
    out: list[Hydrant] = []
    offset = 0
    while True:
        r = await client.get(
            f"{layer}/query",
            params={
                "where": "1=1",
                "outFields": "*",
                "outSR": 4326,
                "f": "geojson",
                "resultOffset": offset,
                "resultRecordCount": page,
            },
            timeout=120,
        )
        r.raise_for_status()
        feats = r.json().get("features", [])
        out.extend(h for h in (from_county_feature(f) for f in feats) if h is not None)
        if len(feats) < page:
            return out
        offset += page
