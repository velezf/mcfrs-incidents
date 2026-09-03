"use client";
import { use, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useDashboard } from "@/store/dashboard";
import { involvesStation, unitStation } from "@/lib/filters";
import { hhmmss } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import TopBar from "@/components/TopBar";
import CategoryBadge from "@/components/CategoryBadge";
import UnitBadge from "@/components/UnitBadge";

const MapView = dynamic(() => import("@/maps/MapView"), { ssr: false });

export default function StationPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const n = parseInt(number, 10);
  const station = useDashboard((s) => s.stations.find((x) => x.number === n));
  const incidents = useDashboard((s) => s.incidents);
  const history = useDashboard((s) => s.history);
  const select = useDashboard((s) => s.select);
  const setFocus = useDashboard((s) => s.setFocusStation);
  const setStationMode = useDashboard((s) => s.setStationMode);
  const now = useNow(60_000) ?? 0;

  const v = useMemo(() => {
    const active = incidents.filter((i) => involvesStation(i, n));
    const area = incidents.filter((i) => i.stationArea === n);
    const withUnits = incidents.filter((i) => i.units.some((u) => unitStation(u.unit) === n));
    const recent = history.filter((i) => involvesStation(i, n)).slice(0, 50);
    const since = (h: number) => now - h * 3600_000;
    const count = (h: number) => [...active, ...history.filter((i) => involvesStation(i, n))].filter((i) => new Date(i.dispatchedAt).getTime() >= since(h)).length;
    return { active, area, withUnits, recent, d1: count(24), d7: count(24 * 7), d30: count(24 * 30) };
  }, [incidents, history, n, now]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar />
      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] md:grid-cols-[420px_1fr] md:grid-rows-1">
        <div className="min-h-0 overflow-y-auto border-r border-line bg-bg-1 text-[12px]">
          <header className="border-b border-line px-3 py-2">
            <div className="font-mono text-[10px] text-fg-2">STATION</div>
            <h1 className="text-[20px] font-semibold leading-tight">{n} <span className="text-fg-1 font-normal">{station?.name ?? "unknown"}</span></h1>
            {station && <div className="text-fg-2">{station.address}{station.battalion ? ` · Battalion ${station.battalion}` : ""}</div>}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setFocus(n); setStationMode(true); }} className="rounded border border-accent/60 px-2 py-0.5 font-mono text-[11px] text-accent hover:bg-accent/10">make focus station</button>
              <Link href="/" className="rounded border border-line-2 px-2 py-0.5 font-mono text-[11px] text-fg-1 hover:bg-bg-2">← dashboard</Link>
            </div>
          </header>
          <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
            {[["24 h", v.d1], ["7 d", v.d7], ["30 d", v.d30]].map(([l, c]) => <div key={l} className="bg-bg-1 px-3 py-2"><div className="font-mono text-[18px] tabular-nums">{c}</div><div className="font-mono text-[10px] uppercase text-fg-2">{l} observed</div></div>)}
          </div>
          <Block title="APPARATUS (typical assignment)">
            <div className="flex flex-wrap gap-1">{(station?.apparatus ?? []).map((u) => <UnitBadge key={u} unit={u.replace(/\?$/, "")} highlight={v.withUnits.some((i) => i.units.some((x) => x.unit === u.replace(/\?$/, "")))} />)}</div>
            {station?.notes && <p className="mt-1 text-fg-2">{station.notes}</p>}
          </Block>
          <Block title={`ACTIVE CALLS (${v.active.length})`}>{v.active.map((i) => <Row key={i.id} i={i} onClick={() => select(i.id)} />)}{v.active.length === 0 && <p className="text-fg-3">none</p>}</Block>
          <Block title={`IN FIRST-DUE AREA (${v.area.length})`}>{v.area.map((i) => <Row key={i.id} i={i} onClick={() => select(i.id)} />)}{v.area.length === 0 && <p className="text-fg-3">none reported</p>}</Block>
          <Block title={`INVOLVING STATION APPARATUS (${v.withUnits.length})`}>{v.withUnits.map((i) => <Row key={i.id} i={i} onClick={() => select(i.id)} />)}{v.withUnits.length === 0 && <p className="text-fg-3">none</p>}</Block>
          <Block title="RECENT (locally observed, not the official record)">{v.recent.map((i) => <Row key={i.id} i={i} onClick={() => select(i.id)} />)}{v.recent.length === 0 && <p className="text-fg-3">nothing observed yet</p>}</Block>
        </div>
        <div className="min-h-[40vh] md:min-h-0"><MapView fitOnce={false} /></div>
      </div>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-b border-line px-3 py-2"><h3 className="mb-1 font-mono text-[10px] tracking-wide text-fg-2">{title}</h3>{children}</section>; }
function Row({ i, onClick }: { i: { id: string; dispatchedAt: string; callType: string; category: import("@/types/incident").IncidentCategory; address?: string; units: { unit: string }[] }; onClick: () => void }) {
  return <Link href="/" onClick={onClick} className="flex items-center gap-2 py-0.5 hover:bg-bg-2"><span className="font-mono text-fg-2">{hhmmss(i.dispatchedAt, false)}</span><CategoryBadge category={i.category} /><span className="truncate font-medium">{i.callType}</span><span className="truncate text-fg-2">{i.address}</span><span className="ml-auto font-mono text-[10px] text-fg-3">{i.units.length}u</span></Link>;
}
