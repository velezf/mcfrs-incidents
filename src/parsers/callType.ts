/**
 * Classify a dispatched call-type string ("HOUSE FIRE", "PIC", "ALS1") into an
 * IncidentCategory plus a display label and a severity rank. The rule table is
 * ordered, first match wins, and is exported so callers can supply their own.
 *
 * Categories are for icons and filters only; never trust them for anything
 * safety-critical (see Incident.category).
 */

import type { IncidentCategory } from "@/types/incident";

/** 1 = routine service call, 5 = working structure fire / mass casualty. */
export type CallSeverity = 1 | 2 | 3 | 4 | 5;

export interface CallTypeInfo {
  category: IncidentCategory;
  label: string;
  severity: CallSeverity;
  /** True for incidents worth surfacing prominently (working fire, MCI, special ops). */
  major: boolean;
}

export interface CallTypeRule {
  /** Tested against the whitespace-collapsed call type. Must carry the `i` flag. */
  pattern: RegExp;
  category: IncidentCategory;
  /** Display label; when omitted the call type text is title-cased. */
  label?: string;
  severity: CallSeverity;
  major?: boolean;
}

const FALLBACK: Omit<CallTypeInfo, "label"> = { category: "other", severity: 1, major: false };

/**
 * Ordered rule table. Earlier rules win, so the list runs from most to least
 * specific: escalations (working fire, MCI) first, then hazard families whose
 * phrasing overlaps generic words ("COLLAPSE" before "STRUCTURE FIRE",
 * "WATER RESCUE" before "RESCUE"), then EMS, then service and the fallback.
 */
