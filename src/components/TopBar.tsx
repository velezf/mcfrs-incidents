"use client";
import Link from "next/link";
import { useDashboard } from "@/store/dashboard";
import Clock from "./Clock";
import SourceStatus from "./SourceStatus";

export default function TopBar() {
  const search = useDashboard((s) => s.filters.search);
  const setFilters = useDashboard((s) => s.setFilters);
  const theme = useDashboard((s) => s.theme);
  const setTheme = useDashboard((s) => s.setTheme);
  const focusStation = useDashboard((s) => s.focusStation);
  const stationMode = useDashboard((s) => s.stationMode);
  const setStationMode = useDashboard((s) => s.setStationMode);
  const count = useDashboard((s) => s.incidents.length);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-bg-1 px-3">
      <Link href="/" className="font-semibold tracking-wide text-fg">MCFRS <span className="text-fg-2 font-normal">INCIDENTS</span></Link>
      <span className="font-mono text-[11px] text-fg-2 tabular-nums">{count} active</span>
      <div className="hidden sm:block"><SourceStatus detailed /></div>
      <div className="ml-auto flex items-center gap-2">
        <input
          type="search" value={search} onChange={(e) => setFilters({ search: e.target.value })} placeholder="search 714 · PE714 · Poolesville · HOUSE FIRE"
          aria-label="Search incidents" className="hidden w-64 rounded border border-line-2 bg-bg-2 px-2 py-1 text-[12px] text-fg placeholder:text-fg-3 md:block lg:w-80"
        />
        <button type="button" onClick={() => setStationMode(!stationMode)} aria-pressed={stationMode}
          className={`rounded border px-2 py-1 font-mono text-[11px] ${stationMode ? "border-accent bg-accent/20 text-fg" : "border-line-2 text-fg-1 hover:bg-bg-2"}`}>
          STATION {focusStation}
        </button>
        <nav className="hidden items-center gap-1 font-mono text-[11px] text-fg-2 md:flex">
          <Link href="/history" className="rounded px-1.5 py-1 hover:bg-bg-2 hover:text-fg">history</Link>
          <Link href="/comms" className="rounded px-1.5 py-1 hover:bg-bg-2 hover:text-fg">comms</Link>
          <Link href="/ops" className="rounded px-1.5 py-1 hover:bg-bg-2 hover:text-fg">ops board</Link>
          <Link href="/admin" className="rounded px-1.5 py-1 hover:bg-bg-2 hover:text-fg">admin</Link>
        </nav>
        <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light" | "system")} className="hidden rounded border border-line-2 bg-bg-1 px-1 py-1 font-mono text-[11px] text-fg-1 md:block">
          <option value="dark">dark</option><option value="light">light</option><option value="system">system</option>
        </select>
        <Clock className="hidden text-[15px] text-fg sm:inline" />
      </div>
    </header>
  );
}
