import { incidentService } from "@/services/server";
import { json, outbound } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Closed incidents observed by THIS instance (not the official record). Filters in phase 2 with the database. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
  return json({ incidents: incidentService().getHistory().slice(0, limit).map(outbound), note: "Locally observed feed; not the official MCFRS record." });
}
