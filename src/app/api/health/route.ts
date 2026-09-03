import { incidentService } from "@/services/server";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const svc = incidentService();
  return json({ health: svc.getHealth(), adapter: svc.opts.adapter.describe(), serverTime: new Date().toISOString() });
}
