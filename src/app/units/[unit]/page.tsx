"use client";
import { use, useMemo } from "react";
import Link from "next/link";
import { useDashboard } from "@/store/dashboard";
import { unitStation } from "@/lib/filters";
import { hhmmss } from "@/lib/format";
import TopBar from "@/components/TopBar";
import CategoryBadge from "@/components/CategoryBadge";

export default function UnitPage({ params }: { params: Promise<{ unit: string }> }) {
  const { unit: raw } = use(params);
  const unit = decodeURIComponent(raw).toUpperCase();
  const incidents = useDashboard((s) => s.incidents);
  const history = useDashboard((s) => s.history);
  const known = useDashboard((s) => [...s.incidents, ...s.history].flatMap((i) => i.units).find((u) => u.unit.toUpperCase() === unit));
  const apparatus = useDashboard((s) => s.stations.flatMap((x) => x.apparatusParsed).find((a) => a.unit.toUpperCase() === unit));
  const p = { station: known?.station ?? apparatus?.station ?? unitStation(unit), type: known?.type ?? apparatus?.type ?? "unit", category: known?.category ?? apparatus?.category ?? "unknown", known: Boolean(known?.type ?? apparatus) };
  const station = useDashboard((s) => s.stations.find((x) => x.number === p.station));
  const select = useDashboard((s) => s.select);
  const v = useMemo(() => {
    const has = (i: { units: { unit: string }[] }) => i.units.some((u) => u.unit.toUpperCase() === unit);
    const current = incidents.filter(has);
    const recent = history.filter(has).slice(0, 50);
    const hours = new Array<number>(24).fill(0);
    for (const i of [...current, ...recent]) hours[new Date(i.dispatchedAt).getHours()]++;
    return { current, recent, hours, max: Math.max(1, ...hours) };
  }, [incidents, history, unit]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-3xl overflow-y-auto p-3 text-[12px]">
        <div className="font-mono text-[10px] text-fg-2">UNIT · CAD assignment data, not GPS</div>
        <h1 className="text-[22px] font-semibold">{unit} <span className="font-normal text-fg-1">{p.type}</span></h1>
        <div className="text-fg-2">{p.station ? <>home station {station ? <Link href={`/stations/${p.station}`} className="text-accent hover:underline">{p.station} — {station.name}</Link> : <Link href={`/stations/${p.station}`} className="text-accent hover:underline">{p.station}</Link>}</> : "home station unknown"} · category {p.category}{p.known ? "" : " · prefix not in nomenclature"}</div>
        <section className="mt-3 border-t border-line pt-2"><h3 className="font-mono text-[10px] text-fg-2">CURRENTLY ASSIGNED</h3>
          {v.current.length === 0 ? <p className="text-fg-3">not on an active incident</p> : v.current.map((i) => <Link key={i.id} href="/" onClick={() => select(i.id)} className="flex items-center gap-2 py-0.5 hover:bg-bg-2"><span className="font-mono text-fg-2">{hhmmss(i.dispatchedAt, false)}</span><CategoryBadge category={i.category} /><span className="font-medium">{i.callType}</span><span className="truncate text-fg-2">{i.address}</span></Link>)}
        </section>
        <section className="mt-3 border-t border-line pt-2"><h3 className="font-mono text-[10px] text-fg-2">DISPATCH ACTIVITY BY HOUR (observed)</h3>
          <div className="mt-1 flex h-16 items-end gap-px" role="img" aria-label="dispatches by hour of day">
            {v.hours.map((c, h) => <div key={h} title={`${String(h).padStart(2, "0")}:00 — ${c}`} className="flex-1 bg-accent/70" style={{ height: `${(c / v.max) * 100}%`, minHeight: c ? 2 : 0 }} />)}
          </div>
          <div className="flex justify-between font-mono text-[9px] text-fg-3"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        </section>
        <section className="mt-3 border-t border-line pt-2"><h3 className="font-mono text-[10px] text-fg-2">RECENT INCIDENTS (locally observed)</h3>
          {v.recent.length === 0 ? <p className="text-fg-3">none observed yet</p> : v.recent.map((i) => <Link key={i.id} href="/" onClick={() => select(i.id)} className="flex items-center gap-2 py-0.5 hover:bg-bg-2"><span className="font-mono text-fg-2">{hhmmss(i.dispatchedAt, false)}</span><CategoryBadge category={i.category} /><span className="font-medium">{i.callType}</span><span className="truncate text-fg-2">{i.address}</span></Link>)}
        </section>
      </div>
    </div>
  );
}
