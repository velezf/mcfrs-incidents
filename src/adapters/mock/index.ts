/**
 * MockAdapter — a deterministic, self-advancing fake CAD feed.
 *
 * It exists so change detection (new / changed / closed) can be exercised
 * without an upstream. Each `fetchActive()` advances an internal scenario
 * clock and returns the current active set:
 *
 *  - incidents progress dispatched -> responding -> onscene
 *    -> (transporting, EMS only) -> closed on category-specific timescales;
 *  - closed incidents drop out of the active set after `removeClosedAfterMinutes`;
 *  - working incidents occasionally gain a unit while on scene;
 *  - a new incident spawns every `spawnEverySeconds` of scenario time, drawn
 *    from a weighted template pool (EMS most common, Station 14 area
 *    over-represented).
 *
 * All randomness comes from a seeded mulberry32 PRNG, so two adapters with the
 * same seed and the same sequence of clock readings produce identical output.
 */

import type { Incident, IncidentCategory, IncidentStatus, UnitAssignment } from "@/types/incident";
import type { AdapterDescription, FetchResult, ParseReport, SourceAdapter } from "@/adapters/types";
import {
  MOCK_SOURCE,
  buildFixtures,
  buildRawRecord,
  categoryForCallType,
  makeUnit,
  mockIncidentNumber,
  unitStatusFor,
} from "./fixtures";

export interface MockAdapterOptions {
  /** PRNG seed; same seed + same clock readings => same feed. */
  seed?: number;
  /** Scenario seconds between spawned incidents. Default 45. */
  spawnEverySeconds?: number;
  /** Scenario time multiplier relative to wall time. Default 1. */
  speed?: number;
  /** Clock source; inject for tests. Default `() => new Date()`. */
  now?: () => Date;
  /** Minutes a closed incident stays in the active set. Default 10. */
  removeClosedAfterMinutes?: number;
}

// ---------------------------------------------------------------------------
// PRNG

/** mulberry32: tiny, fast, good enough for a fixture generator. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("pick from empty list");
    return item;
  }
  weighted<T extends { weight: number }>(items: readonly T[]): T {
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    let r = this.next() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    const last = items[items.length - 1];
    if (last === undefined) throw new Error("weighted pick from empty list");
    return last;
  }
}

// ---------------------------------------------------------------------------
// Scenario schedule

const MINUTE = 60_000;

const STATUS_ORDER: readonly IncidentStatus[] = [
  "dispatching",
  "dispatched",
  "responding",
  "onscene",
  "transporting",
  "closed",
];

function statusRank(s: IncidentStatus): number {
  const i = STATUS_ORDER.indexOf(s);
  return i < 0 ? 0 : i;
}

/** Absolute scenario times (ms) at which an incident reaches each stage. */
interface Schedule {
  respondingAt: number;
  onsceneAt: number;
  /** EMS only. */
  transportingAt?: number;
  closedAt: number;
  /** Scenario times at which an extra unit is added while on scene. */
  unitAddsAt: number[];
}

interface SimIncident {
  incident: Incident;
  schedule: Schedule;
}

const EMS_CATEGORIES: ReadonlySet<IncidentCategory> = new Set(["ems", "als", "bls"]);
const WORKING_CATEGORIES: ReadonlySet<IncidentCategory> = new Set([
  "structure_fire",
  "working_fire",
  "mass_casualty",
  "technical_rescue",
  "water_rescue",
  "hazmat",
]);

/** Duration bands in minutes, by category. Tuned for "feels live", not realism audits. */
function durationBand(category: IncidentCategory): { onscene: [number, number]; close: [number, number] } {
  if (EMS_CATEGORIES.has(category)) return { onscene: [5, 10], close: [30, 50] };
  switch (category) {
    case "fire_alarm":
    case "service":
      return { onscene: [5, 9], close: [20, 40] };
    case "collision":
    case "vehicle_fire":
    case "brush_fire":
      return { onscene: [6, 12], close: [45, 90] };
    case "structure_fire":
    case "working_fire":
      return { onscene: [6, 12], close: [120, 240] };
    case "mass_casualty":
    case "technical_rescue":
    case "water_rescue":
    case "hazmat":
      return { onscene: [6, 12], close: [90, 180] };
    default:
      return { onscene: [6, 12], close: [40, 80] };
  }
}

