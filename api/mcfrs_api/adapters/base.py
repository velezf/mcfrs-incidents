"""The source-adapter contract.

An adapter fetches the upstream's current view of ACTIVE incidents and returns
them already normalized. Adapters own everything source-specific: endpoint,
auth, pagination, field meanings. They run server-side only.

Contract:
 - fetch_active() returns the COMPLETE current active set (not a delta). Change
   detection (new / changed / closed) happens downstream by comparing snapshots,
   so an incident missing from a snapshot is "closed".
 - Never raise for a partially bad payload: skip the bad record, report it in
   ParseReport.errors, return the rest.
 - raw_payload on each incident keeps the original record for the admin page.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from mcfrs_api.models import Incident


@dataclass
class ParseError:
    message: str
    record: str | None = None


@dataclass
class ParseReport:
    fetched_at: datetime
    latency_ms: int
    received: int
    parsed: int
    errors: list[ParseError] = field(default_factory=list)


@dataclass
class FetchResult:
    incidents: list[Incident]
    report: ParseReport
    raw_sample: Any | None = None  # sanitized of auth material


@dataclass
class AdapterDescription:
    name: str
    config: dict[str, str]  # secrets replaced with "(set)"/"(unset)"
    notes: list[str] = field(default_factory=list)


class SourceAdapter(ABC):
    name: str = "abstract"

    @abstractmethod
    async def fetch_active(self) -> FetchResult: ...

    @abstractmethod
    def describe(self) -> AdapterDescription: ...
