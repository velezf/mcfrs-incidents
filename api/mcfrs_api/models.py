"""The canonical incident model. Every source adapter normalizes into this; the
UI (and the database) never see a source-specific shape.

Mirror of the TypeScript `IncidentWire` type the frontend consumes: field names
are identical (camelCase on the wire via aliases), dates are ISO-8601 strings.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class IncidentStatus(StrEnum):
    DISPATCHING = "dispatching"
    DISPATCHED = "dispatched"
    RESPONDING = "responding"
    ONSCENE = "onscene"
    TRANSPORTING = "transporting"
    CLOSED = "closed"
    UNKNOWN = "unknown"


class IncidentCategory(StrEnum):
    """Visual/semantic category derived from the call type text (parsers.call_type)."""

    EMS = "ems"
    ALS = "als"
    BLS = "bls"
    FIRE_ALARM = "fire_alarm"
    STRUCTURE_FIRE = "structure_fire"
    WORKING_FIRE = "working_fire"
    BRUSH_FIRE = "brush_fire"
    VEHICLE_FIRE = "vehicle_fire"
    COLLISION = "collision"
    RESCUE = "rescue"
    TECHNICAL_RESCUE = "technical_rescue"
    WATER_RESCUE = "water_rescue"
    HAZMAT = "hazmat"
    MASS_CASUALTY = "mass_casualty"
    SPECIAL_OPS = "special_ops"
    SERVICE = "service"
    OTHER = "other"


class UnitCategory(StrEnum):
    ENGINE = "engine"
    TRUCK = "truck"
    RESCUE = "rescue"
    AMBULANCE = "ambulance"
    MEDIC = "medic"
    CHIEF = "chief"
    COMMAND = "command"
    SPECIAL = "special"
    SUPPORT = "support"
    UNKNOWN = "unknown"


class WireModel(BaseModel):
    """camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class UnitAssignment(WireModel):
    unit: str = Field(description='Designator as dispatched, e.g. "PE714"')
    station: int | None = Field(default=None, description="Home station inferred from the designator")
    type: str | None = Field(default=None, description='Apparatus type label, e.g. "Paramedic Engine"')
    category: UnitCategory = UnitCategory.UNKNOWN
    dispatched_at: datetime | None = None
    status: str | None = Field(default=None, description="Unit-level status if the source provides one")


class Incident(WireModel):
    id: str = Field(description="Stable id within this application: '<source>:<upstream id>'")
    incident_number: str | None = None

    dispatched_at: datetime
    updated_at: datetime | None = None
    closed_at: datetime | None = None

    call_type: str
    call_subtype: str | None = None
    category: IncidentCategory = IncidentCategory.OTHER

    priority: str | None = None
    status: IncidentStatus = IncidentStatus.UNKNOWN

    address: str | None = None
    cross_street: str | None = None
    municipality: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geo_source: str | None = Field(default=None, description='"source" | "geocoded" | "none"')

    station_area: int | None = None
    battalion: int | None = None

    units: list[UnitAssignment] = Field(default_factory=list)

    talkgroup: str | None = Field(default=None, description="Only when the source supplies it. Never invented.")
    channel: str | None = None
    alarm_level: str | None = None

    raw_source: str
    raw_payload: Any | None = Field(default=None, exclude=True, description="Server-side only; never serialized")

    def has_location(self) -> bool:
        return self.latitude is not None and self.longitude is not None


class TimelineEvent(WireModel):
    at: datetime
    kind: str  # created | unit_dispatched | unit_added | updated | status | closed
    text: str
    unit: str | None = None


class SourceState(StrEnum):
    CONNECTED = "connected"
    DELAYED = "delayed"
    DOWN = "down"
    STARTING = "starting"


class SourceHealth(WireModel):
    """What the source-health panel shows; never says "connected" when stale."""

    adapter: str
    state: SourceState = SourceState.STARTING
    last_poll_at: datetime | None = None
    last_success_at: datetime | None = None
    last_incident_update_at: datetime | None = None
    last_latency_ms: int | None = None
    consecutive_failures: int = 0
    last_error: str | None = None
    active_count: int = 0
