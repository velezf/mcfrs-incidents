"""Everbridge Member Portal adapter — PHASE 3 STUB.

Everything below the config plumbing is deliberately unimplemented until the
sanitized "Copy as cURL" capture is analysed. Do not guess field meanings.

What the capture must tell us (checklist for the analysis step):
 - exact URL and method; whether org / member-portal ids are path or query params
 - required headers (Accept, X-Requested-With, CSRF tokens, Referer/Origin checks)
 - authentication: cookie session vs bearer token; expiry/renewal behaviour
 - pagination / page size, and whether closed incidents are included
 - the response schema: which field is the incident id, dispatch time (and its
   timezone), call type, address, coordinates (if any), units (string vs array),
   status vocabulary, and anything that looks like talkgroup/alarm level
 - polling etiquette: rate limits, ETag/If-Modified-Since support
"""

from __future__ import annotations

from mcfrs_api.adapters.base import AdapterDescription, FetchResult, SourceAdapter
from mcfrs_api.config import settings


class EverbridgeAdapter(SourceAdapter):
    name = "everbridge"

    def describe(self) -> AdapterDescription:
        s = settings()
        return AdapterDescription(
            name=self.name,
            config={
                "EVERBRIDGE_INCIDENT_URL": s.everbridge_incident_url or "(unset)",
                "EVERBRIDGE_ORGANIZATION_ID": s.everbridge_organization_id or "(unset)",
                "EVERBRIDGE_MEMBER_PORTAL_ID": s.everbridge_member_portal_id or "(unset)",
                "EVERBRIDGE_AUTH_TOKEN": "(set)" if s.everbridge_auth_token else "(unset)",
                "EVERBRIDGE_EXTRA_HEADERS": "(set)" if s.everbridge_extra_headers else "(unset)",
                "POLL_INTERVAL_SECONDS": str(s.poll_interval_seconds),
            },
            notes=[
                "Not implemented: awaiting the sanitized cURL capture (phase 3).",
                "Member Portal id is NOT assumed to equal the REST API organization id.",
            ],
        )

    async def fetch_active(self) -> FetchResult:
        raise NotImplementedError(
            "EverbridgeAdapter is not implemented yet (phase 3): provide the sanitized cURL capture first."
        )
