"""SQLAlchemy models. Everything the normalizer produces is kept; an incident
that leaves the upstream active list is marked closed, never deleted."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class IncidentRow(Base):
    __tablename__ = "incident"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # "<source>:<upstream id>"
    incident_number: Mapped[str | None] = mapped_column(String(64))
    dispatched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    call_type: Mapped[str] = mapped_column(String(128))
    call_subtype: Mapped[str | None] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(32))
    priority: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    cross_street: Mapped[str | None] = mapped_column(Text)
    municipality: Mapped[str | None] = mapped_column(String(128))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    geo_source: Mapped[str | None] = mapped_column(String(16))
    station_area: Mapped[int | None] = mapped_column(Integer)
    battalion: Mapped[int | None] = mapped_column(Integer)
    talkgroup: Mapped[str | None] = mapped_column(String(64))
    channel: Mapped[str | None] = mapped_column(String(64))
    alarm_level: Mapped[str | None] = mapped_column(String(32))
    raw_source: Mapped[str] = mapped_column(String(32))
    raw_payload: Mapped[dict | list | None] = mapped_column(JSON)  # server-side troubleshooting only
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    units: Mapped[list[UnitRow]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list[EventRow]] = relationship(back_populates="incident", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_incident_status_dispatched", "status", "dispatched_at"),
        Index("ix_incident_area_dispatched", "station_area", "dispatched_at"),
        Index("ix_incident_category_dispatched", "category", "dispatched_at"),
        Index("ix_incident_municipality", "municipality"),
    )


class UnitRow(Base):
    __tablename__ = "unit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incident.id", ondelete="CASCADE"), index=True)
    unit: Mapped[str] = mapped_column(String(16), index=True)
    station: Mapped[int | None] = mapped_column(Integer, index=True)
    type: Mapped[str | None] = mapped_column(String(64))
    category: Mapped[str | None] = mapped_column(String(16))
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str | None] = mapped_column(String(32))

    incident: Mapped[IncidentRow] = relationship(back_populates="units")
    __table_args__ = (UniqueConstraint("incident_id", "unit", name="uq_unit_incident"),)


class EventRow(Base):
    """Observed lifecycle events (what THIS instance saw, when)."""

    __tablename__ = "incident_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incident.id", ondelete="CASCADE"))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    kind: Mapped[str] = mapped_column(String(24))
    text: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(16))

    incident: Mapped[IncidentRow] = relationship(back_populates="events")
    __table_args__ = (Index("ix_event_incident_at", "incident_id", "at"),)


class GeocodeCacheRow(Base):
    """Geocoder results keyed by normalized address: an address is never geocoded twice."""

    __tablename__ = "geocode_cache"

    address: Mapped[str] = mapped_column(Text, primary_key=True)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    provider: Mapped[str] = mapped_column(String(32))
    precision: Mapped[str | None] = mapped_column(String(16))
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SourcePollRow(Base):
    """One row per poll; keeps the admin page honest about upstream behaviour."""

    __tablename__ = "source_poll"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    adapter: Mapped[str] = mapped_column(String(32))
    ok: Mapped[bool] = mapped_column(Boolean)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    received: Mapped[int | None] = mapped_column(Integer)
    parsed: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)


class HydrantRow(Base):
    """Reference data: hydrants and draft/water sources (OpenStreetMap or a county/WSSC export)."""

    __tablename__ = "hydrant"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # "<source>:<id>"
    latitude: Mapped[float] = mapped_column(Float, index=True)
    longitude: Mapped[float] = mapped_column(Float, index=True)
    kind: Mapped[str] = mapped_column(String(24))  # pillar | underground | wall | dry | water_tank | pond | unknown
    source: Mapped[str] = mapped_column(String(32))
    attributes: Mapped[dict | None] = mapped_column(JSON)  # colour, flow, diameter, operator... as provided
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
