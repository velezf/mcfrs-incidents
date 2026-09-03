# CLAUDE.md — working memory for mcfrs-incidents

MCFRS Incident Dashboard: a Python (FastAPI) backend that polls an incident
source, normalizes, stores and serves it; a Next.js/React frontend that draws
the operations-center UI. Frank maintains the Python; the React side is a
consumer of `/api/*` and should stay thin.

**Resume from `README.md` (build sequence, status) and `api/mcfrs_api/adapters/everbridge.py`
(what phase 3 is waiting for).**

## Working agreement

Same gates as the rocket repo (`../lora-rocket-telemetry/CLAUDE.md`, "Working
agreement"): Frank approves every commit, merge and push; ask before pushing.
Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
Cite, don't restate: literal values live at one authority (ports and hosts in
`docker-compose.yml` / `.env.example`, the incident model in
`api/mcfrs_api/models.py`, station data in `api/mcfrs_api/data/`).

## Layout

- `api/` — Python 3.12, `uv`. `mcfrs_api/`: `models.py` (canonical incident),
  `adapters/` (mock with a seeded live simulation; everbridge stub; `registry.py`
  is the only reader of `INCIDENT_SOURCE`), `parsers/` (unit nomenclature,
  call-type rules — the authority; the frontend only displays what the API
  says), `services/` (incident service = the single poll loop, change
  detection, privacy, timeline, hydrants), `db/` (repository contract, memory
  and Postgres implementations; `factory.py` is the only reader of
  `DATABASE_URL`), `routes/api.py` (HTTP + SSE + admin), `reference.py`
  (stations, hospitals). `alembic/` migrations. `tests/` pytest.
- `src/` — Next.js app router. `store/dashboard.ts` (zustand), `lib/filters.ts`
  (client-side filtering/search/presets, pure, tested with vitest),
  `components/`, `maps/MapView.tsx` (imperative Leaflet), pages.
- `docker-compose.yml` — db + api + web. `.env.example` — every setting.

## Commands

```
cd api && uv sync --extra dev && uv run pytest -q && uv run ruff check .
cd api && DATABASE_URL=... uv run alembic upgrade head
cd api && uv run uvicorn mcfrs_api.app:app --reload --port 8000
cd api && uv run bin/import-hydrants                # county GIS layer -> db + var/hydrants.json
npm run dev                                        # frontend; /api/* proxies to API_URL (next.config.ts)
npm test && npm run typecheck && npm run lint
docker compose up -d db                            # local Postgres on the port in docker-compose.yml
```

## Things that bit us

- Next 16: read `node_modules/next/dist/docs/` before app-router work; `LayoutProps`
  needs `npx next typegen`; a zustand selector returning a fresh array re-renders
  forever (memoize: `useVisibleIncidents`); React strict mode remounts Leaflet, so
  clear marker caches in the effect cleanup.
- Prisma was tried and removed when the backend moved to Python; if `Incident`
  (capitalized) tables appear in a dev DB, they are that leftover.
- Hydrant data: the Socrata dataset is empty; the ArcGIS FeatureServer in
  `services/hydrants.py` is the working source (27k points, paged 2000).

## Never

- Put upstream credentials, cookies or tokens in `src/` or in any response body
  (the admin endpoint masks config; `raw_payload` is excluded from the wire model).
- Claim apparatus GPS position: units are CAD *assignments*.
- Invent talkgroups: only when the source supplies them.