function makeSchedule(rng: Rng, incident: Incident): Schedule {
  const t0 = incident.dispatchedAt.getTime();
  const band = durationBand(incident.category);
  const respondingAt = t0 + rng.range(1, 3) * MINUTE;
  const onsceneAt = respondingAt + rng.range(band.onscene[0], band.onscene[1]) * MINUTE;
  const closedAt = onsceneAt + rng.range(band.close[0], band.close[1]) * MINUTE;
  const schedule: Schedule = { respondingAt, onsceneAt, closedAt, unitAddsAt: [] };

  if (EMS_CATEGORIES.has(incident.category)) {
    // Transport begins roughly halfway through the on-scene window.
    schedule.transportingAt = onsceneAt + (closedAt - onsceneAt) * rng.range(0.35, 0.6);
  }
  if (WORKING_CATEGORIES.has(incident.category)) {
    const adds = rng.int(0, 2);
    for (let k = 0; k < adds; k++) {
      schedule.unitAddsAt.push(onsceneAt + rng.range(5, 25) * MINUTE);
    }
    schedule.unitAddsAt.sort((a, b) => a - b);
  }
  return schedule;
}

function scheduledStatus(schedule: Schedule, at: number): IncidentStatus {
  if (at >= schedule.closedAt) return "closed";
  if (schedule.transportingAt !== undefined && at >= schedule.transportingAt) return "transporting";
  if (at >= schedule.onsceneAt) return "onscene";
  if (at >= schedule.respondingAt) return "responding";
  return "dispatched";
}

// ---------------------------------------------------------------------------
// Spawn templates

interface Place {
  municipality: string;
  lat: number;
  lng: number;
  stationArea: number;
  battalion: number;
  /** Nearby stations, used for unit designators. Home station first. */
  stations: number[];
}

const STATION_14_PLACES: readonly Place[] = [
  { municipality: "Beallsville", lat: 39.171, lng: -77.412, stationArea: 14, battalion: 5, stations: [14, 35, 29, 22] },
  { municipality: "Dickerson", lat: 39.219, lng: -77.424, stationArea: 14, battalion: 5, stations: [14, 35, 29] },
  { municipality: "Barnesville", lat: 39.221, lng: -77.376, stationArea: 14, battalion: 5, stations: [14, 35, 29] },
  { municipality: "Poolesville", lat: 39.145, lng: -77.415, stationArea: 14, battalion: 5, stations: [14, 29, 35] },
  { municipality: "Boyds", lat: 39.187, lng: -77.323, stationArea: 14, battalion: 5, stations: [14, 35, 22] },
];

const COUNTY_PLACES: readonly Place[] = [
  { municipality: "Germantown", lat: 39.173, lng: -77.272, stationArea: 22, battalion: 5, stations: [22, 29, 34] },
  { municipality: "Clarksburg", lat: 39.239, lng: -77.279, stationArea: 35, battalion: 5, stations: [35, 29, 22] },
  { municipality: "Gaithersburg", lat: 39.143, lng: -77.201, stationArea: 8, battalion: 4, stations: [8, 28, 31] },
  { municipality: "Rockville", lat: 39.081, lng: -77.152, stationArea: 31, battalion: 4, stations: [31, 3, 23] },
  { municipality: "Silver Spring", lat: 38.994, lng: -77.029, stationArea: 1, battalion: 1, stations: [1, 16, 19] },
  { municipality: "Bethesda", lat: 38.985, lng: -77.1, stationArea: 6, battalion: 2, stations: [6, 20, 41] },
  { municipality: "Olney", lat: 39.152, lng: -77.07, stationArea: 40, battalion: 3, stations: [40, 4, 17] },
  { municipality: "Damascus", lat: 39.288, lng: -77.203, stationArea: 13, battalion: 5, stations: [13, 35, 9] },
  { municipality: "Wheaton", lat: 39.039, lng: -77.055, stationArea: 18, battalion: 3, stations: [18, 24, 12] },
  { municipality: "Takoma Park", lat: 38.978, lng: -77.008, stationArea: 2, battalion: 1, stations: [2, 1, 16] },
];