export const CALL_TYPE_RULES: CallTypeRule[] = [
  // Top-severity escalations
  { pattern: /WORKING\s*FIRE/i, category: "working_fire", label: "Working Fire", severity: 5, major: true },
  { pattern: /MASS\s*CASUALTY|\bMCI\b/i, category: "mass_casualty", label: "Mass Casualty Incident", severity: 5, major: true },
  {
    pattern: /SPECIAL\s*OP(ERATION)?S?\b|\bBOMB\b|EXPLOSI(ON|VE)|ACTIVE\s*(ASSAILANT|SHOOTER|THREAT)/i,
    category: "special_ops",
    label: "Special Operations",
    severity: 5,
    major: true,
  },

  // Hazard families with overlapping vocabulary
  {
    pattern: /HAZ\s*-?\s*MAT|GAS\s*LEAK|ODOR\s*OF\s*(NATURAL\s*)?GAS|NATURAL\s*GAS|CHEMICAL|FUEL\s*SPILL|\bSPILL\b/i,
    category: "hazmat",
    label: "Hazmat",
    severity: 3,
  },
  {
    pattern: /WATER\s*RESCUE|SWIFT\s*WATER|\bRIVER\b|DROWN|\bBOAT\b|\bCREEK\b/i,
    category: "water_rescue",
    label: "Water Rescue",
    severity: 4,
  },
  {
    pattern: /TECH(NICAL)?\s*RESCUE|CONFINED\s*SPACE|TRENCH|COLLAPSE|HIGH\s*ANGLE|ROPE\s*RESCUE|MACHINERY/i,
    category: "technical_rescue",
    label: "Technical Rescue",
    severity: 4,
  },

  // Fires. "FIRE ALARM" must not read as a structure fire, so alarms come first.
  {
    pattern: /FIRE\s*ALARM|ALARM\s*(SOUNDING|BELLS?|ACTIVATION)|\bCO\s*(ALARM|DETECTOR)|CARBON\s*MONOXIDE|SMOKE\s*(DETECTOR|ALARM)|WATER\s*FLOW/i,
    category: "fire_alarm",
    label: "Fire Alarm",
    severity: 2,
  },
  {
    pattern: /(HOUSE|APARTMENT|APT|BUILDING|STRUCTURE|TOWNHOUSE|COMMERCIAL|DWELLING|HIGH\s*-?\s*RISE|GARAGE|BASEMENT|CHIMNEY)\s*FIRE/i,
    category: "structure_fire",
    label: "Structure Fire",
    severity: 4,
  },
  {
    pattern: /(VEHICLE|CAR|AUTO|TRUCK|BUS|MOTORCYCLE|TRACTOR\s*TRAILER)\s*FIRE/i,
    category: "vehicle_fire",
    label: "Vehicle Fire",
    severity: 2,
  },
  {
    pattern: /(BRUSH|OUTSIDE|WOODS|GRASS|FIELD|MULCH|WILDLAND|TRASH|DUMPSTER)\s*FIRE/i,
    category: "brush_fire",
    label: "Brush Fire",
    severity: 2,
  },

  // Collisions. Entrapment / rollover escalates to rescue.
  {
    pattern: /ENTRAP|OVERTURN|ROLL\s*-?\s*OVER|PINNED/i,
    category: "rescue",
    label: "Collision with Entrapment",
    severity: 4,
  },
  {
    pattern: /\bPIC\b|PERSONAL\s*INJURY|\bMVC\b|\bMVA\b|(AUTO|VEHICLE|MOTOR\s*VEHICLE|MOTORCYCLE|BICYCLE|BIKE)\s*(ACCIDENT|CRASH)|COLLISION|\bCRASH\b|(PEDESTRIAN|PED|BICYCLIST|CYCLIST)\s*STRUCK/i,
    category: "collision",
    label: "Personal Injury Collision",
    severity: 3,
  },

  // EMS
  {
    pattern:
      /\bALS\s?\d?\b|CARDIAC|CHEST\s*PAIN|STROKE|\bCVA\b|DIFF(ICULTY)?\s*BREATH|SHORTNESS\s*OF\s*BREATH|\bSOB\b|UNCONSCIOUS|UNRESPONSIVE|SEIZURE|OVERDOSE|\bOD\b|ALLERGIC|ANAPHYLA|CHOKING|SHOOTING|STABBING|GUNSHOT|\bGSW\b|TRAUMA/i,
    category: "als",
    label: "ALS",
    severity: 3,
  },
  {
    pattern: /\bBLS\s?\d?\b|SICK\s*PERSON|\bSICK\b|\bFALLS?\b|BACK\s*PAIN|ABDOMINAL|NAUSEA|MEDICAL\s*ALARM|LIFT\s*ASSIST/i,
    category: "bls",
    label: "BLS",
    severity: 2,
  },

  // Generic rescue (after water / technical / entrapment above)
  { pattern: /ELEVATOR|\bRESCUE\b|TRAPPED|LOCKED\s*IN\b|ANIMAL/i, category: "rescue", label: "Rescue", severity: 3 },
  { pattern: /LOCK\s*-?\s*OUT|LOCKED\s*OUT/i, category: "rescue", label: "Lockout", severity: 1 },

  // Generic EMS (after ALS / BLS / lift assist)
  { pattern: /\bEMS\b|MEDICAL|\bMEDIC\b|INJUR|\bILL\b|PATIENT|BLEED/i, category: "ems", label: "EMS", severity: 2 },

  // Any other fire ("ELECTRICAL FIRE", "APPLIANCE FIRE"): category unknown, but it
  // is still a fire, so it outranks a service call and never falls into one.
  { pattern: /\bFIRE\b/i, category: "other", label: "Fire", severity: 3 },

  // Service
  {
    pattern:
      /SERVICE\s*CALL|PUBLIC\s*SERVICE|\bASSIST|WIRES?\s*DOWN|TREE\s*DOWN|POLE\s*DOWN|INVESTIGAT|WATER\s*(LEAK|PROBLEM)|FLOOD|ELECTRICAL\s*(PROBLEM|HAZARD|ODOR)|TRANSFORMER|STAND\s*-?\s*BY|\bDETAIL\b|\bCOVER\b/i,
    category: "service",
    label: "Service Call",
    severity: 1,
  },
];

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface Matched {
  info: CallTypeInfo;
  matched: boolean;
}

function classifyOne(text: string, rules: CallTypeRule[]): Matched {
  const normalized = normalize(text);
  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      return {
        matched: true,
        info: {
          category: rule.category,
          label: rule.label ?? titleCase(normalized),
          severity: rule.severity,
          major: rule.major ?? false,
        },
      };
    }
  }
  return {
    matched: false,
    info: { ...FALLBACK, label: normalized.length > 0 ? titleCase(normalized) : "Other" },
  };
}

/**
 * Classify a call type, optionally escalated by a subtype: the subtype's
 * classification is used when it outranks the call type's severity, or when the
 * call type itself is unrecognized. A subtype never de-escalates.
 */
export function classifyCallType(callType: string, subtype?: string, rules: CallTypeRule[] = CALL_TYPE_RULES): CallTypeInfo {
  const primary = classifyOne(callType, rules);
  if (subtype === undefined || normalize(subtype).length === 0) return primary.info;

  const secondary = classifyOne(subtype, rules);
  if (!secondary.matched) return primary.info;
  if (!primary.matched || secondary.info.severity > primary.info.severity) return secondary.info;
  return primary.info;
}
