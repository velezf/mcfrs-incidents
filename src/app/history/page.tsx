"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import CategoryBadge from "@/components/CategoryBadge";
import UnitBadge from "@/components/UnitBadge";
import { useDashboard } from "@/store/dashboard";
import { CATEGORY_STYLES } from "@/lib/categories";
import { INCIDENT_CATEGORIES, type IncidentWire } from "@/types/incident";
import type { Analytics } from "@/types/reference";

interface Q { from: string; to: string; unit: string; station: string; area: string; category: string; municipality: string; address: string; q: string; includeActive: boolean }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const EMPTY: Q = { from: daysAgo(7), to: "", unit: "", station: "", area: "", category: "", municipality: "", address: "", q: "", includeActive: false };

function qs(q: Q): string {
  const p = new URLSearchParams();
  if (q.from) p.set("from", new Date(q.from).toISOString());
  if (q.to) p.set("to", new Date(q.to + "T23:59:59").toISOString());
  for (const k of ["unit", "station", "area", "category", "municipality", "address", "q"] as const) if (q[k]) p.set(k, q[k]);
  if (q.includeActive) p.set("includeActive", "1");
  return p.toString();
}

export default function HistoryPage() {
  const [q, setQ] = useState<Q>(EMPTY);
  const [rows, setRows] = useState<IncidentWire[]>([]);
  const [total, setTotal] = useState(0);
  const [storage, setStorage] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const select = useDashboard((s) => s.select);

  const run = useCallback((query: Q) => {
    const p = Promise.all([
      fetch(`/api/history?${qs(query)}&limit=500`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/analytics?${qs(query)}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    p.then(([h, a]) => { setRows(h.incidents); setTotal(h.total); setStorage(h.storage); setAnalytics(a.analytics); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return p;
  }, []);
  useEffect(() => { void run(EMPTY); }, [run]);
  const submit = (query: Q) => { setLoading(true); void run(query); };


  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar />
      <form onSubmit={(e) => { e.preventDefault(); submit(q); }} className="flex flex-wrap items-end gap-2 border-b border-line bg-bg-1 px-3 py-2">
        <Field k="from" label="from" type="date" w="w-36" q={q} setQ={setQ} /><Field k="to" label="to" type="date" w="w-36" q={q} setQ={setQ} />
        <Field k="unit" label="unit" w="w-20" q={q} setQ={setQ} /><Field k="station" label="station" w="w-16" q={q} setQ={setQ} /><Field k="area" label="area" w="w-16" q={q} setQ={setQ} />
        <label className="flex flex-col gap-0.5 font-mono text-[10px] uppercase text-fg-2">type
          <select value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })} className="rounded border border-line-2 bg-bg-2 px-1 py-1 text-[12px] normal-case text-fg">
            <option value="">any</option>{INCIDENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_STYLES[c].label}</option>)}
          </select></label>
        <Field k="municipality" label="municipality" q={q} setQ={setQ} /><Field k="address" label="address" q={q} setQ={setQ} /><Field k="q" label="search" w="w-40" q={q} setQ={setQ} />
        <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-fg-2"><input type="checkbox" checked={q.includeActive} onChange={(e) => setQ({ ...q, includeActive: e.target.checked })} /> include active</label>
        <button type="submit" className="rounded border border-accent/60 px-3 py-1 font-mono text-[11px] text-accent hover:bg-accent/10">{loading ? "…" : "query"}</button>
        <button type="button" onClick={() => { setQ(EMPTY); submit(EMPTY); }} className="rounded border border-line-2 px-2 py-1 font-mono text-[11px] text-fg-1">reset</button>
        <span className="ml-auto font-mono text-[10px] text-fg-3">storage: {storage || "?"} · {total} match · derived from the locally observed feed, not the official MCFRS record</span>
      </form>
      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_380px]">
        <div className="min-h-0 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-bg-1 font-mono text-[10px] uppercase text-fg-2"><tr><th className="px-3 py-1 text-left">dispatched</th><th className="px-2 py-1 text-left">type</th><th className="px-2 py-1 text-left">location</th><th className="px-2 py-1 text-left">area</th><th className="px-2 py-1 text-left">units</th><th className="px-2 py-1 text-left">status</th><th className="px-2 py-1 text-left">closed</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-line hover:bg-bg-2">
                  <td className="px-3 py-1 font-mono text-fg-1 whitespace-nowrap">{new Date(i.dispatchedAt).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                  <td className="px-2 py-1"><Link href="/" onClick={() => select(i.id)} className="flex items-center gap-1 hover:underline"><CategoryBadge category={i.category} /><span className="font-medium">{i.callType}</span></Link></td>
                  <td className="px-2 py-1 text-fg-1">{i.address}{i.municipality ? <span className="text-fg-2"> · {i.municipality}</span> : null}</td>
                  <td className="px-2 py-1 font-mono text-fg-2">{i.stationArea ?? ""}</td>
                  <td className="px-2 py-1"><div className="flex flex-wrap gap-0.5">{i.units.map((u) => <UnitBadge key={u.unit} unit={u.unit} type={u.type} category={u.category} station={u.station} />)}</div></td>
                  <td className="px-2 py-1 font-mono text-fg-2">{i.status}</td>
                  <td className="px-2 py-1 font-mono text-fg-2 whitespace-nowrap">{i.closedAt ? new Date(i.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-fg-3">{loading ? "loading…" : "no incidents match"}</td></tr>}
            </tbody>
          </table>
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-bg-1 p-3 text-[12px]">
          <h2 className="font-mono text-[10px] uppercase tracking-wide text-fg-2">Analytics — observed feed only</h2>
          {analytics && <>
            <Bars title={`calls per day (${analytics.total})`} rows={analytics.perDay.map((d) => [d.day.slice(5), d.count])} />
            <Bars title="calls by hour" rows={analytics.perHour.map((c, h) => [String(h).padStart(2, "0"), c])} compact />
            <Bars title="calls by station area" rows={analytics.perStationArea.slice(0, 15).map((s) => [`A${s.station}`, s.count])} />
            <Bars title="calls by type" rows={analytics.perCategory.map((c) => [CATEGORY_STYLES[c.category as keyof typeof CATEGORY_STYLES]?.label ?? c.category, c.count])} />
            <Bars title="busiest units" rows={analytics.busiestUnits.slice(0, 12).map((u) => [u.unit, u.count])} />
            <Bars title="by municipality" rows={analytics.perMunicipality.slice(0, 10).map((m) => [m.municipality, m.count])} />
            <Bars title="weekday vs weekend" rows={[["weekday", analytics.weekday], ["weekend", analytics.weekend]]} />
          </>}
        </aside>
      </div>
    </div>
  );
}

function Field({ k, label, type = "text", w = "w-28", q, setQ }: { k: keyof Q; label: string; type?: string; w?: string; q: Q; setQ: (q: Q) => void }) {
  return (
    <label className="flex flex-col gap-0.5 font-mono text-[10px] uppercase text-fg-2">{label}
      <input type={type} value={String(q[k])} onChange={(e) => setQ({ ...q, [k]: e.target.value })} className={`${w} rounded border border-line-2 bg-bg-2 px-1.5 py-1 text-[12px] normal-case text-fg`} />
    </label>
  );
}

function Bars({ title, rows, compact = false }: { title: string; rows: [string, number][]; compact?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (compact) return (
    <section className="mt-3"><h3 className="font-mono text-[10px] text-fg-2">{title}</h3>
      <div className="mt-1 flex h-12 items-end gap-px" role="img" aria-label={title}>{rows.map(([l, c]) => <div key={l} title={`${l}: ${c}`} className="flex-1 bg-accent/70" style={{ height: `${(c / max) * 100}%`, minHeight: c ? 2 : 0 }} />)}</div>
    </section>);
  return (
    <section className="mt-3"><h3 className="font-mono text-[10px] text-fg-2">{title}</h3>
      <ul className="mt-1 space-y-0.5">{rows.map(([l, c]) => <li key={l} className="flex items-center gap-2 font-mono text-[11px]"><span className="w-24 truncate text-fg-1">{l}</span><span className="h-2.5 bg-accent/70" style={{ width: `${(c / max) * 100}%`, minWidth: c ? 2 : 0 }} /><span className="text-fg-2">{c}</span></li>)}{rows.length === 0 && <li className="text-fg-3">none</li>}</ul>
    </section>);
}