const STREET_NAMES = [
  "Example Farm Rd",
  "Test Ln",
  "Sample St",
  "Placeholder Ct",
  "Mock Ave",
  "Demo Blvd",
  "Fictional Pl",
  "Sandbox Dr",
  "Example Woods Rd",
  "Sample Hollow Ln",
] as const;

interface Template {
  weight: number;
  callType: string;
  priority: string;
  /** Unit prefixes in dispatch order; index into `place.stations` given by `at`. */
  units: { prefix: string; at: number }[];
  /** Whether a talkgroup is assigned at dispatch (never for EMS). */
  talkgroup: boolean;
}

const TEMPLATES: readonly Template[] = [
  { weight: 30, callType: "BLS", priority: "3", units: [{ prefix: "A", at: 0 }], talkgroup: false },
  { weight: 25, callType: "ALS", priority: "2", units: [{ prefix: "A", at: 0 }, { prefix: "M", at: 1 }], talkgroup: false },
  {
    weight: 10,
    callType: "PIC",
    priority: "2",
    units: [{ prefix: "PE", at: 0 }, { prefix: "A", at: 0 }, { prefix: "M", at: 1 }],
    talkgroup: true,
  },
  {
    weight: 8,
    callType: "FIRE ALARM",
    priority: "2",
    units: [{ prefix: "E", at: 0 }, { prefix: "T", at: 1 }, { prefix: "E", at: 2 }],
    talkgroup: true,
  },
  {
    weight: 5,
    callType: "HOUSE FIRE",
    priority: "1",
    units: [
      { prefix: "PE", at: 0 },
      { prefix: "AT", at: 0 },
      { prefix: "E", at: 1 },
      { prefix: "E", at: 2 },
      { prefix: "T", at: 1 },
      { prefix: "RS", at: 2 },
      { prefix: "A", at: 0 },
      { prefix: "BC", at: 0 },
    ],
    talkgroup: true,
  },
  { weight: 4, callType: "BRUSH FIRE", priority: "2", units: [{ prefix: "B", at: 0 }, { prefix: "E", at: 1 }], talkgroup: true },
  { weight: 4, callType: "VEHICLE FIRE", priority: "2", units: [{ prefix: "E", at: 0 }, { prefix: "E", at: 1 }], talkgroup: true },
  {
    weight: 3,
    callType: "GAS LEAK",
    priority: "2",
    units: [{ prefix: "E", at: 0 }, { prefix: "HM", at: 1 }, { prefix: "BC", at: 0 }],
    talkgroup: true,
  },
  { weight: 2, callType: "ELEVATOR RESCUE", priority: "3", units: [{ prefix: "E", at: 0 }, { prefix: "T", at: 1 }], talkgroup: true },
];

/** Prefixes that can be added to a working incident while on scene. */
const ADD_UNIT_PREFIXES = ["E", "T", "A", "M", "RS", "BC"] as const;

const STATION_14_SPAWN_SHARE = 0.4;

function unitDesignator(prefix: string, station: number): string {
  return `${prefix}7${String(station).padStart(2, "0")}`;
}

/** Battalion chief designators are BC7<battalion>, not per-station. */
function designatorFor(prefix: string, place: Place, stationIdx: number): string {
  if (prefix === "BC") return `BC70${place.battalion}`;
  const station = place.stations[Math.min(stationIdx, place.stations.length - 1)] ?? place.stations[0] ?? 0;
  return unitDesignator(prefix, station);
}

// ---------------------------------------------------------------------------
// Cloning

function cloneUnit(u: UnitAssignment): UnitAssignment {
  return { ...u, dispatchedAt: u.dispatchedAt ? new Date(u.dispatchedAt) : undefined };
}

