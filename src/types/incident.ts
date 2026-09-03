/**
 * The canonical incident model. Every source adapter normalizes into this;
 * the UI never sees a source-specific shape.
 *
 * Dates are ISO-8601 strings on the wire (JSON) and `Date` in memory; the
 * `*Wire` types are what API routes emit and what the client store holds.
 */

export const INCIDENT_STATUSES = [
  "dispatching",
  "dispatched",
  "responding",
  "onscene",
  "transporting",
  "closed",
  "unknown",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Visual/semantic category derived from the call type text (parsers/callType.ts). */
export const INCIDENT_CATEGORIES = [
  "ems",
  "als",
  "bls",
  "fire_alarm",
  "structure_fire",
  "working_fire",
  "brush_fire",
  "vehicle_fire",
  "collision",
  "rescue",
  "technical_rescue",
  "water_rescue",
  "hazmat",
  "mass_casualty",
  "special_ops",
  "service",
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export interface UnitAssignment {
  /** Unit designator as dispatched, e.g. "PE714", "A714", "BC705". */
  unit: string;
  /** Home station inferred from the designator (parsers/unit.ts), when derivable. */
  station?: number;
  /** Apparatus type label, e.g. "Paramedic Engine" (nomenclature lives in the API). */
  type?: string;
  /** engine | truck | rescue | ambulance | medic | chief | command | special | support | unknown */
  category?: string;
  dispatchedAt?: Date;
  /** Unit-level status if the source provides one ("dispatched", "enroute", "onscene", ...). */
  status?: string;
}

export interface Incident {
  /** Stable id within this application (source name + source id). */
  id: string;
  /** CAD / upstream incident number if present, e.g. "F26123456". */
  incidentNumber?: string;

  dispatchedAt: Date;
  updatedAt?: Date;
  closedAt?: Date;

  /** Call type as dispatched, e.g. "HOUSE FIRE", "ALS", "PIC" (personal injury collision). */
  callType: string;
  callSubtype?: string;
  /** Derived category for icons/filters; never trusted for anything safety-critical. */
  category: IncidentCategory;

  priority?: string;
  status: IncidentStatus;

  address?: string;
  crossStreet?: string;
  municipality?: string;
  latitude?: number;
  longitude?: number;
  /** How the coordinates were obtained; a geocoded point is an estimate. */
  geoSource?: "source" | "geocoded" | "none";

  /** First-due station area (MCFRS station number), when the source says so. */
  stationArea?: number;
  battalion?: number;

  units: UnitAssignment[];

  /** Radio fields: only when the source supplies them. Never invented. */
  talkgroup?: string;
  channel?: string;

  alarmLevel?: string;

  /** Adapter name, e.g. "mock", "everbridge". */
  rawSource: string;
  /** Original upstream payload, retained server-side only. Never sent to browsers. */
  rawPayload?: unknown;
}

/** Wire form: what API routes emit. Dates as ISO strings; rawPayload stripped. */
export type UnitAssignmentWire = Omit<UnitAssignment, "dispatchedAt"> & { dispatchedAt?: string };
export type IncidentWire = Omit<Incident, "dispatchedAt" | "updatedAt" | "closedAt" | "units" | "rawPayload"> & {
  dispatchedAt: string;
  updatedAt?: string;
  closedAt?: string;
  units: UnitAssignmentWire[];
};

export function toWire(i: Incident): IncidentWire {
  // rawPayload is deliberately dropped here: it is server-side troubleshooting data.
  const { rawPayload: _raw, ...rest } = i;
  void _raw;
  return {
    ...rest,
    dispatchedAt: i.dispatchedAt.toISOString(),
    updatedAt: i.updatedAt?.toISOString(),
    closedAt: i.closedAt?.toISOString(),
    units: i.units.map((u) => ({ ...u, dispatchedAt: u.dispatchedAt?.toISOString() })),
  };
}

export function fromWire(w: IncidentWire): Incident {
  return {
    ...w,
    dispatchedAt: new Date(w.dispatchedAt),
    updatedAt: w.updatedAt ? new Date(w.updatedAt) : undefined,
    closedAt: w.closedAt ? new Date(w.closedAt) : undefined,
    units: w.units.map((u) => ({ ...u, dispatchedAt: u.dispatchedAt ? new Date(u.dispatchedAt) : undefined })),
  };
}

/** Timeline events are derived from source-supported facts only (dispatch, unit adds, updates, close). */
export interface TimelineEvent {
  at: Date;
  kind: "created" | "unit_dispatched" | "unit_added" | "updated" | "status" | "closed";
  text: string;
  unit?: string;
}

/** What the source-health panel shows; never says "live" when stale. */
export interface SourceHealth {
  adapter: string;
  state: "connected" | "delayed" | "down" | "starting";
  lastPollAt?: Date;
  lastSuccessAt?: Date;
  lastIncidentUpdateAt?: Date;
  lastLatencyMs?: number;
  consecutiveFailures: number;
  lastError?: string;
  activeCount: number;
}
