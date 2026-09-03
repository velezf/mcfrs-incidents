/**
 * OBVIOUSLY FICTIONAL incidents for the mock adapter.
 *
 * Municipalities and rough coordinates are real Montgomery County, MD places so
 * the map looks right; every address, incident number and unit assignment is
 * invented. Nothing here is a record of anything that happened.
 *
 * Station 14 (Beallsville) and its neighbours are over-represented on purpose so
 * the Station 14 mode has something to show.
 */

import type { Incident, IncidentCategory, IncidentStatus, UnitAssignment } from "@/types/incident";
import { classifyCallType } from "@/parsers/callType";
import { parseUnit } from "@/parsers/unit";

export const MOCK_SOURCE = "mock";

/** Category comes from the shared classifier so the mock and real adapters agree. */
export function categoryForCallType(callType: string): IncidentCategory {
  return classifyCallType(callType).category;
}

/** Build a unit assignment, filling station/type from the shared designator parser when known. */
export function makeUnit(unit: string, dispatchedAt: Date, status: string): UnitAssignment {
  const parsed = parseUnit(unit);
  const assignment: UnitAssignment = { unit, dispatchedAt: new Date(dispatchedAt), status };
  if (parsed.station !== undefined) assignment.station = parsed.station;
  if (parsed.known) assignment.type = parsed.type;
  return assignment;
}

/** Map an incident status to the unit-level status label a CAD feed would show. */
export function unitStatusFor(status: IncidentStatus): string {
  switch (status) {
    case "dispatching":
    case "dispatched":
      return "dispatched";
    case "responding":
      return "enroute";
    case "onscene":
      return "onscene";
    case "transporting":
      return "transporting";
    case "closed":
      return "available";
    default:
      return "unknown";
  }
}

/** A plausible upstream CAD-export record. Strings only, like a real export. */
export interface MockRawRecord {
  IncidentNumber: string;
  DispatchTime: string;
  CallType: string;
  Address: string;
  City: string;
  Status: string;
  Units: string;
  Latitude: string;
  Longitude: string;
  StationArea?: string;
  Talkgroup?: string;
  AlarmLevel?: string;
  ClosedTime?: string;
}

interface FixtureSpec {
  /** Sequence within the day; becomes the incident number suffix. */
  seq: number;
  minutesAgo: number;
  callType: string;
  status: IncidentStatus;
  address: string;
  municipality: string;
  lat: number;
  lng: number;
  units: string[];
  stationArea?: number;
  battalion?: number;
  talkgroup?: string;
  alarmLevel?: string;
  priority?: string;
  crossStreet?: string;
  /** Only for closed incidents: how many minutes ago it closed. */
  closedMinutesAgo?: number;
}

