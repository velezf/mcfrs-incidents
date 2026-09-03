import type { Incident, IncidentCategory } from "@/types/incident";

/**
 * Privacy transforms, applied SERVER-SIDE before an incident reaches a public browser.
 * Member mode passes everything through. Public mode strips what could identify a
 * patient or a residence for medical calls.
 */
export interface PrivacyOptions {
  mode: "member" | "public";
  maskMedicalAddresses: boolean;
  precision: "exact" | "block" | "street";
}

const MEDICAL: ReadonlySet<IncidentCategory> = new Set(["ems", "als", "bls", "mass_casualty"]);

export function isMedical(category: IncidentCategory): boolean {
  return MEDICAL.has(category);
}

/** "12345 Example Farm Rd" -> block: "12300 blk Example Farm Rd", street: "Example Farm Rd". */
export function maskAddress(address: string, precision: "exact" | "block" | "street"): string {
  if (precision === "exact") return address;
  const m = address.match(/^\s*(\d+)([A-Za-z]?)\s+(.+)$/);
  if (!m) return address; // no house number: nothing to hide
  const [, num, , street] = m;
  if (precision === "street") return street;
  const n = parseInt(num, 10);
  const block = Math.floor(n / 100) * 100;
  return `${block} blk ${street}`;
}

/** Snap a coordinate to ~0.002° (~200 m) so a sensitive point is not a rooftop. */
export function fuzzCoordinate(v: number, step = 0.002): number {
  return Math.round(v / step) * step;
}

export function applyPrivacy(incident: Incident, opts: PrivacyOptions): Incident {
  if (opts.mode === "member") return incident;
  const sensitive = opts.maskMedicalAddresses && isMedical(incident.category);
  const out: Incident = { ...incident, rawPayload: undefined };
  if (sensitive) {
    if (out.address) out.address = maskAddress(out.address, opts.precision);
    out.crossStreet = undefined;
    if (typeof out.latitude === "number") out.latitude = fuzzCoordinate(out.latitude);
    if (typeof out.longitude === "number") out.longitude = fuzzCoordinate(out.longitude);
  }
  return out;
}
