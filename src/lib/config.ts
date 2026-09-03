import { z } from "zod";

/**
 * All configuration comes from the environment (.env for local dev). Parsed once,
 * server-side only. Nothing in here may be imported by client components: secrets
 * live in `secret` fields and are never serialized (see `publicConfig()`).
 */
const schema = z.object({
  INCIDENT_SOURCE: z.enum(["mock", "everbridge"]).default("mock"),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(600).default(15),

  // Focus station for "Station N mode"; 14 = Upper Montgomery County VFD. Configurable, not hard-coded.
  FOCUS_STATION: z.coerce.number().int().min(1).max(99).default(14),

  // Privacy (applied server-side before data reaches a public browser).
  PRIVACY_MODE: z.enum(["member", "public"]).default("member"),
  MASK_MEDICAL_ADDRESSES: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  PUBLIC_MAP_ADDRESS_PRECISION: z.enum(["exact", "block", "street"]).default("block"),

  // Everbridge member-portal adapter (phase 3). Unknowns stay unknown until the captured request is analysed.
  EVERBRIDGE_INCIDENT_URL: z.string().optional(),
  EVERBRIDGE_ORGANIZATION_ID: z.string().optional(),
  EVERBRIDGE_MEMBER_PORTAL_ID: z.string().optional(),
  EVERBRIDGE_AUTH_TOKEN: z.string().optional(),
  EVERBRIDGE_EXTRA_HEADERS: z.string().optional(), // JSON object of extra request headers

  // Mock adapter tuning
  MOCK_SEED: z.coerce.number().int().default(1),
  MOCK_SPAWN_SECONDS: z.coerce.number().int().min(5).default(45),
  MOCK_SPEED: z.coerce.number().min(0.1).max(100).default(1),

  // PostgreSQL. Unset = in-memory storage (history lost on restart).
  DATABASE_URL: z.string().optional(),

  // Admin/debug page protection (phase 5 hardens this; a shared token is the floor).
  ADMIN_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;
export function config(): Config {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

const SECRET_KEYS: (keyof Config)[] = ["EVERBRIDGE_AUTH_TOKEN", "EVERBRIDGE_EXTRA_HEADERS", "ADMIN_TOKEN", "DATABASE_URL"];

/** Config with secrets replaced, safe for the admin page and logs. */
export function describeConfig(): Record<string, string> {
  const c = config();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) {
    out[k] = SECRET_KEYS.includes(k as keyof Config) ? (v ? "(set)" : "(unset)") : String(v ?? "");
  }
  return out;
}

/** The subset a browser may know. */
export function publicConfig() {
  const c = config();
  return { focusStation: c.FOCUS_STATION, privacyMode: c.PRIVACY_MODE, pollIntervalSeconds: c.POLL_INTERVAL_SECONDS, source: c.INCIDENT_SOURCE };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
