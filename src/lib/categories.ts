import type { IncidentCategory } from "@/types/incident";

/**
 * How each category LOOKS. Colour is never the only cue: every category has a
 * short text code and a glyph. Colours are CSS variables defined in globals.css
 * so both themes stay readable.
 */
export interface CategoryStyle {
  label: string;
  /** 2–4 letter code shown on badges/markers. */
  code: string;
  /** Simple glyph (emoji-free, monochrome-safe). */
  glyph: string;
  /** CSS colour token name, e.g. "cat-fire". */
  token: string;
  severity: 1 | 2 | 3 | 4 | 5;
}

export const CATEGORY_STYLES: Record<IncidentCategory, CategoryStyle> = {
  ems:             { label: "EMS",              code: "EMS",  glyph: "+",  token: "cat-ems",     severity: 1 },
  bls:             { label: "BLS",              code: "BLS",  glyph: "+",  token: "cat-ems",     severity: 1 },
  als:             { label: "ALS",              code: "ALS",  glyph: "+",  token: "cat-als",     severity: 2 },
  fire_alarm:      { label: "Fire Alarm",       code: "ALRM", glyph: "◇",  token: "cat-alarm",   severity: 2 },
  structure_fire:  { label: "Structure Fire",   code: "FIRE", glyph: "▲",  token: "cat-fire",    severity: 4 },
  working_fire:    { label: "Working Fire",     code: "WKG",  glyph: "▲",  token: "cat-fire",    severity: 5 },
  brush_fire:      { label: "Brush Fire",       code: "BRSH", glyph: "▲",  token: "cat-fire",    severity: 3 },
  vehicle_fire:    { label: "Vehicle Fire",     code: "VFIR", glyph: "▲",  token: "cat-fire",    severity: 3 },
  collision:       { label: "Collision",        code: "PIC",  glyph: "✕",  token: "cat-collision", severity: 2 },
  rescue:          { label: "Rescue",           code: "RESC", glyph: "⊕",  token: "cat-rescue",  severity: 3 },
  technical_rescue:{ label: "Technical Rescue", code: "TECH", glyph: "⊕",  token: "cat-rescue",  severity: 4 },
  water_rescue:    { label: "Water Rescue",     code: "WATR", glyph: "≈",  token: "cat-water",   severity: 4 },
  hazmat:          { label: "Hazmat",           code: "HAZ",  glyph: "☢",  token: "cat-hazmat",  severity: 4 },
  mass_casualty:   { label: "Mass Casualty",    code: "MCI",  glyph: "+",  token: "cat-major",   severity: 5 },
  special_ops:     { label: "Special Ops",      code: "SPEC", glyph: "◆",  token: "cat-major",   severity: 5 },
  service:         { label: "Service",          code: "SVC",  glyph: "○",  token: "cat-service", severity: 1 },
  other:           { label: "Other",            code: "OTHR", glyph: "○",  token: "cat-service", severity: 1 },
};

export const FIRE_CATEGORIES: ReadonlySet<IncidentCategory> = new Set(["fire_alarm", "structure_fire", "working_fire", "brush_fire", "vehicle_fire"]);
export const EMS_CATEGORIES: ReadonlySet<IncidentCategory> = new Set(["ems", "als", "bls", "mass_casualty"]);
export const RESCUE_CATEGORIES: ReadonlySet<IncidentCategory> = new Set(["rescue", "technical_rescue", "water_rescue", "collision"]);

export function categoryStyle(c: IncidentCategory): CategoryStyle {
  return CATEGORY_STYLES[c] ?? CATEGORY_STYLES.other;
}

export const STATUS_LABEL: Record<string, string> = {
  dispatching: "Dispatching", dispatched: "Dispatched", responding: "Responding", onscene: "On Scene",
  transporting: "Transporting", closed: "Closed", unknown: "—",
};
