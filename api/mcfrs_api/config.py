"""All configuration from the environment (.env for local dev). Parsed once.
Secrets never leave this process: `describe()` masks them, `public()` is the only
thing the browser may know."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SECRET_KEYS = {"everbridge_auth_token", "everbridge_extra_headers", "admin_token", "database_url"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")

    incident_source: Literal["mock", "everbridge"] = "mock"
    poll_interval_seconds: int = Field(default=15, ge=5, le=600)
    focus_station: int = Field(
        default=14, ge=1, le=99, description="Station N mode default; configurable, not hard-coded"
    )

    # Privacy — applied server-side before data reaches a public browser.
    privacy_mode: Literal["member", "public"] = "member"
    mask_medical_addresses: bool = True
    public_map_address_precision: Literal["exact", "block", "street"] = "block"

    # Everbridge member-portal adapter (phase 3; values come from the sanitized cURL capture).
    everbridge_incident_url: str | None = None
    everbridge_organization_id: str | None = None
    everbridge_member_portal_id: str | None = None  # NOT assumed equal to the REST API organization id
    everbridge_auth_token: str | None = None
    everbridge_extra_headers: str | None = None  # JSON object

    # Mock adapter
    mock_seed: int = 1
    mock_spawn_seconds: int = Field(default=45, ge=5)
    mock_speed: float = Field(default=1.0, ge=0.1, le=100)

    # Storage. Unset = in-memory (history lost on restart).
    database_url: str | None = None

    admin_token: str | None = None
    cors_origins: str = "http://localhost:3000,http://localhost:3100"

    def describe(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for k, v in self.model_dump().items():
            out[k.upper()] = ("(set)" if v else "(unset)") if k in SECRET_KEYS else ("" if v is None else str(v))
        return out

    def public(self) -> dict[str, object]:
        return {
            "focusStation": self.focus_station,
            "privacyMode": self.privacy_mode,
            "pollIntervalSeconds": self.poll_interval_seconds,
            "source": self.incident_source,
        }


@lru_cache
def settings() -> Settings:
    return Settings()
