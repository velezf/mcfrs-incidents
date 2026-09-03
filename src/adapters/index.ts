import { config } from "@/lib/config";
import type { SourceAdapter } from "./types";
import { MockAdapter } from "./mock";
import { EverbridgeAdapter } from "./everbridge";

/** Adapter selection is the ONLY place INCIDENT_SOURCE is read. */
export function createAdapter(): SourceAdapter {
  const c = config();
  switch (c.INCIDENT_SOURCE) {
    case "everbridge":
      return new EverbridgeAdapter();
    case "mock":
    default:
      return new MockAdapter({ seed: c.MOCK_SEED, spawnEverySeconds: c.MOCK_SPAWN_SECONDS, speed: c.MOCK_SPEED });
  }
}
