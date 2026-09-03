# MCFRS Incident Dashboard

Real-time situational awareness for Montgomery County (MD) Fire and Rescue
Service incidents: an operations-center style map + list, station and
apparatus awareness, filtering, history, and alerting. Inspired by the old
MCFRS "Active Incidents" web pager, built to be substantially more capable.

Not affiliated with Montgomery County or MCFRS. Data shown is whatever the
configured upstream source publishes; analytics are derived from the feed as
observed by this instance, not the official record of all incidents.

## Architecture

```
Everbridge / CAD source  →  Source Adapter  →  Incident Normalizer  →  Change Detection
        →  PostgreSQL (phase 2)  →  WebSocket / SSE (phase 4)  →  Clients
```

- **One normalized model** (`src/types/incident.ts`). The UI never sees a
  source-specific shape.
- **Adapters** (`src/adapters/`) own everything upstream-specific and run
  server-side only. `mock` is a full simulated feed; `everbridge` is a stub
  until the sanitized cURL capture is analysed (phase 3). Others (Active911,
  RSS/JSON, a future CAD feed, a radio/talkgroup source from the sibling
  `mcfrs-scanner` project) slot in behind the same interface.
- **Browsers never poll upstream.** The server polls once (no overlap,
  exponential backoff, honest source health) and serves clients.
- **Privacy is applied on the server** before data reaches a public browser
  (`src/lib/privacy.ts`, `PRIVACY_MODE`, `MASK_MEDICAL_ADDRESSES`,
  `PUBLIC_MAP_ADDRESS_PRECISION`).
- **Secrets stay server-side.** `src/lib/config.ts` is the only reader of the
  environment; `publicConfig()` is the only thing exported to the client.

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind · Leaflet +
OpenStreetMap (no proprietary map service) · Zustand · Zod · Vitest.
PostgreSQL + Prisma arrive in phase 2. Docker in phase 2.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:3000, mock feed
npm test           # vitest
npm run typecheck
npm run lint
```

## Layout

```
src/
  adapters/    source adapters (mock, everbridge stub) + the SourceAdapter contract
  app/         routes: / dashboard, /stations/[n], /units/[u], /history, /comms, /ops, /admin, /api/*
  components/  UI
  data/        MCFRS stations and hospitals (public reference data, sourced in-file)
  lib/         config, privacy, geo, filters/search/presets, categories, formatting
  maps/        Leaflet map
  parsers/     unit nomenclature (configurable) and call-type classification
  services/    incident service (poll loop, change detection, health), timeline
  store/       client state
  types/       the canonical incident model
```

## Build sequence

1. **UI on mock data** — list, map, stations, filters, drawer, Station N
   mode, responsive. ← current
2. Normalized storage + history (PostgreSQL / Prisma), Docker.
3. Everbridge adapter from the sanitized cURL capture. What the capture must
   answer is listed in `src/adapters/everbridge/index.ts`.
4. Live updates (SSE) + change detection to clients.
5. Alerts, history/analytics screens, PWA polish, operations-board mode,
   admin/debug page.

## Hosting

The app needs a server process (polling, secrets, database), so a
static host such as GitHub Pages cannot run it. Targets: a small VPS,
Fly.io, Railway, Render, or a Raspberry Pi behind a Cloudflare Tunnel on a
custom domain.

## Station 14

Station 14 (Upper Montgomery County Volunteer Fire Department) is the
default focus station via `FOCUS_STATION`; any station can be chosen in the
UI and the choice persists per browser. Nothing is hard-coded to 14.

## Apparatus data caveat

Unit information is CAD assignment data. A unit shown on an incident is
*assigned* to it; the app does not claim GPS position for any apparatus.
