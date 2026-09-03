import { incidentService } from "@/services/server";
import { json, outbound } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const svc = incidentService();
  return json({ incidents: svc.getActive().map(outbound), health: svc.getHealth(), serverTime: new Date().toISOString() });
}
