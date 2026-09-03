"use client";
import { memo } from "react";
import type { IncidentWire } from "@/types/incident";
import { categoryStyle, STATUS_LABEL } from "@/lib/categories";
import { elapsed, hhmmss, shortAddress } from "@/lib/format";
import { isMajor, unitStation } from "@/lib/filters";
import CategoryBadge from "./CategoryBadge";
import UnitBadge from "./UnitBadge";

interface Props { incident: IncidentWire; selected: boolean; fresh: boolean; focusStation: number; now: number | null; onSelect: (id: string) => void }

function IncidentCardInner({ incident: i, selected, fresh, focusStation, now, onSelect }: Props) {
  const s = categoryStyle(i.category);
  const major = isMajor(i);
  const focusInvolved = i.stationArea === focusStation || i.units.some((u) => unitStation(u.unit) === focusStation);
  return (
    <button
      type="button"
      onClick={() => onSelect(i.id)}
      aria-pressed={selected}
      className={`w-full text-left border-b border-line px-3 py-2 transition-colors ${selected ? "bg-bg-3" : "hover:bg-bg-2"} ${fresh ? "flash-in" : ""}`}
      style={{ borderLeft: `3px solid var(--${s.token})` }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-fg-2 tabular-nums">{hhmmss(i.dispatchedAt, false)}</span>
        {now !== null && <span className="font-mono text-[11px] text-fg-3 tabular-nums">+{elapsed(i.dispatchedAt, now)}</span>}
        <CategoryBadge category={i.category} />
        {major && <span className="rounded bg-[var(--cat-major)]/20 px-1 font-mono text-[10px] text-[var(--cat-major)]">MAJOR</span>}
        {i.alarmLevel && <span className="font-mono text-[10px] text-warn">{i.alarmLevel}</span>}
        {focusInvolved && <span className="ml-auto rounded border border-accent/60 px-1 font-mono text-[10px] text-accent">STA {focusStation}</span>}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-semibold text-fg truncate">{i.callType}{i.callSubtype ? <span className="font-normal text-fg-2"> · {i.callSubtype}</span> : null}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-2">{STATUS_LABEL[i.status] ?? i.status}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-fg-1">
        <span className="truncate" title={i.address}>{shortAddress(i.address)}</span>
        {i.municipality && <span className="shrink-0 text-fg-2">{i.municipality}</span>}
        {i.stationArea !== undefined && <span className="shrink-0 font-mono text-[11px] text-fg-3">A{i.stationArea}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {i.units.slice(0, 8).map((u) => <UnitBadge key={u.unit} unit={u.unit} type={u.type} category={u.category} station={u.station} highlight={(u.station ?? unitStation(u.unit)) === focusStation} link={false} />)}
        {i.units.length > 8 && <span className="font-mono text-[10px] text-fg-3">+{i.units.length - 8}</span>}
        <span className="ml-auto font-mono text-[10px] text-fg-3">{i.units.length}u{i.talkgroup ? ` · ${i.talkgroup}` : i.channel ? ` · ${i.channel}` : ""}</span>
      </div>
    </button>
  );
}
const IncidentCard = memo(IncidentCardInner);
export default IncidentCard;
