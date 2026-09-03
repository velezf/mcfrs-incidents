import type { AdapterDescription, FetchResult, SourceAdapter } from "@/adapters/types";
import { config } from "@/lib/config";

/**
 * Everbridge Member Portal adapter — PHASE 3 STUB.
 *
 * Everything below the config plumbing is deliberately unimplemented until the
 * sanitized "Copy as cURL" capture is analysed. Do not guess field meanings.
 *
 * What the capture must tell us (checklist for the analysis step):
 *  - exact URL and method; whether org / member-portal ids are path or query params
 *  - required headers (Accept, X-Requested-With, CSRF tokens, Referer/Origin checks)
 *  - authentication: cookie session vs bearer token; expiry/renewal behaviour
 *  - pagination / page size, and whether closed incidents are included
 *  - the response schema: which field is the incident id, dispatch time (and its
 *    timezone), call type, address, coordinates (if any), units (string vs array),
 *    status vocabulary, and anything that looks like talkgroup/alarm level
 *  - polling etiquette: rate limits, ETag/If-Modified-Since support
 */
export class EverbridgeAdapter implements SourceAdapter {
  readonly name = "everbridge";

  describe(): AdapterDescription {
    const c = config();
    return {
      name: this.name,
      config: {
        EVERBRIDGE_INCIDENT_URL: c.EVERBRIDGE_INCIDENT_URL ?? "(unset)",
        EVERBRIDGE_ORGANIZATION_ID: c.EVERBRIDGE_ORGANIZATION_ID ?? "(unset)",
        EVERBRIDGE_MEMBER_PORTAL_ID: c.EVERBRIDGE_MEMBER_PORTAL_ID ?? "(unset)",
        EVERBRIDGE_AUTH_TOKEN: c.EVERBRIDGE_AUTH_TOKEN ? "(set)" : "(unset)",
        EVERBRIDGE_EXTRA_HEADERS: c.EVERBRIDGE_EXTRA_HEADERS ? "(set)" : "(unset)",
        POLL_INTERVAL_SECONDS: String(c.POLL_INTERVAL_SECONDS),
      },
      notes: ["Not implemented: awaiting the sanitized cURL capture (phase 3).", "Member Portal id is NOT assumed to equal the REST API organization id."],
    };
  }

  async fetchActive(): Promise<FetchResult> {
    throw new Error("EverbridgeAdapter is not implemented yet (phase 3): provide the sanitized cURL capture first.");
  }
}
