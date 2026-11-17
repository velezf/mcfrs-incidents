# ADR 0001 — Incident source without Everbridge

Status: PROPOSED 2026-11-17.

## Context

Build-sequence phase 3 (`../../README.md`) was an Everbridge Member Portal
adapter, built from a sanitized "Copy as cURL" capture of the portal's
incident request (`../../api/mcfrs_api/adapters/everbridge.py`). On
2026-11-17 Frank said he cannot supply that capture, so phase 3 has no
source.

The adapter contract (`../../api/mcfrs_api/adapters/base.py`) is
source-agnostic, so a different upstream drops in without touching
storage, change detection or the UI.

## Options

| Source | Live? | What it gives | Status |
|---|---|---|---|
| **Scanner-derived dispatch** (`mcfrs-scanner` ADR 0002, `mcfrs-dispatch-transcribe` ADR 0001) | yes, while the dongle is in scanner mode | units, call type, address parsed from dispatch voice, or dispatch data if any is on the air in the clear | **primary candidate**, gated on an antenna and a speech-to-text bake-off |
| **County open data (Socrata)**: [MCFRS Incidents by Station](https://catalog.data.gov/dataset/mcfrs-incidents-by-station) (twice monthly) and [FRS Incidents by Station Daily](https://catalog-beta.data.gov/dataset/frs-incidents-by-station-daily) (catalog last modified 2026-01-31) | no | counts per station area by call-type group, not individual incidents | **candidate for history/analytics**; fields and refresh not yet verified |
| PulsePoint | yes | individual active incidents (MCFRS appears to participate, per a [Broadcastify listing](https://Broadcastify.com/listen/feed/34169)) | **not pursued**: no official API; the unofficial one is reverse-engineered; check its terms of service before reconsidering. The repo is public |
| [County incident maps page](https://montgomerycountymd.gov/mcfrs/about/county_maps.html) | unknown | unknown | **unchecked** |
| Ask MCFRS (PIO / county open-data team) for a feed | — | possibly an official feed | **open**: slow, costs a request |
| Everbridge | yes | — | **parked**: the stub stays in place in case a capture ever becomes available |

## Decision (proposed)

- **Live:** a scanner-derived adapter, fed by structured dispatch events from
  `mcfrs-dispatch-transcribe`, which transcribes the per-call audio that
  `mcfrs-scanner` records. The event format's authority is that repo; this
  adapter cites it. Start with dispatch activity by talkgroup, then
  add parsed fields as transcription proves out.
- **History/analytics:** evaluate the Socrata datasets as a separate,
  non-live reference import, in the same spirit as `bin/import-hydrants`.
  It does not go through the live poll loop, which runs one adapter only.
- **Privacy:** scanner-derived incidents carry addresses from dispatch voice.
  The server-side privacy transforms apply. Medical details are never shown,
  and a public deployment needs its own review before any scanner-derived
  address is published (47 U.S.C. §605; `mcfrs-scanner` ADR 0002).

## Consequences

- Build-sequence phase 3 changes from "Everbridge adapter" to "scanner
  adapter", and it depends on work in `mcfrs-scanner` and `mcfrs-dispatch-transcribe`.
- Phase 4 (frontend switches from polling to the existing SSE endpoint) is
  independent and can proceed now.
- Analytics will say plainly that counts come from the county's published
  summaries or from what the scanner heard, not from the official record.

## Next steps (unblocked now)

1. Open the two Socrata datasets and record their fields, granularity and
   real refresh cadence here.
2. Check the county incident maps page for a live layer.
3. Phase 4 (SSE).

## Trigger to revisit

The `mcfrs-dispatch-transcribe` bake-off completes, an official feed is offered, or an
Everbridge capture becomes available.
