"use client";
import { useEffect, useMemo, useState } from "react";
import { useNow } from "@/lib/useNow";
import Link from "next/link";
import { selectSelected, useDashboard } from "@/store/dashboard";
import { categoryStyle, STATUS_LABEL } from "@/lib/categories";
import { elapsed, hhmmss } from "@/lib/format";
import { formatMiles, hasLocation, haversineKm, nearest } from "@/lib/geo";
import { unitStation, isMajor } from "@/lib/filters";
import type { Hydrant } from "@/types/reference";
import CategoryBadge from "./CategoryBadge";
import UnitBadge from "./UnitBadge";

interface TimelineWire { at: string; kind: string; text: string; unit?: string }

export default function IncidentDrawer() {
  const i = useDashboard(selectSelected);
  const select = useDashboard((s) => s.select);
  const stations = useDashboard((s) => s.stations);
  const hospitals = useDashboard((s) => s.hospitals);
  const all = useDashboard((s) => s.incidents);
  const focus = useDashboard((s) => s.focusStation);
  const [timeline, setTimeline] = useState<TimelineWire[]>([]);
  const [hydrantNote, setHydrantNote] = useState<string>("");
  const hydrants = useDashboard((s) => s.selectedHydrants);
  const setSelectedHydrants = useDashboard((s) => s.setSelectedHydrants);
  const now = useNow(1000);
  useEffect(() => {
    if (!i) return;
    let stop = false;
    fetch(`/api/incidents/${encodeURIComponent(i.id)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!stop && d) { setTimeline(d.timeline); setSelectedHydrants((d.hydrants?.nearest ?? []) as Hydrant[]); setHydrantNote(d.hydrants?.note ?? ""); } }).catch(() => {});
    return () => { stop = true; };
  }, [i?.id, i?.updatedAt, i?.status, i, setSelectedHydrants]);

  const intel = useMemo(() => {
    if (!i || !hasLocation(i)) return null;
    const nearStations = nearest(i, stations, 3);
    const nearHospitals = nearest(i, hospitals, 3);
    const nearby = all.filter((o) => o.id !== i.id && hasLocation(o)).map((o) => ({ o, km: haversineKm(i, o as { latitude: number; longitude: number }) })).filter((x) => x.km <= 8).sort((a, b) => a.km - b.km).slice(0, 5);
    const sameArea = all.filter((o) => o.id !== i.id && i.stationArea !== undefined && o.stationArea === i.stationArea);
    return { nearStations, nearHospitals, nearby, sameArea };
  }, [i, stations, hospitals, all]);

  if (!i) return null;
  const s = categoryStyle(i.category);
  const stationsInvolved = [...new Set(i.units.map((u) => unitStation(u.unit)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
  const mapsLink = hasLocation(i) ? `https://www.openstreetmap.org/?mlat=${i.latitude}&mlon=${i.longitude}#map=16/${i.latitude}/${i.longitude}` : undefined;

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-bg-1" aria-label="Incident details">
      <header className="flex items-start gap-2 border-b border-line px-3 py-2" style={{ borderTop: `3px solid var(--${s.token})` }}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><CategoryBadge category={i.category} text={s.label} />{isMajor(i) && <span className="font-mono text-[10px] text-[var(--cat-major)]">MAJOR</span>}{i.status === "closed" && <span className="font-mono text-[10px] text-fg-2">CLOSED</span>}</div>
          <h2 className="mt-1 text-[16px] font-semibold leading-tight">{i.callType}{i.callSubtype ? <span className="font-normal text-fg-2"> · {i.callSubtype}</span> : null}</h2>
          <div className="text-[12px] text-fg-1">{i.address ?? "address not provided"}{i.municipality ? `, ${i.municipality}` : ""}</div>
        </div>
        <button type="button" onClick={() => select(undefined)} aria-label="Close details" className="ml-auto rounded px-2 py-1 text-fg-2 hover:bg-bg-2 hover:text-fg">✕</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto text-[12px]">
        <Section title="INCIDENT">
          <KV k="number" v={i.incidentNumber ?? "—"} mono />
          <KV k="dispatched" v={`${hhmmss(i.dispatchedAt)}${now !== null ? ` (+${elapsed(i.dispatchedAt, now)})` : ""}`} mono />
          <KV k="status" v={STATUS_LABEL[i.status] ?? i.status} />
          <KV k="priority" v={i.priority ?? "—"} />
          <KV k="station area" v={i.stationArea !== undefined ? String(i.stationArea) : "—"} />
          <KV k="alarm level" v={i.alarmLevel ?? "—"} />
          {i.closedAt && <KV k="closed" v={hhmmss(i.closedAt)} mono />}
        </Section>
        <Section title="LOCATION">
          <KV k="address" v={i.address ?? "—"} />
          <KV k="cross street" v={i.crossStreet ?? "—"} />
          <KV k="municipality" v={i.municipality ?? "—"} />
          <KV k="coordinates" v={hasLocation(i) ? `${i.latitude.toFixed(5)}, ${i.longitude.toFixed(5)}${i.geoSource === "geocoded" ? " (geocoded, approx.)" : ""}` : "not available"} mono />
          {mapsLink && <KV k="map" v={<a href={mapsLink} target="_blank" rel="noreferrer" className="text-accent hover:underline">open in OpenStreetMap ↗</a>} />}
        </Section>
        <Section title={`UNITS (${i.units.length}) — CAD assignment, not GPS position`}>
          <div className="flex flex-wrap gap-1">{i.units.map((u) => <UnitBadge key={u.unit} unit={u.unit} type={u.type} category={u.category} station={u.station} status={u.status} highlight={(u.station ?? unitStation(u.unit)) === focus} />)}</div>
          <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-fg-1">
            {i.units.map((u) => <li key={u.unit} className="flex gap-2"><span className="w-14 text-fg">{u.unit}</span><span className="w-32 truncate">{u.type ?? "—"}</span><span className="text-fg-2">{u.station ? `Sta ${u.station}` : ""}</span>{u.dispatchedAt && <span className="ml-auto text-fg-3">{hhmmss(u.dispatchedAt)}</span>}</li>)}
          </ul>
          {stationsInvolved.length > 0 && <div className="mt-2 text-fg-2">stations: {stationsInvolved.map((n) => <Link key={n} href={`/stations/${n}`} className="mr-1 font-mono text-accent hover:underline">{n}</Link>)}</div>}
        </Section>
        {(hydrants.length > 0 || hydrantNote) && (
          <Section title="WATER SUPPLY — nearest hydrants (straight-line)">
            {hydrants.length === 0 && <p className="text-fg-3">{hydrantNote || "none within the search radius"}</p>}
            <ol className="font-mono text-[11px]">
              {hydrants.map((h, n) => (
                <li key={h.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-4 text-fg-3">{n + 1}</span>
                  <span className="w-14 text-right text-[var(--cat-water)]">{h.distanceFt.toLocaleString()} ft</span>
                  <span className="min-w-0 truncate text-fg-1">{h.address ?? `${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)}`}</span>
                  {h.mainSize && <span className="text-fg-2">{`${h.mainSize}"`} main</span>}
                  {h.outOfService && <span className="text-bad">OOS</span>}
                </li>
              ))}
            </ol>
            {hydrants.length > 0 && <p className="mt-1 text-[10px] text-fg-3">County GIS hydrant layer · not a substitute for the water-supply officer</p>}
          </Section>
        )}
        <Section title="COMMUNICATIONS">
          <KV k="talkgroup" v={i.talkgroup ?? "not provided by source"} mono />
          <KV k="channel" v={i.channel ?? "not provided by source"} mono />
        </Section>
        <Section title="MAP INTELLIGENCE (straight-line distances)">
          {!intel && <p className="text-fg-3">No coordinates for this incident.</p>}
          {intel && <>
            <div className="text-fg-2">nearest stations</div>
            <ul className="mb-2 font-mono text-[11px]">{intel.nearStations.map(({ item, km }) => <li key={item.number}><Link href={`/stations/${item.number}`} className="text-accent hover:underline">Sta {item.number}</Link> <span className="text-fg-1">{item.name}</span> <span className="text-fg-2">{formatMiles(km)}</span></li>)}</ul>
            <div className="text-fg-2">nearest hospitals</div>
            <ul className="mb-2 font-mono text-[11px]">{intel.nearHospitals.map(({ item, km }) => <li key={item.id}>{item.shortName} <span className="text-fg-2">{formatMiles(km)}</span></li>)}</ul>
            <div className="text-fg-2">nearby active (≤ 5 mi)</div>
            {intel.nearby.length === 0 ? <p className="text-fg-3">none</p> : <ul className="mb-2 font-mono text-[11px]">{intel.nearby.map(({ o, km }) => <li key={o.id}><button type="button" onClick={() => select(o.id)} className="text-accent hover:underline">{o.callType}</button> <span className="text-fg-2">{formatMiles(km)} · {o.units.length}u</span></li>)}</ul>}
            {i.stationArea !== undefined && <><div className="text-fg-2">same station area ({i.stationArea})</div>{intel.sameArea.length === 0 ? <p className="text-fg-3">none</p> : <ul className="font-mono text-[11px]">{intel.sameArea.map((o) => <li key={o.id}><button type="button" onClick={() => select(o.id)} className="text-accent hover:underline">{o.callType}</button> <span className="text-fg-2">{hhmmss(o.dispatchedAt, false)}</span></li>)}</ul>}</>}
          </>}
        </Section>
        <Section title="TIMELINE (source-supported events only)">
          <ol className="font-mono text-[11px]">{timeline.map((e, n) => <li key={n} className="flex gap-2"><span className="text-fg-2">{hhmmss(e.at)}</span><span>{e.text}</span></li>)}</ol>
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-line px-3 py-2"><h3 className="mb-1 font-mono text-[10px] tracking-wide text-fg-2">{title}</h3>{children}</section>;
}
function KV({ k, v, mono = false }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return <div className="flex gap-2 py-0.5"><span className="w-24 shrink-0 text-fg-2">{k}</span><span className={`min-w-0 break-words ${mono ? "font-mono text-[11px]" : ""}`}>{v}</span></div>;
}
