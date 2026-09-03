# MCFRS Incident Dashboard

Real-time situational awareness for Montgomery County (MD) Fire and Rescue
Service incidents: an operations-center style map + list, station and
apparatus awareness, nearest hydrants for fire calls, filtering, history and
analytics, alerting (planned). Inspired by the old MCFRS "Active Incidents"
web pager, built to be substantially more capable.

Not affiliated with Montgomery County or MCFRS. Data shown is whatever the
configured upstream source publishes; analytics are derived from the feed as
observed by this instance, not the official record of all incidents.

## Architecture

```
Everbridge / CAD source  →  Source Adapter  →  Incident Normalizer  →  Change Detection
        →  PostgreSQL  →  Server-Sent Events  →  Browsers
                 (Python / FastAPI)                (Next.js / React / Leaflet)
```

- **Backend `api/` (Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL).**
  One process polls ONE adapter (no overlap, exponential backoff, honest
  source health), normalizes into the canonical model
  (`api/mcfrs_api/models.py`), detects new/changed/closed incidents, stores
  everything (an incident that leaves the upstream list is *closed*, never
  deleted), applies privacy transforms server-side, and serves `/api/*` plus
  an SSE stream. Adapters: `mock` (19 fictional-address fixtures and a seeded
  live simulation), `everbridge` (stub until the sanitized request capture
  is analysed). Stations, hospitals and the county hydrant layer are
  reference data.
- **Frontend `src/` (Next.js, React, TypeScript, Tailwind, Leaflet +
  OpenStreetMap).** A thin consumer of the API: three-pane dashboard (list |
  map | Station N mode or incident drawer), filters/presets/search, station
  and unit pages, history + analytics, dark/light/system themes, mobile
  LIST | MAP | STATION, PWA manifest. Next forwards `/api/*` to the Python
  service, so no upstream secret ever reaches a browser.

## Run locally

```bash
cp .env.example .env
docker compose up -d db                      # PostgreSQL

cd api
uv sync --extra dev
uv run alembic upgrade head
uv run bin/import-hydrants                   # optional: 27k county hydrants (a minute)
uv run uvicorn mcfrs_api.app:app --reload --port 8000
# tests: uv run pytest -q   lint: uv run ruff check .

cd ..
npm install
npm run dev                                  # http://localhost:3000
# tests: npm test   typecheck: npm run typecheck   lint: npm run lint
```

Without `DATABASE_URL` the API runs in memory (history lost on restart).
`docker compose up -d --build` runs db + api + web together.

## Layout

```
api/mcfrs_api/
  models.py        canonical incident model (mirrors the frontend wire types)
  adapters/        base contract, registry (INCIDENT_SOURCE), mock, everbridge stub
  parsers/         unit nomenclature (configurable table), call-type rules
  services/        incident_service (poll loop, health), change_detection, privacy, timeline, hydrants
  db/              repository contract, memory + postgres implementations, schema, factory (DATABASE_URL)
  routes/api.py    /api/config health stations incidents incidents/{id} history analytics hydrants events(SSE) admin
  reference.py     stations + hospitals from data/*.json (provenance in data/README.md)
api/alembic/       migrations          api/tests/   pytest        api/bin/import-hydrants
src/
  app/             / dashboard, /stations/[n], /units/[u], /history, /comms /ops /admin (placeholders)
  components/ maps/ store/ lib/ types/
```

## Build sequence

1. UI on mock data — done.
2. Normalized storage + history + analytics + Docker — done (PostgreSQL via
   SQLAlchemy/Alembic; Docker Compose for db + api + web).
3. Everbridge adapter from the sanitized request capture. What the capture
   must answer is listed in `api/mcfrs_api/adapters/everbridge.py`.
4. Live updates: the SSE endpoint exists; the frontend still polls every
   few seconds and switches to SSE next.
5. Alerts, ops-board mode, communications view, admin page UI, PWA polish.

## Hydrants

The county publishes every hydrant (27,351 points; WSSC, MCFRS and municipal)
as an ArcGIS layer. `bin/import-hydrants` loads it. For fire-type calls the
incident detail includes the five nearest hydrants within a mile as
straight-line distances, and the map marks them. This is a starting point
for the first-due engine, not a substitute for the water-supply officer;
rural areas (much of the Station 14 first-due) may show none.

## Hosting

Needs a server process and a database, so a static host such as GitHub Pages
cannot run it. Targets: a small VPS, Fly.io, Railway, Render, or a Raspberry
Pi behind a Cloudflare Tunnel on a custom domain.

## Station 14

Station 14 (Upper Montgomery County Volunteer Fire Department) is the
default focus station via `FOCUS_STATION`; any station can be chosen in the
UI and the choice persists per browser. Nothing is hard-coded to 14.

## Apparatus data caveat

Unit information is CAD assignment data. A unit shown on an incident is
*assigned* to it; the app does not claim GPS position for any apparatus.
