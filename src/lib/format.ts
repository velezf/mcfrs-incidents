/** Small display helpers shared by components. */
export function hhmmss(iso: string | Date, seconds = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false });
}
export function elapsed(fromIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}
export function ago(iso?: string, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} sec ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
}
/** "12345 Example Farm Rd" -> "12345 Example Farm Rd"; long addresses truncated for cards. */
export function shortAddress(a?: string, max = 34): string {
  if (!a) return "—";
  return a.length > max ? a.slice(0, max - 1) + "…" : a;
}
