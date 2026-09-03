import type { IncidentWire, IncidentCategory, IncidentStatus } from "@/types/incident";
import { EMS_CATEGORIES, FIRE_CATEGORIES, RESCUE_CATEGORIES, categoryStyle } from "@/lib/categories";

/**
 * Client-side filtering and search over the active list. Pure so it can be
 * tested; the store just holds a Filters value and calls applyFilters().
 */
export interface Filters {
  categories: IncidentCategory[];   // empty = all
  statuses: IncidentStatus[];       // empty = all
  stationAreas: number[];           // empty = all
  municipalities: string[];         // empty = all
  battalions: number[];             // empty = all
  unitPrefixes: string[];           // apparatus type prefixes, e.g. ["PE","E"]; empty = all
  unitQuery: string;                // substring on unit designators, e.g. "714"
  stationUnits: number[];           // any unit from these stations, e.g. [14] matches PE714, A714
  minUnits: number;                 // 0 = no minimum
  majorOnly: boolean;
  withinKm?: { latitude: number; longitude: number; km: number };
  search: string;                   // free text across number/address/muni/units/type
}

export const EMPTY_FILTERS: Filters = {
  categories: [], statuses: [], stationAreas: [], municipalities: [], battalions: [], unitPrefixes: [], unitQuery: "",
  stationUnits: [], minUnits: 0, majorOnly: false, search: "",
};

export interface Preset {
  id: string;
  label: string;
  filters: Partial<Filters>;
  /** Presets that reference the focus station take it from config; `focus` marks them. */
  focus?: boolean;
}

export function builtinPresets(focusStation: number): Preset[] {
  return [
    { id: "focus-station", label: `Station ${focusStation}`, focus: true, filters: { stationUnits: [focusStation] } },
    { id: "focus-area", label: `Station ${focusStation} area`, focus: true, filters: { stationAreas: [focusStation] } },
    { id: "focus-units", label: `Any 7${String(focusStation).padStart(2, "0")} unit`, focus: true, filters: { unitQuery: `7${String(focusStation).padStart(2, "0")}` } },
    { id: "working", label: "Working incidents", filters: { categories: ["working_fire", "structure_fire", "mass_casualty", "special_ops", "technical_rescue", "water_rescue", "hazmat"], minUnits: 4 } },
    { id: "structure", label: "Structure fires", filters: { categories: ["structure_fire", "working_fire"] } },
    { id: "rescue", label: "Rescue assignments", filters: { categories: ["rescue", "technical_rescue", "water_rescue"] } },
    { id: "hazmat", label: "Hazmat", filters: { categories: ["hazmat"] } },
    { id: "tech", label: "Technical rescue", filters: { categories: ["technical_rescue"] } },
    { id: "water", label: "Water rescue", filters: { categories: ["water_rescue"] } },
    { id: "multi", label: "Multi-unit (5+)", filters: { minUnits: 5 } },
    { id: "fire", label: "Fire only", filters: { categories: [...FIRE_CATEGORIES] } },
    { id: "ems", label: "EMS only", filters: { categories: [...EMS_CATEGORIES] } },
    { id: "major", label: "Countywide major", filters: { majorOnly: true } },
  ];
}

const UNIT_RE = /^([A-Z]+)(\d+)([A-Z]?)$/;

export function unitStation(unit: string): number | undefined {
  const m = unit.toUpperCase().replace(/\s+/g, "").match(UNIT_RE);
  if (!m) return undefined;
  const n = parseInt(m[2], 10);
  if (n >= 700 && n <= 799) return n - 700;
  return n >= 1 && n <= 99 ? n : undefined;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function isMajor(i: IncidentWire): boolean {
  const s = categoryStyle(i.category);
  return s.severity >= 4 || i.units.length >= 6 || Boolean(i.alarmLevel && !/^(1st|1|first)/i.test(i.alarmLevel));
}

export function matchesSearch(i: IncidentWire, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [i.incidentNumber, i.address, i.crossStreet, i.municipality, i.callType, i.callSubtype, i.talkgroup, i.channel,
    i.stationArea !== undefined ? `station ${i.stationArea}` : "", i.stationArea !== undefined ? String(i.stationArea) : "",
    ...i.units.map((u) => u.unit)].filter(Boolean).join(" ").toLowerCase();
  return s.split(/\s+/).every((term) => hay.includes(term));
}

export function applyFilters(list: IncidentWire[], f: Filters): IncidentWire[] {
  return list.filter((i) => {
    if (f.categories.length && !f.categories.includes(i.category)) return false;
    if (f.statuses.length && !f.statuses.includes(i.status)) return false;
    if (f.stationAreas.length && (i.stationArea === undefined || !f.stationAreas.includes(i.stationArea))) return false;
    if (f.battalions.length && (i.battalion === undefined || !f.battalions.includes(i.battalion))) return false;
    if (f.municipalities.length && !f.municipalities.some((m) => m.toLowerCase() === (i.municipality ?? "").toLowerCase())) return false;
    if (f.unitPrefixes.length && !i.units.some((u) => f.unitPrefixes.some((p) => u.unit.toUpperCase().startsWith(p.toUpperCase()) && !/^[A-Z]/.test(u.unit.slice(p.length))))) return false;
    if (f.unitQuery && !i.units.some((u) => u.unit.toUpperCase().includes(f.unitQuery.toUpperCase()))) return false;
    if (f.stationUnits.length && !i.units.some((u) => { const s = unitStation(u.unit); return s !== undefined && f.stationUnits.includes(s); })) return false;
    if (f.minUnits > 0 && i.units.length < f.minUnits) return false;
    if (f.majorOnly && !isMajor(i)) return false;
    if (f.withinKm) {
      if (i.latitude === undefined || i.longitude === undefined) return false;
      if (haversineKm(f.withinKm.latitude, f.withinKm.longitude, i.latitude, i.longitude) > f.withinKm.km) return false;
    }
    return matchesSearch(i, f.search);
  });
}

export function isFilterActive(f: Filters): boolean {
  return Boolean(f.categories.length || f.statuses.length || f.stationAreas.length || f.municipalities.length || f.battalions.length ||
    f.unitPrefixes.length || f.unitQuery || f.stationUnits.length || f.minUnits || f.majorOnly || f.withinKm || f.search.trim());
}

export type SortMode = "newest" | "severity";
export function sortIncidents(list: IncidentWire[], mode: SortMode): IncidentWire[] {
  const byTime = (a: IncidentWire, b: IncidentWire) => b.dispatchedAt.localeCompare(a.dispatchedAt);
  if (mode === "newest") return [...list].sort(byTime);
  return [...list].sort((a, b) => categoryStyle(b.category).severity - categoryStyle(a.category).severity || b.units.length - a.units.length || byTime(a, b));
}

/** Convenience for "nearby incidents likely to affect station N". */
export function involvesStation(i: IncidentWire, station: number): boolean {
  return i.stationArea === station || i.units.some((u) => unitStation(u.unit) === station);
}
export { RESCUE_CATEGORIES };
