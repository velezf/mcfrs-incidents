/**
 * Parser for MCFRS apparatus designators ("PE714", "A714", "BC705", "E714B").
 *
 * A designator is LETTERS + NUMBER [+ TRAILING LETTERS]. The letter prefix names
 * the apparatus type; the number is the county unit number, where 7xx means
 * "Montgomery County station xx". The nomenclature table is configurable: pass a
 * custom table to `parseUnit` to override `DEFAULT_NOMENCLATURE` entirely.
 */

export type UnitCategory =
  | "engine"
  | "truck"
  | "rescue"
  | "ambulance"
  | "medic"
  | "chief"
  | "command"
  | "special"
  | "support"
  | "unknown";

export interface UnitNomenclature {
  /** Letter prefix as dispatched, upper case, e.g. "PE". */
  prefix: string;
  /** Human label, e.g. "Paramedic Engine". */
  type: string;
  category: UnitCategory;
  /** Optional qualifier, e.g. "ALS" / "BLS". */
  role?: string;
}

export interface ParsedUnit {
  /** Normalized designator (trimmed, upper case, whitespace and separators removed). */
  unit: string;
  /** Letter prefix, upper case; "" when the designator has none. */
  prefix: string;
  /** Home station (1..MAX_STATION) when derivable from the unit number. */
  station?: number;
  /** Raw numeric part of the designator, e.g. 714. */
  number?: number;
  /** Apparatus type label; "Unknown" when the prefix is not in the nomenclature. */
  type: string;
  category: UnitCategory;
  /** Trailing letters, e.g. "B" in "E714B". */
  suffix?: string;
  /** Optional qualifier from the nomenclature, e.g. "ALS". */
  role?: string;
  /** True when the prefix was found in the nomenclature. */
  known: boolean;
}

/** Highest MCFRS station number considered plausible. */
export const MAX_STATION = 54;

/** County prefix: unit 7xx belongs to station xx. */
export const COUNTY_UNIT_BASE = 700;

const UNKNOWN_TYPE = "Unknown";

/**
 * Default MCFRS nomenclature. Order does not matter for matching (the longest
 * prefix always wins); it is grouped by category for readability.
 */
export const DEFAULT_NOMENCLATURE: UnitNomenclature[] = [
  // Suppression
  { prefix: "PE", type: "Paramedic Engine", category: "engine", role: "ALS" },
  { prefix: "E", type: "Engine", category: "engine" },
  { prefix: "T", type: "Truck", category: "truck" },
  { prefix: "AT", type: "Aerial Tower", category: "truck" },
  { prefix: "TW", type: "Tower", category: "truck" },
  // Rescue
  { prefix: "RS", type: "Rescue Squad", category: "rescue" },
  { prefix: "R", type: "Rescue", category: "rescue" },
  // EMS transport
  { prefix: "A", type: "Ambulance", category: "ambulance", role: "BLS" },
  { prefix: "M", type: "Medic", category: "medic", role: "ALS" },
  // Chiefs and command
  { prefix: "BC", type: "Battalion Chief", category: "chief" },
  { prefix: "DC", type: "Duty Chief", category: "chief" },
  { prefix: "EMS", type: "EMS Duty Officer", category: "command" },
  { prefix: "SO", type: "Safety Officer", category: "command" },
  // Special service
  { prefix: "B", type: "Brush", category: "special" },
  { prefix: "BR", type: "Brush", category: "special" },
  { prefix: "TK", type: "Tanker", category: "special" },
  { prefix: "W", type: "Water Supply", category: "special" },
  { prefix: "MAB", type: "Mobile Ambulance Bus", category: "special" },
  { prefix: "HM", type: "Hazmat", category: "special" },
  { prefix: "CS", type: "Collapse Support", category: "special" },
  // Support
  { prefix: "U", type: "Utility", category: "support" },
];

/**
 * Map a unit number to a station number: 714 -> 14, 705 -> 5. A bare number
 * that is itself a plausible station (1..MAX_STATION) is returned as-is;
 * anything else is undefined.
 */
export function stationFromUnitNumber(n: number): number | undefined {
  if (!Number.isInteger(n) || n <= 0) return undefined;
  const candidate = n > COUNTY_UNIT_BASE && n < COUNTY_UNIT_BASE + 100 ? n - COUNTY_UNIT_BASE : n;
  return candidate >= 1 && candidate <= MAX_STATION ? candidate : undefined;
}

/** Trim, drop whitespace and separator punctuation ("PE-714", "A.714"), upper-case. */
function normalize(designator: string): string {
  return designator.replace(/[\s\-_.]+/g, "").toUpperCase();
}

/** Longest nomenclature prefix that the designator starts with and that is followed by a digit or end of string. */
function matchPrefix(unit: string, nomenclature: UnitNomenclature[]): UnitNomenclature | undefined {
  let best: UnitNomenclature | undefined;
  for (const entry of nomenclature) {
    const prefix = entry.prefix.toUpperCase();
    if (prefix.length === 0 || !unit.startsWith(prefix)) continue;
    const next = unit.charAt(prefix.length);
    if (next !== "" && !/\d/.test(next)) continue;
    if (!best || prefix.length > best.prefix.length) best = entry;
  }
  return best;
}

const DESIGNATOR = /^([A-Z]*)(\d*)([A-Z]*)$/;

export function parseUnit(designator: string, nomenclature: UnitNomenclature[] = DEFAULT_NOMENCLATURE): ParsedUnit {
  const unit = normalize(designator);
  const entry = matchPrefix(unit, nomenclature);

  let prefix: string;
  let rest: string;
  if (entry) {
    prefix = entry.prefix.toUpperCase();
    rest = unit.slice(prefix.length);
  } else {
    const m = DESIGNATOR.exec(unit);
    prefix = m ? m[1] : "";
    rest = m ? unit.slice(prefix.length) : "";
  }

  const tail = /^(\d*)([A-Z]*)$/.exec(rest);
  const digits = tail ? tail[1] : "";
  const suffix = tail && tail[2].length > 0 ? tail[2] : undefined;
  const number = digits.length > 0 ? Number.parseInt(digits, 10) : undefined;
  const station = number === undefined ? undefined : stationFromUnitNumber(number);

  return {
    unit,
    prefix,
    station,
    number,
    type: entry ? entry.type : UNKNOWN_TYPE,
    category: entry ? entry.category : "unknown",
    suffix,
    role: entry?.role,
    known: entry !== undefined,
  };
}

export function isStationUnit(unit: string, station: number, nomenclature: UnitNomenclature[] = DEFAULT_NOMENCLATURE): boolean {
  return parseUnit(unit, nomenclature).station === station;
}

export function unitsAtStation(units: string[], station: number, nomenclature: UnitNomenclature[] = DEFAULT_NOMENCLATURE): string[] {
  return units.filter((u) => isStationUnit(u, station, nomenclature));
}
