"use client";
import { useNow } from "@/lib/useNow";
import { selectVisible, useDashboard } from "@/store/dashboard";
import { isFilterActive } from "@/lib/filters";
import IncidentCard from "./IncidentCard";

export default function IncidentList() {
  const visible = useDashboard(selectVisible);
  const total = useDashboard((s) => s.incidents.length);
  const selectedId = useDashboard((s) => s.selectedId);
  const freshIds = useDashboard((s) => s.freshIds);
  const focusStation = useDashboard((s) => s.focusStation);
  const filters = useDashboard((s) => s.filters);
  const sort = useDashboard((s) => s.sort);
  const setSort = useDashboard((s) => s.setSort);
  const select = useDashboard((s) => s.select);
  const clearFilters = useDashboard((s) => s.clearFilters);
  const now = useNow(5000);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Active incidents">
      <header className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] font-mono text-fg-2">
        <span className="text-fg font-semibold tracking-wide">ACTIVE</span>
        <span className="tabular-nums">{visible.length}{visible.length !== total ? ` / ${total}` : ""}</span>
        {isFilterActive(filters) && <button type="button" onClick={clearFilters} className="rounded border border-line-2 px-1.5 hover:bg-bg-2">clear filters</button>}
        <label className="ml-auto flex items-center gap-1">
          sort
          <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "severity")} className="rounded border border-line-2 bg-bg-1 px-1 text-fg">
            <option value="newest">newest</option><option value="severity">severity</option>
          </select>
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && <p className="p-4 text-center text-fg-2">{total === 0 ? "No active incidents." : "Nothing matches the current filters."}</p>}
        {visible.map((i) => (
          <IncidentCard key={i.id} incident={i} selected={i.id === selectedId} fresh={freshIds.has(i.id)} focusStation={focusStation} now={now} onSelect={select} />
        ))}
      </div>
    </section>
  );
}
