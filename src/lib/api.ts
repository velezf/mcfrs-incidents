import { config } from "@/lib/config";
import { applyPrivacy } from "@/lib/privacy";
import { toWire, type Incident, type IncidentWire } from "@/types/incident";

/** Every incident leaving the server goes through here: privacy, then wire form (no rawPayload). */
export function outbound(i: Incident): IncidentWire {
  const c = config();
  return toWire(applyPrivacy(i, { mode: c.PRIVACY_MODE, maskMedicalAddresses: c.MASK_MEDICAL_ADDRESSES, precision: c.PUBLIC_MAP_ADDRESS_PRECISION }));
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}
