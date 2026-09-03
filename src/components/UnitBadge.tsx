"use client";
import Link from "next/link";
import { parseUnit } from "@/parsers/unit";

const CAT_CLASS: Record<string, string> = {
  engine: "border-[var(--cat-fire)]/60", truck: "border-[var(--cat-alarm)]/60", rescue: "border-[var(--cat-rescue)]/60",
  ambulance: "border-[var(--cat-ems)]/60", medic: "border-[var(--cat-als)]/60", chief: "border-[var(--cat-major)]/60",
  command: "border-[var(--cat-major)]/60", special: "border-[var(--cat-hazmat)]/60", support: "border-line-2", unknown: "border-line-2",
};

export default function UnitBadge({ unit, status, highlight = false, link = true }: { unit: string; status?: string; highlight?: boolean; link?: boolean }) {
  const p = parseUnit(unit);
  const cls = `inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] leading-none ${CAT_CLASS[p.category] ?? ""} ${highlight ? "bg-accent/20 ring-1 ring-accent" : "bg-bg-2"}`;
  const title = `${p.type}${p.station ? ` · Station ${p.station}` : ""}${status ? ` · ${status}` : ""}`;
  const body = <><span>{unit}</span>{status && <span className="text-fg-3">{status.slice(0, 3).toLowerCase()}</span>}</>;
  return link ? <Link href={`/units/${encodeURIComponent(unit)}`} className={cls} title={title} onClick={(e) => e.stopPropagation()}>{body}</Link> : <span className={cls} title={title}>{body}</span>;
}
