# Reference data

`stations.json` and `hospitals.json` were exported from the TypeScript sources
`src/data/stations.ts` / `src/data/hospitals.ts` on 2026-09-03; those files'
headers hold the full provenance (Montgomery County facilities pages, Wikipedia,
RadioReference wiki, OpenStreetMap via Overpass/Nominatim, UMCVFD via Wayback).
Caveats recorded per entry in `notes` (stations 12, 27 and 35 coordinates ±100 m;
`?`-suffixed apparatus appear in only one source).

Hydrants are not shipped in the repo: `bin/import-hydrants` pulls the county's
GIS layer into the `hydrant` table (see `services/hydrants.py`).