function cloneIncident(i: Incident): Incident {
  return {
    ...i,
    dispatchedAt: new Date(i.dispatchedAt),
    updatedAt: i.updatedAt ? new Date(i.updatedAt) : undefined,
    closedAt: i.closedAt ? new Date(i.closedAt) : undefined,
    units: i.units.map(cloneUnit),
    rawPayload: i.rawPayload === undefined ? undefined : JSON.parse(JSON.stringify(i.rawPayload)),
  };
}

// ---------------------------------------------------------------------------
// Adapter

export class MockAdapter implements SourceAdapter {
  readonly name = MOCK_SOURCE;

  private readonly seed: number;
  private readonly spawnEveryMs: number;
  private readonly speed: number;
  private readonly removeClosedAfterMs: number;
  private readonly now: () => Date;
  private readonly rng: Rng;

  private readonly startWall: number;
  private readonly startSim: number;
  private lastSim: number;
  private nextSpawnAt: number;
  private nextSeq = 200;

  private sims: SimIncident[];
  private readonly fixtureCount: number;

  constructor(options: MockAdapterOptions = {}) {
    this.seed = options.seed ?? 1;
    this.spawnEveryMs = (options.spawnEverySeconds ?? 45) * 1000;
    this.speed = options.speed ?? 1;
    this.removeClosedAfterMs = (options.removeClosedAfterMinutes ?? 10) * MINUTE;
    this.now = options.now ?? (() => new Date());
    this.rng = new Rng(this.seed);

    this.startWall = this.now().getTime();
    this.startSim = this.startWall;
    this.lastSim = this.startSim;
    this.nextSpawnAt = this.startSim + this.spawnEveryMs;

    const fixtures = buildFixtures(new Date(this.startSim));
    this.fixtureCount = fixtures.length;
    this.sims = fixtures.map((incident) => ({ incident, schedule: makeSchedule(this.rng, incident) }));
  }

  describe(): AdapterDescription {
    return {
      name: this.name,
      config: {
        seed: String(this.seed),
        spawnEverySeconds: String(this.spawnEveryMs / 1000),
        speed: String(this.speed),
        removeClosedAfterMinutes: String(this.removeClosedAfterMs / MINUTE),
        fixtures: String(this.fixtureCount),
      },
      notes: [
        "Simulated feed. Every incident, address and unit assignment is fictional.",
        "Deterministic for a given seed and clock; statuses advance with scenario time.",
      ],
    };
  }

  async fetchActive(): Promise<FetchResult> {
    const simNow = this.simTime();
    this.advance(simNow);

    const incidents = this.sims.map((s) => cloneIncident(s.incident));
    const latencyMs = Math.round(this.rng.range(5, 40));
    const report: ParseReport = {
      fetchedAt: new Date(simNow),
      latencyMs,
      received: incidents.length,
      parsed: incidents.length,
      errors: [],
    };
    const first = incidents[0];
    return { incidents, report, rawSample: first?.rawPayload };
  }

  /** Scenario time: wall time since construction, scaled by `speed`. */
  private simTime(): number {
    const wall = this.now().getTime();
    return this.startSim + (wall - this.startWall) * this.speed;
  }

  private advance(simNow: number): void {
    if (simNow < this.lastSim) return; // clock went backwards; hold state
    this.spawnDue(simNow);
    for (const sim of this.sims) this.progress(sim, simNow);
    this.sims = this.sims.filter((s) => {
      const closedAt = s.incident.closedAt?.getTime();
      return closedAt === undefined || simNow - closedAt < this.removeClosedAfterMs;
    });
    this.lastSim = simNow;
  }