function yymmdd(d: Date): string {
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** e.g. F26090300123 — "F" + yymmdd + 5-digit sequence. */
export function mockIncidentNumber(at: Date, seq: number): string {
  return `F${yymmdd(at)}${String(seq).padStart(5, "0")}`;
}

export function buildRawRecord(i: Incident): MockRawRecord {
  const raw: MockRawRecord = {
    IncidentNumber: i.incidentNumber ?? "",
    DispatchTime: i.dispatchedAt.toISOString(),
    CallType: i.callType,
    Address: i.address ?? "",
    City: i.municipality ?? "",
    Status: i.status.toUpperCase(),
    Units: i.units.map((u) => u.unit).join(","),
    Latitude: i.latitude !== undefined ? i.latitude.toFixed(5) : "",
    Longitude: i.longitude !== undefined ? i.longitude.toFixed(5) : "",
  };
  if (i.stationArea !== undefined) raw.StationArea = String(i.stationArea);
  if (i.talkgroup !== undefined) raw.Talkgroup = i.talkgroup;
  if (i.alarmLevel !== undefined) raw.AlarmLevel = i.alarmLevel;
  if (i.closedAt !== undefined) raw.ClosedTime = i.closedAt.toISOString();
  return raw;
}

function makeIncident(now: Date, spec: FixtureSpec): Incident {
  const dispatchedAt = new Date(now.getTime() - spec.minutesAgo * 60_000);
  const closedAt =
    spec.status === "closed"
      ? new Date(now.getTime() - (spec.closedMinutesAgo ?? 0) * 60_000)
      : undefined;
  const incidentNumber = mockIncidentNumber(dispatchedAt, spec.seq);
  const unitStatus = unitStatusFor(spec.status);
  const units: UnitAssignment[] = spec.units.map((unit) => makeUnit(unit, dispatchedAt, unitStatus));

  const incident: Incident = {
    id: `${MOCK_SOURCE}:${incidentNumber}`,
    incidentNumber,
    dispatchedAt,
    updatedAt: closedAt ?? new Date(now),
    closedAt,
    callType: spec.callType,
    category: categoryForCallType(spec.callType),
    priority: spec.priority,
    status: spec.status,
    address: spec.address,
    crossStreet: spec.crossStreet,
    municipality: spec.municipality,
    latitude: spec.lat,
    longitude: spec.lng,
    geoSource: "source",
    stationArea: spec.stationArea,
    battalion: spec.battalion,
    units,
    talkgroup: spec.talkgroup,
    alarmLevel: spec.alarmLevel,
    rawSource: MOCK_SOURCE,
  };
  incident.rawPayload = buildRawRecord(incident);
  return incident;
}

/**
 * The fixture set, relative to `now` so dispatch times are always recent.
 * Closed fixtures closed within the last 10 minutes so they are still "active"
 * on the first poll and age out shortly after.
 */
const FIXTURE_SPECS: FixtureSpec[] = [
  // --- Station 14 (Beallsville) first-due area ---------------------------------
  {
    seq: 123,
    minutesAgo: 25,
    callType: "HOUSE FIRE",
    status: "onscene",
    address: "12345 Example Farm Rd",
    crossStreet: "Fictional Orchard Ln",
    municipality: "Beallsville",
    lat: 39.1712,
    lng: -77.4138,
    stationArea: 14,
    battalion: 5,
    units: ["PE714", "AT714", "A714", "TK714", "E735", "TK735", "E722", "T729", "RS729", "M729", "BC705", "B714"],
    talkgroup: "7A4 Inc 10",
    alarmLevel: "1st alarm",
    priority: "1",
  },
  {
    seq: 131,
    minutesAgo: 8,
    callType: "PIC W/ENTRAPMENT",
    status: "responding",
    address: "100 Test Ln",
    crossStreet: "Fictional Mill Rd",
    municipality: "Dickerson",
    lat: 39.2201,
    lng: -77.4249,
    stationArea: 14,
    battalion: 5,
    units: ["RS729", "A714", "PE714", "M729", "BC705"],
    talkgroup: "7A3 Inc 8",
    priority: "1",
  },
  {
    seq: 138,
    minutesAgo: 1,
    callType: "BLS",
    status: "dispatching",
    address: "1600 Example Farm Rd",
    municipality: "Beallsville",
    lat: 39.1745,
    lng: -77.4092,
    stationArea: 14,
    battalion: 5,
    units: ["A714"],
    priority: "3",
  },
  {
    seq: 118,
    minutesAgo: 30,
    callType: "BRUSH FIRE",
    status: "onscene",
    address: "800 Example Woods Rd",
    municipality: "Barnesville",
    lat: 39.2185,
    lng: -77.3771,
    stationArea: 14,
    battalion: 5,
    units: ["B714", "BR714", "E735", "B735"],
    talkgroup: "7A4 Inc 11",
    priority: "2",
  },
  {
    seq: 133,
    minutesAgo: 6,
    callType: "WATER RESCUE",
    status: "responding",
    address: "1000 Test Boat Ramp Rd",
    crossStreet: "C&O Canal towpath (fictional marker)",
    municipality: "Dickerson",
    lat: 39.2035,
    lng: -77.4602,
    stationArea: 14,
    battalion: 5,
    units: ["RS729", "BT729", "E714", "A714", "BC705"],
    talkgroup: "7A5 Inc 12",
    priority: "1",
  },
  {
    seq: 126,
    minutesAgo: 22,
    callType: "ALS",
    status: "transporting",
    address: "200 Sample St",
    municipality: "Poolesville",
    lat: 39.1453,
    lng: -77.4162,
    battalion: 5,
    units: ["A714", "M729"],
    priority: "2",
  },
  {
    seq: 116,
    minutesAgo: 48,
    callType: "ALS",
    status: "closed",
    closedMinutesAgo: 8,
    address: "1700 Sample Hollow Ln",
    municipality: "Boyds",
    lat: 39.1866,
    lng: -77.3226,
    battalion: 5,
    units: ["A735", "M735"],
    priority: "2",
  },
  // --- Up-county / mid-county ---------------------------------------------------
  {
    seq: 128,
    minutesAgo: 15,
    callType: "BLS",
    status: "onscene",
    address: "300 Placeholder Ct",
    municipality: "Germantown",
    lat: 39.1731,
    lng: -77.2716,
    stationArea: 22,
    units: ["A722"],
    priority: "3",
  },
  {
    seq: 137,
    minutesAgo: 3,
    callType: "ALS",
    status: "dispatched",
    address: "400 Mock Ave",
    municipality: "Rockville",
    lat: 39.0812,
    lng: -77.1524,
    stationArea: 31,
    units: ["A731", "M731"],
    priority: "2",
  },
  {
    seq: 129,
    minutesAgo: 12,
    callType: "FIRE ALARM",
    status: "onscene",
    address: "500 Demo Blvd",
    municipality: "Gaithersburg",
    lat: 39.1434,
    lng: -77.2012,
    stationArea: 8,
    units: ["E708", "T708", "E728"],
    talkgroup: "7A3 Inc 9",
    priority: "2",
  },
  {
    seq: 112,
    minutesAgo: 70,
    callType: "VEHICLE FIRE",
    status: "closed",
    closedMinutesAgo: 6,
    address: "1400 Example Hwy",
    municipality: "Clarksburg",
    lat: 39.2387,
    lng: -77.2794,
    stationArea: 35,
    units: ["E735", "E729"],
    priority: "2",
  },
  {
    seq: 130,
    minutesAgo: 10,
    callType: "ALS",
    status: "onscene",
    address: "1200 Mock Manor Dr",
    municipality: "Olney",
    lat: 39.1521,
    lng: -77.0697,
    stationArea: 40,
    units: ["A740", "M740"],
    priority: "2",
  },
  {
    seq: 136,
    minutesAgo: 2,
    callType: "BLS",
    status: "responding",
    address: "1300 Placeholder Rd",
    municipality: "Damascus",
    lat: 39.2884,
    lng: -77.2031,
    stationArea: 13,
    units: ["A713"],
    priority: "3",
  },
  // --- Down-county ----------------------------------------------------------------
  {
    seq: 114,
    minutesAgo: 55,
    callType: "APARTMENT FIRE",
    status: "onscene",
    address: "1100 Sample Tower Ct",
    crossStreet: "Fictional Gardens Way",
    municipality: "Silver Spring",
    lat: 38.9936,
    lng: -77.0288,
    stationArea: 1,
    battalion: 1,
    units: [
      "E701", "E716", "E719", "E702", "E721", "E724",
      "T701", "T716", "T719",
      "RS701", "RS719",
      "A701", "M716", "M719",
      "BC701", "BC703", "DC701", "SO701",
    ],
    talkgroup: "7A2 Inc 6",
    alarmLevel: "2nd alarm",
    priority: "1",
  },
  {
    seq: 121,
    minutesAgo: 35,
    callType: "MASS CASUALTY",
    status: "onscene",
    address: "900 Test Pkwy",
    crossStreet: "Sample Transit Center (fictional)",
    municipality: "Wheaton",
    lat: 39.0386,
    lng: -77.0546,
    stationArea: 18,
    battalion: 3,
    units: ["E718", "E724", "T718", "RS718", "A718", "A724", "M718", "M724", "EMS703", "BC703", "MAB702"],
    talkgroup: "7A1 Inc 3",
    priority: "1",
  },
  {
    seq: 119,
    minutesAgo: 40,
    callType: "TECHNICAL RESCUE",
    status: "onscene",
    address: "600 Sandbox Dr",
    crossStreet: "Trench collapse, one worker trapped (fictional)",
    municipality: "Bethesda",
    lat: 38.9852,
    lng: -77.0997,
    stationArea: 41,
    battalion: 2,
    units: ["RS741", "E741", "T741", "M741", "A741", "BC702"],
    talkgroup: "7A6 Inc 14",
    priority: "1",
  },
  {
    seq: 127,
    minutesAgo: 18,
    callType: "GAS LEAK",
    status: "onscene",
    address: "700 Fictional Pl",
    municipality: "Silver Spring",
    lat: 38.9971,
    lng: -77.0312,
    stationArea: 1,
    battalion: 1,
    units: ["E701", "HM701", "BC701"],
    talkgroup: "7A2 Inc 5",
    priority: "2",
  },
  {
    seq: 117,
    minutesAgo: 50,
    callType: "ALS",
    status: "closed",
    closedMinutesAgo: 5,
    address: "1500 Test Ave",
    municipality: "Takoma Park",
    lat: 38.9779,
    lng: -77.0075,
    stationArea: 2,
    units: ["A702", "M702"],
    priority: "2",
  },
  {
    seq: 120,
    minutesAgo: 40,
    callType: "ELEVATOR RESCUE",
    status: "closed",
    closedMinutesAgo: 3,
    address: "1800 Example Office Plz",
    municipality: "Bethesda",
    lat: 38.9812,
    lng: -77.0963,
    stationArea: 6,
    units: ["E706", "T706"],
    priority: "3",
  },
];

export function buildFixtures(now: Date): Incident[] {
  return FIXTURE_SPECS.map((spec) => makeIncident(now, spec));
}

/** Convenience snapshot relative to module load; prefer `buildFixtures(now)` for fresh times. */
export const FIXTURE_INCIDENTS: Incident[] = buildFixtures(new Date());
