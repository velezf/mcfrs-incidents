"use client";
import Link from "next/link";
import { unitStation } from "@/lib/filters";

const CAT_CLASS: Record<string, string> = {
  engine: "border-[var(--cat-fire)]/60", truck: "border-[var(--cat-alarm)]/60", rescue: "border-[var(--cat-rescue)]/60",
  ambulance: "border-[var(--cat-ems)]/60", medic: "border-[var(--cat-als)]/60", chief: "border-[var(--cat-major)]/60",
  command: "border-[var(--cat-major)]/60", special: "border-[var(--cat-hazmat)]/60", support: "border-line-2", unknown: "border-line-2",
};

interface Props { unit: string; type?: string | null; category?: string | null; station?: number | null; status?: string | null; highlight?: boolean; link?: boolean }

/** Type/category/station come from the API (its nomenclature is the authority); the badge only displays them. */
export default function UnitBadge({ unit, type, category, station, status, highlight = false, link = true }: Props) {
  const sta = station ?? unitStation(unit);
  const cls = `inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none ${CAT_CLASS[category ?? "unknown"] ?? ""} ${highlight ? "bg-accent/20 ring-1 ring-accent" : "bg-bg-2"}`;
  const title = `${type ?? "unit"}${sta ? ` · Station ${sta}` : ""}${status ? ` · ${status}` : ""}`;
  const body = <><span>{unit}</span>{status && <span className="text-fg-3">{status.slice(0, 3).toLowerCase()}</span>}</>;
  return link ? <Link href={`/units/${encodeURIComponent(unit)}`} className={cls} title={title} onClick={(e) => e.stopPropagation()}>{body}</Link> : <span className={cls} title={title}>{body}</span>;
}
