import { incidentService } from "@/services/server";
import { buildTimeline } from "@/services/timeline";
import { json, outbound } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const i = incidentService().getById(decodeURIComponent(id));
  if (!i) return json({ error: "not found" }, { status: 404 });
  return json({ incident: outbound(i), timeline: buildTimeline(i).map((e) => ({ ...e, at: e.at.toISOString() })) });
}
