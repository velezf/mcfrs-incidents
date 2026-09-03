"use client";
import dynamic from "next/dynamic";
import { useDashboard } from "@/store/dashboard";
import TopBar from "@/components/TopBar";
import FilterBar from "@/components/FilterBar";
import IncidentList from "@/components/IncidentList";
import IncidentDrawer from "@/components/IncidentDrawer";
import StationPanel from "@/components/StationPanel";

const MapView = dynamic(() => import("@/maps/MapView"), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-fg-3">loading map…</div> });

/**
 * Desktop: three panes (list | map | station or details). Mobile: LIST | MAP | STATION
 * toggle with the drawer overlaying when an incident is selected.
 */
export default function Dashboard() {
  const drawerOpen = useDashboard((s) => s.drawerOpen);
  const stationMode = useDashboard((s) => s.stationMode);
  const mobileView = useDashboard((s) => s.mobileView);
  const setMobileView = useDashboard((s) => s.setMobileView);
  const focus = useDashboard((s) => s.focusStation);
  const search = useDashboard((s) => s.filters.search);
  const setFilters = useDashboard((s) => s.setFilters);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar />
      <FilterBar />
      <div className="md:hidden flex items-center gap-1 border-b border-line bg-bg-1 px-2 py-1">
        {(["list", "map", "station"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setMobileView(v)} aria-pressed={mobileView === v}
            className={`rounded px-2 py-1 font-mono text-[11px] uppercase ${mobileView === v ? "bg-accent/20 text-fg ring-1 ring-accent" : "text-fg-2"}`}>
            {v === "station" ? `station ${focus}` : v}
          </button>
        ))}
        <input type="search" value={search} onChange={(e) => setFilters({ search: e.target.value })} placeholder="search" aria-label="Search" className="ml-auto w-32 rounded border border-line-2 bg-bg-2 px-2 py-1 text-[12px]" />
      </div>
      <main className="relative flex min-h-0 flex-1">
        <div className={`${mobileView === "list" ? "flex" : "hidden"} w-full flex-col border-r border-line bg-bg-1 md:flex md:w-[380px] lg:w-[420px] shrink-0`}><IncidentList /></div>
        <div className={`${mobileView === "map" ? "block" : "hidden"} min-w-0 flex-1 md:block`}><MapView /></div>
        <div className={`${mobileView === "station" ? "flex" : "hidden"} w-full flex-col bg-bg-1 md:flex md:w-[360px] lg:w-[400px] shrink-0 ${!stationMode && !drawerOpen ? "md:hidden" : ""}`}>
          {drawerOpen ? <IncidentDrawer /> : stationMode ? <StationPanel /> : null}
        </div>
        {drawerOpen && mobileView !== "station" && <div className="absolute inset-0 z-[1000] md:hidden bg-bg-1"><IncidentDrawer /></div>}
      </main>
    </div>
  );
}
