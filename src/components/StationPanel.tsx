"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useDashboard } from "@/store/dashboard";
import { involvesStation, unitStation } from "@/lib/filters";
import { hasLocation, haversineKm, formatMiles, nearest } from "@/lib/geo";
import { hhmmss } from "@/lib/format";
import CategoryBadge from "./CategoryBadge";
import UnitBadge from "./UnitBadge";

/** "Station N mode": what matters to one station, configurable via the focus station. */
export default function StationPanel() {
  const focus = useDashboard((s) => s.focusStation);
  const setFocus = useDashboard((s) => s.setFocusStation);
  const stations = useDashboard((s) => s.stations);
  const incidents = useDashboard((s) => s.incidents);
  const select = useDashboard((s) => s.select);
  const selectedId = useDashboard((s) => s.selectedId);
  const station = stations.find((s) => s.number === focus);

  const view = useMemo(() => {
    const involved = incidents.filter((i) => involvesStation(i, focus));
    const involvedIds = new Set(involved.map((i) => i.id));
    const nearby = station
      ? incidents.filter((i) => !involvedIds.has(i.id) && hasLocation(i) && haversineKm(station, i) <= 12).map((i) => ({ i, km: haversineKm(station, i as { latitude: number; longitude: number }) })).sort((a, b) => a.km - b.km).slice(0, 8)
      : [];
    const busyUnits = new Set(involved.flatMap((i) => i.units.map((u) => u.unit)).filter((u) => unitStation(u) === focus));
    const mutual = station ? nearest(station, stations.filter((s) => s.number !== focus), 6) : [];
    return { involved, nearby, busyUnits, mutual };
  }, [incidents, focus, station, stations]);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Station ${focus} mode`}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <label className="font-mono text-[11px] text-fg-2">STATION
          <select value={focus} onChange={(e) => setFocus(Number(e.target.value))} className="ml-1 rounded border border-line-2 bg-bg-1 px-1 text-fg">
            {stations.map((s) => <option key={s.number} value={s.number}>{s.number}</option>)}
            {!stations.some((s) => s.number === focus) && <option value={focus}>{focus}</option>}
          </select>
        </label>
        <span className="truncate text-[12px] text-fg-1">{station?.name ?? "unknown station"}</span>
        <Link href={`/stations/${focus}`} className="ml-auto font-mono text-[11px] text-accent hover:underline">station page →</Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto text-[12px]">
        <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
          <Stat label="assignments" value={view.involved.length} />
          <Stat label="in area" value={view.involved.filter((i) => i.stationArea === focus).length} />
          <Stat label="nearby" value={view.nearby.length} />
        </div>
        {station && (
          <div className="border-b border-line px-3 py-2">
            <div className="text-fg-1">{station.address}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {station.apparatusParsed.map((a) => <UnitBadge key={a.unit} unit={a.unit} type={a.type} category={a.category} station={a.station} highlight={view.busyUnits.has(a.unit)} />)}
            </div>
            {view.busyUnits.size > 0 && <div className="mt-1 font-mono text-[11px] text-fg-2">{view.busyUnits.size} of {station.apparatus.length} units on assignments (highlighted)</div>}
          </div>
        )}
        <Group title={`INCIDENTS INVOLVING STATION ${focus}`} empty="none right now">
          {view.involved.map((i) => <Row key={i.id} onClick={() => select(i.id)} selected={i.id === selectedId}>
            <span className="font-mono text-fg-2">{hhmmss(i.dispatchedAt, false)}</span><CategoryBadge category={i.category} />
            <span className="truncate font-medium">{i.callType}</span><span className="truncate text-fg-2">{i.address}</span>
            <span className="ml-auto font-mono text-[10px] text-fg-3">{i.units.filter((u) => unitStation(u.unit) === focus).map((u) => u.unit).join(" ") || `area ${i.stationArea}`}</span>
          </Row>)}
        </Group>
        <Group title="NEARBY (within 12 km, not yet involved)" empty="nothing nearby">
          {view.nearby.map(({ i, km }) => <Row key={i.id} onClick={() => select(i.id)} selected={i.id === selectedId}>
            <span className="font-mono text-fg-2">{formatMiles(km)}</span><CategoryBadge category={i.category} />
            <span className="truncate font-medium">{i.callType}</span><span className="truncate text-fg-2">{i.municipality ?? i.address}</span>
            <span className="ml-auto font-mono text-[10px] text-fg-3">{i.units.length}u</span>
          </Row>)}
        </Group>
        <Group title="NEAREST MUTUAL-AID STATIONS" empty="station data not loaded">
          {view.mutual.map(({ item, km }) => <Row key={item.number} onClick={() => setFocus(item.number)}>
            <span className="font-mono text-fg-2">{formatMiles(km)}</span><span className="font-mono">STA {item.number}</span><span className="truncate text-fg-1">{item.name}</span>
            <span className="ml-auto font-mono text-[10px] text-fg-3">{incidents.filter((i) => involvesStation(i, item.number)).length} active</span>
          </Row>)}
        </Group>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-bg-1 px-3 py-2"><div className="font-mono text-[20px] leading-none text-fg tabular-nums">{value}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-2">{label}</div></div>;
}
function Group({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <div className="border-b border-line"><h3 className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-wide text-fg-2">{title}</h3>{children.length ? children : <p className="px-3 pb-2 text-fg-3">{empty}</p>}</div>;
}
function Row({ children, onClick, selected = false }: { children: React.ReactNode; onClick: () => void; selected?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-bg-2 ${selected ? "bg-bg-3" : ""}`}>{children}</button>;
}
