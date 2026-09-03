import { createAdapter } from "@/adapters";
import { config } from "@/lib/config";
import { IncidentService } from "./incidentService";

/**
 * Process-wide singleton. Kept on globalThis so Next's dev-mode module reloads
 * don't spawn a second poller. One adapter, one poll loop, many browsers.
 */
const KEY = "__mcfrs_incident_service__" as const;
type G = typeof globalThis & { [KEY]?: IncidentService };

export function incidentService(): IncidentService {
  const g = globalThis as G;
  if (!g[KEY]) {
    const c = config();
    const svc = new IncidentService({ adapter: createAdapter(), pollIntervalMs: c.POLL_INTERVAL_SECONDS * 1000 });
    svc.start();
    g[KEY] = svc;
  }
  return g[KEY];
}
