import type { Incident } from "@/types/incident";

/**
 * A source adapter fetches the upstream's current view of active incidents and
 * returns them already normalized. Adapters own everything source-specific:
 * endpoint, auth, pagination, field meanings. They run server-side only.
 *
 * Contract:
 *  - `fetchActive()` returns the complete current active set (not a delta).
 *    Change detection (new / changed / closed) is done downstream by comparing
 *    successive snapshots, so an incident missing from a snapshot is "closed".
 *  - Never throw for a partially bad payload: skip the bad record, report it via
 *    `ParseReport.errors`, return the rest.
 *  - `rawPayload` on each incident keeps the original record for the admin page.
 */
export interface SourceAdapter {
  /** Short stable name, used as `Incident.rawSource` and the id prefix. */
  readonly name: string;
  /** One poll. Resolves with the current active incidents and a parse report. */
  fetchActive(): Promise<FetchResult>;
  /** Human-readable, secret-free description of the configuration for the admin page. */
  describe(): AdapterDescription;
}

export interface FetchResult {
  incidents: Incident[];
  report: ParseReport;
  /** Raw response sample for the admin page (already sanitized of auth material). */
  rawSample?: unknown;
}

export interface ParseReport {
  fetchedAt: Date;
  latencyMs: number;
  received: number;
  parsed: number;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  /** Index or upstream id of the record that failed, for correlation. */
  record?: string;
}

export interface AdapterDescription {
  name: string;
  /** Config keys and their values with secrets replaced by "(set)"/"(unset)". */
  config: Record<string, string>;
  notes?: string[];
}