  private progress(sim: SimIncident, simNow: number): void {
    const { incident, schedule } = sim;
    if (incident.status === "closed") return;

    // Never regress a fixture that started further along than its schedule.
    const target = scheduledStatus(schedule, simNow);
    const next = statusRank(target) > statusRank(incident.status) ? target : incident.status;
    let changed = false;

    if (next !== incident.status) {
      incident.status = next;
      changed = true;
      if (next === "closed") incident.closedAt = new Date(Math.max(schedule.closedAt, incident.dispatchedAt.getTime()));
    }

    if (incident.status !== "closed") {
      while (schedule.unitAddsAt.length > 0 && (schedule.unitAddsAt[0] ?? Infinity) <= simNow) {
        const at = schedule.unitAddsAt.shift() ?? simNow;
        this.addUnit(incident, at);
        changed = true;
      }
    }

    if (this.refreshUnitStatuses(incident, simNow)) changed = true;

    if (changed) {
      incident.updatedAt = new Date(simNow);
      incident.rawPayload = buildRawRecord(incident);
    }
  }

  /** Units follow the incident stage; late-added units catch up on their own clock. */
  private refreshUnitStatuses(incident: Incident, simNow: number): boolean {
    const incidentLabel = unitStatusFor(incident.status);
    let changed = false;
    for (const u of incident.units) {
      let label = incidentLabel;
      const since = u.dispatchedAt ? simNow - u.dispatchedAt.getTime() : Infinity;
      if (incident.status !== "closed" && u.dispatchedAt && since < 6 * MINUTE) {
        label = since < 1 * MINUTE ? "dispatched" : "enroute";
        if (statusRank(incident.status) < statusRank("responding")) label = "dispatched";
      }
      if (u.status !== label) {
        u.status = label;
        changed = true;
      }
    }
    return changed;
  }

  private addUnit(incident: Incident, at: number): void {
    const stations = incident.units
      .map((u) => /^[A-Z]+7(\d{2})$/.exec(u.unit))
      .flatMap((m) => (m && m[1] !== undefined ? [Number(m[1])] : []));
    const pool = stations.length > 0 ? stations : [14];
    for (let attempt = 0; attempt < 6; attempt++) {
      const prefix = this.rng.pick(ADD_UNIT_PREFIXES);
      const unit = prefix === "BC" ? `BC70${incident.battalion ?? 5}` : unitDesignator(prefix, this.rng.pick(pool));
      if (incident.units.some((u) => u.unit === unit)) continue;
      incident.units.push(makeUnit(unit, new Date(at), "dispatched"));
      return;
    }
  }

  private spawnDue(simNow: number): void {
    while (this.nextSpawnAt <= simNow) {
      this.spawn(this.nextSpawnAt);
      this.nextSpawnAt += this.spawnEveryMs;
    }
  }

  private spawn(at: number): void {
    const template = this.rng.weighted(TEMPLATES);
    const place =
      this.rng.float() < STATION_14_SPAWN_SHARE ? this.rng.pick(STATION_14_PLACES) : this.rng.pick(COUNTY_PLACES);
    const dispatchedAt = new Date(at);
    const seq = this.nextSeq++;
    const incidentNumber = mockIncidentNumber(dispatchedAt, seq);

    const units: UnitAssignment[] = [];
    for (const spec of template.units) {
      const unit = designatorFor(spec.prefix, place, spec.at);
      if (units.some((u) => u.unit === unit)) continue;
      units.push(makeUnit(unit, new Date(at), "dispatched"));
    }

    const incident: Incident = {
      id: `${MOCK_SOURCE}:${incidentNumber}`,
      incidentNumber,
      dispatchedAt,
      updatedAt: new Date(at),
      callType: template.callType,
      category: categoryForCallType(template.callType),
      priority: template.priority,
      status: "dispatched",
      address: `${this.rng.int(100, 19999)} ${this.rng.pick(STREET_NAMES)}`,
      municipality: place.municipality,
      latitude: Number((place.lat + this.rng.range(-0.02, 0.02)).toFixed(5)),
      longitude: Number((place.lng + this.rng.range(-0.025, 0.025)).toFixed(5)),
      geoSource: "source",
      stationArea: place.stationArea,
      battalion: place.battalion,
      units,
      talkgroup: template.talkgroup ? `7A${place.battalion} Inc ${this.rng.int(1, 16)}` : undefined,
      rawSource: MOCK_SOURCE,
    };
    incident.rawPayload = buildRawRecord(incident);
    this.sims.push({ incident, schedule: makeSchedule(this.rng, incident) });
  }
}
