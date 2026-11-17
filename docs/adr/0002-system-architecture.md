# ADR 0002 — MCFRS system architecture: data flow and the role of each repo

Status: PROPOSED 2026-11-17. **This is the canonical system map.** Each
other MCFRS repo has a short "system context" ADR that states its own role
and links here; none of them restates this whole map.

## Context

The MCFRS work has grown into several repos that hand data to each other.
Earlier decisions put each piece where it is:
- the decoder: `mcfrs-scanner` ADR 0001;
- a separate transcription repo: `mcfrs-dispatch-transcribe` README;
- the incident source: this repo's ADR 0001;
- the desk display: `mcfrs-desk-display` ADR 0001;
- dongle sharing: `apogee-sdr` ADRs 0001–0002.

This ADR fixes one picture of how data flows through them and who owns each
handoff, so a format or rule is defined in one place.

## Data flow

```
 roof J-pole ─► RTL-SDR (one dongle on apogee-gs)
                   │  owner/scheduler: apogee-sdr (time-sliced with APRS I-Gate, ADS-B)
                   ▼
 ┌──────────────── mcfrs-scanner ────────────────┐
 │ OP25 rx.py: P25 Phase II control + clear voice │
 │  ├─► live audio: Icecast + listening page       │  BUILT
 │  ├─► per-call audio files + call metadata       │  PLANNED (PLAN.md phase 7)
 │  └─► control-channel events (grants, affils)    │  PLANNED (transcribe ADR 0003)
 └────────────────────────┬───────────────────────┘
                          ▼
 ┌─────────── mcfrs-dispatch-transcribe ──────────┐
 │ local speech-to-text ─► match to closed lists   │
 │ (units, call types, county address points)      │
 │ + fuse control-channel events ─► dispatch events│  PLANNED (ADRs 0001, 0003)
 └────────────────────────┬───────────────────────┘
                          ▼
 ┌──────────────── mcfrs-incidents ───────────────┐
 │ source adapter ─► normalizer ─► change detection│
 │ ─► PostgreSQL ─► privacy ─► /api/*, SSE         │  BUILT (mock source)
 │ reference data: stations, hospitals, hydrants   │  BUILT
 │ + NWS weather, apogee-sdr status, county open   │
 │   data (history)                                │  PLANNED
 └───────┬──────────────────────────────┬─────────┘
         ▼                              ▼
  web dashboard (src/, React)   mcfrs-desk-display (ESP8266, 128×64)
  BUILT                         via /api/device/pages ─ PLANNED
```

All server-side pieces run on `apogee-gs`. The desk display and browsers
reach `mcfrs-incidents` over the home LAN.

## Roles and owned contracts

Each repo owns the format of what it **produces**. Consumers cite that
format; they don't copy it.

| Repo | Role | Owns (authority for) | Consumes |
|---|---|---|---|
| `apogee-sdr` | Owns and schedules the single RTL-SDR among tenant jobs. Not MCFRS-specific | tenant registry, `sdr-mode`/`sdr-cycle`, the published on-air schedule | — |
| `mcfrs-scanner` | Receives the county P25 system: decoder, audio, listening page | per-call audio and metadata format; control-channel event format (both planned) | the dongle, via `apogee-sdr` |
| `mcfrs-dispatch-transcribe` | Turns dispatch audio and control-channel events into structured dispatch events | dispatch event format (its output) | scanner outputs |
| `mcfrs-incidents` | The app: stores and serves incidents, history and analytics; runs the dashboard and the device endpoint | canonical incident model (`api/mcfrs_api/models.py`), REST/SSE API, device page payload | dispatch events; reference data; NWS; `apogee-sdr` status |
| `mcfrs-desk-display` | ESP8266 rotating-page client; draws what the server prepared | firmware only; no data formats | `/api/device/pages` |

This refines `mcfrs-dispatch-transcribe` ADR 0003's wording. That ADR says
the transcribe repo "owns the event and incident formats". Here it owns its
*output* (dispatch events). The scanner owns the control-channel event
format it emits, and this repo owns the incident model.

## Cross-cutting rules (stated here once)

- **Intermittent feed.** The scanner only hears the air during its
  `apogee-sdr` slots. Every consumer carries a last-heard time and shows
  data age, and silence while off-air is never read as "no activity"
  (`apogee-sdr` ADR 0002, consumer staleness contract). No incident is
  closed by inference while the scanner is off-air.
- **Inferred, not CAD.** Unit status and unit-to-incident links come from
  voice and signalling. They are labelled inferred, with their evidence.
- **Encryption.** Nothing encrypted is decoded (`mcfrs-scanner/CLAUDE.md`).
  Metadata for encrypted talkgroups is dropped at ingest
  (`mcfrs-dispatch-transcribe` ADR 0003).
- **Privacy.** Personal use. Server-side privacy transforms run before
  anything leaves `mcfrs-incidents`, and no medical detail is displayed.
  Raw call audio and transcripts never enter a repo. Not legal advice:
  receiving clear public-safety radio is generally lawful, and divulging it
  is restricted (`mcfrs-scanner` ADR 0002).

## Ruled-out sources (so they are not re-proposed)

- **Everbridge (msend) and other member-only CAD relay apps** (e.g. Active911
  ActiveAlert): their data may not leave the product (this repo's ADR 0001).
- **Over-the-air dispatch data** (Motorola DATCH and standard SNDCP): checked
  2026-11-17, no CAD text (`mcfrs-scanner` ADR 0002).
- **PulsePoint's unofficial API:** not pursued (this repo's ADR 0001).
- **LRRP radio positions:** out of scope without its own ADR
  (`mcfrs-dispatch-transcribe` ADR 0003).

## Consequences

- A new handoff gets its format defined in the producing repo, and this map
  gains one line.
- When a PLANNED box becomes BUILT, update its label here. This is the only
  copy of the map.

## Trigger to revisit

A repo is added, merged or split, or a handoff changes owner.
