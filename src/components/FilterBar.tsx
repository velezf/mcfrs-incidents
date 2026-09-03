"use client";
import { useMemo, useState } from "react";
import { useDashboard } from "@/store/dashboard";
import { builtinPresets, type Preset } from "@/lib/filters";
import { CATEGORY_STYLES } from "@/lib/categories";
import { INCIDENT_CATEGORIES, INCIDENT_STATUSES, type IncidentCategory, type IncidentStatus } from "@/types/incident";

const APPARATUS = ["PE", "E", "T", "AT", "A", "M", "RS", "BC", "B", "W", "HM"];

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] leading-tight ${on ? "border-accent bg-accent/20 text-fg" : "border-line-2 text-fg-1 hover:bg-bg-2"}`}>
      {children}
    </button>
  );
}

export default function FilterBar() {
  const filters = useDashboard((s) => s.filters);
  const setFilters = useDashboard((s) => s.setFilters);
  const clearFilters = useDashboard((s) => s.clearFilters);
  const applyPreset = useDashboard((s) => s.applyPreset);
  const activePresetId = useDashboard((s) => s.activePresetId);
  const focusStation = useDashboard((s) => s.focusStation);
  const saved = useDashboard((s) => s.savedPresets);
  const savePreset = useDashboard((s) => s.savePreset);
  const deletePreset = useDashboard((s) => s.deletePreset);
  const incidents = useDashboard((s) => s.incidents);
  const [open, setOpen] = useState(false);
  const presets = useMemo(() => builtinPresets(focusStation), [focusStation]);
  const munis = useMemo(() => [...new Set(incidents.map((i) => i.municipality).filter((m): m is string => Boolean(m)))].sort(), [incidents]);
  const areas = useMemo(() => [...new Set(incidents.map((i) => i.stationArea).filter((a): a is number => a !== undefined))].sort((a, b) => a - b), [incidents]);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const onPreset = (p: Preset) => (activePresetId === p.id ? applyPreset(undefined) : applyPreset(p));

  return (
    <div className="border-b border-line bg-bg-1">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        {presets.map((p) => <Chip key={p.id} on={activePresetId === p.id} onClick={() => onPreset(p)} title={p.focus ? "follows the focus station" : undefined}>{p.label}</Chip>)}
        {saved.map((p) => (
          <span key={p.id} className="inline-flex items-center">
            <Chip on={activePresetId === p.id} onClick={() => onPreset(p)}>★ {p.label}</Chip>
            <button type="button" aria-label={`delete preset ${p.label}`} onClick={() => deletePreset(p.id)} className="px-1 text-fg-3 hover:text-bad">×</button>
          </span>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto rounded border border-line-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-1 hover:bg-bg-2">
          {open ? "less" : "more filters"}
        </button>
      </div>
      {open && (
        <div className="grid gap-2 border-t border-line px-2 py-2 text-[11px] md:grid-cols-2">
          <fieldset><legend className="mb-1 font-mono text-fg-2">TYPE</legend><div className="flex flex-wrap gap-1">
            {INCIDENT_CATEGORIES.map((c) => <Chip key={c} on={filters.categories.includes(c)} onClick={() => setFilters({ categories: toggle(filters.categories, c as IncidentCategory) })}>{CATEGORY_STYLES[c].label}</Chip>)}
          </div></fieldset>
          <fieldset><legend className="mb-1 font-mono text-fg-2">STATUS</legend><div className="flex flex-wrap gap-1">
            {INCIDENT_STATUSES.filter((s) => s !== "unknown").map((s) => <Chip key={s} on={filters.statuses.includes(s)} onClick={() => setFilters({ statuses: toggle(filters.statuses, s as IncidentStatus) })}>{s}</Chip>)}
          </div></fieldset>
          <fieldset><legend className="mb-1 font-mono text-fg-2">APPARATUS TYPE</legend><div className="flex flex-wrap gap-1">
            {APPARATUS.map((p) => <Chip key={p} on={filters.unitPrefixes.includes(p)} onClick={() => setFilters({ unitPrefixes: toggle(filters.unitPrefixes, p) })}>{p}</Chip>)}
          </div></fieldset>
          <fieldset><legend className="mb-1 font-mono text-fg-2">STATION AREA (seen)</legend><div className="flex flex-wrap gap-1">
            {areas.map((a) => <Chip key={a} on={filters.stationAreas.includes(a)} onClick={() => setFilters({ stationAreas: toggle(filters.stationAreas, a) })}>{a}</Chip>)}
            {areas.length === 0 && <span className="text-fg-3">none reported</span>}
          </div></fieldset>
          <fieldset><legend className="mb-1 font-mono text-fg-2">MUNICIPALITY (seen)</legend><div className="flex flex-wrap gap-1">
            {munis.map((m) => <Chip key={m} on={filters.municipalities.includes(m)} onClick={() => setFilters({ municipalities: toggle(filters.municipalities, m) })}>{m}</Chip>)}
          </div></fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 font-mono text-fg-2">UNIT CONTAINS
              <input value={filters.unitQuery} onChange={(e) => setFilters({ unitQuery: e.target.value })} placeholder="714" className="w-24 rounded border border-line-2 bg-bg-2 px-1 py-0.5 text-fg" /></label>
            <label className="flex flex-col gap-0.5 font-mono text-fg-2">STATION UNITS
              <input value={filters.stationUnits.join(",")} onChange={(e) => setFilters({ stationUnits: e.target.value.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)) })} placeholder="14,35" className="w-24 rounded border border-line-2 bg-bg-2 px-1 py-0.5 text-fg" /></label>
            <label className="flex flex-col gap-0.5 font-mono text-fg-2">MIN UNITS
              <input type="number" min={0} value={filters.minUnits || ""} onChange={(e) => setFilters({ minUnits: Number(e.target.value) || 0 })} className="w-16 rounded border border-line-2 bg-bg-2 px-1 py-0.5 text-fg" /></label>
            <Chip on={filters.majorOnly} onClick={() => setFilters({ majorOnly: !filters.majorOnly })}>major only</Chip>
            <button type="button" onClick={() => { const label = prompt("Preset name?"); if (label) savePreset(label); }} className="rounded border border-line-2 px-1.5 py-0.5 font-mono text-fg-1 hover:bg-bg-2">save preset</button>
            <button type="button" onClick={clearFilters} className="rounded border border-line-2 px-1.5 py-0.5 font-mono text-fg-1 hover:bg-bg-2">reset</button>
          </div>
        </div>
      )}
    </div>
  );
}
