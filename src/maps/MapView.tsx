"use client";
/**
 * Leaflet + OpenStreetMap, driven imperatively (no react-leaflet) so it stays
 * predictable across React re-renders. Client-only: imported with ssr:false.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { useDashboard, useVisibleIncidents } from "@/store/dashboard";
import { categoryStyle } from "@/lib/categories";
import { isMajor, involvesStation, unitStation } from "@/lib/filters";
import { COUNTY_BOUNDS, COUNTY_CENTER, hasLocation } from "@/lib/geo";
import type { IncidentWire } from "@/types/incident";

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function incidentIcon(i: IncidentWire, selected: boolean): L.DivIcon {
  const s = categoryStyle(i.category);
  const cls = ["marker-incident", selected ? "selected" : "", isMajor(i) ? "major" : ""].join(" ");
  return L.divIcon({ className: "", html: `<div class="${cls}" style="--c: var(--${s.token})" title="${i.callType}">${s.glyph}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
}
function stationIcon(n: number, focus: boolean, busy: boolean): L.DivIcon {
  return L.divIcon({ className: "", html: `<div class="marker-station ${focus ? "focus" : ""} ${busy ? "busy" : ""}">${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
}
const hospitalIcon = L.divIcon({ className: "", html: `<div class="marker-hospital">H</div>`, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export default function MapView({ fitOnce = true, interactive = true }: { fitOnce?: boolean; interactive?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const stationLayer = useRef<L.LayerGroup | null>(null);
  const hospitalLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const fitted = useRef(false);

  const visible = useVisibleIncidents();
  const all = useDashboard((s) => s.incidents);
  const stations = useDashboard((s) => s.stations);
  const hospitals = useDashboard((s) => s.hospitals);
  const selectedId = useDashboard((s) => s.selectedId);
  const focus = useDashboard((s) => s.focusStation);
  const stationMode = useDashboard((s) => s.stationMode);
  const select = useDashboard((s) => s.select);

  // create once
  useEffect(() => {
    if (!el.current || map.current) return;
    const cache = markers.current; // the Map object itself; stable for the life of the component
    const m = L.map(el.current, { zoomControl: interactive, dragging: interactive, scrollWheelZoom: interactive, attributionControl: true, preferCanvas: false });
    m.setView([COUNTY_CENTER.latitude, COUNTY_CENTER.longitude], 10);
    L.tileLayer(OSM, { attribution: ATTR, maxZoom: 19 }).addTo(m);
    L.rectangle([[COUNTY_BOUNDS.south, COUNTY_BOUNDS.west], [COUNTY_BOUNDS.north, COUNTY_BOUNDS.east]], { color: "#4f9cff", weight: 1, fill: false, dashArray: "4 6", opacity: 0.35, interactive: false }).addTo(m);
    cluster.current = L.markerClusterGroup({ maxClusterRadius: 34, disableClusteringAtZoom: 13, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
    m.addLayer(cluster.current);
    stationLayer.current = L.layerGroup().addTo(m);
    hospitalLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      // Strict-mode / HMR remounts recreate the map: anything cached against the old one must go too.
      ro.disconnect(); m.remove(); map.current = null; cluster.current = null; cache.clear(); fitted.current = false;
    };
  }, [interactive]);

  // stations + hospitals
  useEffect(() => {
    const layer = stationLayer.current; if (!layer) return;
    layer.clearLayers();
    for (const s of stations) {
      const active = all.filter((i) => involvesStation(i, s.number));
      const inArea = all.filter((i) => i.stationArea === s.number).length;
      const mk = L.marker([s.latitude, s.longitude], { icon: stationIcon(s.number, s.number === focus, active.length > 0), zIndexOffset: s.number === focus ? 500 : 100 });
      const units = active.flatMap((i) => i.units.map((u) => u.unit)).filter((u) => unitStation(u) === s.number);
      mk.bindPopup(`<div style="min-width:220px"><b>Station ${s.number}</b> — ${esc(s.name)}<br><span style="opacity:.75">${esc(s.address)}</span>
        <div style="margin-top:6px"><b>Apparatus:</b> ${s.apparatus.map(esc).join(", ") || "—"}</div>
        <div style="margin-top:4px"><b>Active:</b> ${active.length} assignment(s)${units.length ? ` — ${[...new Set(units)].map(esc).join(" ")}` : ""}; ${inArea} call(s) in area</div>
        <div style="margin-top:6px"><a href="/stations/${s.number}">station page →</a></div></div>`);
      layer.addLayer(mk);
    }
    const hl = hospitalLayer.current; if (!hl) return;
    hl.clearLayers();
    for (const h of hospitals) {
      hl.addLayer(L.marker([h.latitude, h.longitude], { icon: hospitalIcon, zIndexOffset: 50 }).bindPopup(`<b>${esc(h.name)}</b><br><span style="opacity:.75">${esc(h.address)}</span>${h.traumaLevel ? `<br>${esc(h.traumaLevel)}` : ""}`));
    }
  }, [stations, hospitals, all, focus]);

  // incident markers (diff by id)
  useEffect(() => {
    const cg = cluster.current; if (!cg) return;
    const want = new Map(visible.filter(hasLocation).map((i) => [i.id, i]));
    for (const [id, mk] of markers.current) {
      if (!want.has(id)) { cg.removeLayer(mk); markers.current.delete(id); }
    }
    for (const [id, i] of want) {
      const pos: L.LatLngExpression = [i.latitude as number, i.longitude as number];
      const html = `<div style="min-width:200px"><b>${esc(i.callType)}</b>${i.callSubtype ? ` · ${esc(i.callSubtype)}` : ""}<br>${esc(i.address ?? "")}${i.municipality ? `, ${esc(i.municipality)}` : ""}
        <div style="margin-top:4px;font-family:monospace;font-size:11px">${i.units.map((u) => esc(u.unit)).join(" ")}</div>
        <div style="margin-top:4px;opacity:.75">${i.status}${i.stationArea !== undefined ? ` · area ${i.stationArea}` : ""}${i.geoSource === "geocoded" ? " · geocoded (approx.)" : ""}</div></div>`;
      let mk = markers.current.get(id);
      if (!mk) {
        mk = L.marker(pos, { icon: incidentIcon(i, id === selectedId), zIndexOffset: id === selectedId ? 1000 : isMajor(i) ? 300 : 0 });
        mk.on("click", () => select(id));
        mk.bindPopup(html);
        cg.addLayer(mk);
        markers.current.set(id, mk);
      } else {
        mk.setLatLng(pos);
        mk.setIcon(incidentIcon(i, id === selectedId));
        mk.setZIndexOffset(id === selectedId ? 1000 : isMajor(i) ? 300 : 0);
        mk.setPopupContent(html);
      }
    }
    if (fitOnce && !fitted.current && map.current && want.size > 0) {
      fitted.current = true;
      map.current.fitBounds(cg.getBounds().pad(0.15), { maxZoom: 12 });
    }
  }, [visible, selectedId, select, fitOnce]);

  // selection: center + open popup
  useEffect(() => {
    const m = map.current; if (!m || !selectedId) return;
    const i = all.find((x) => x.id === selectedId);
    if (!i || !hasLocation(i)) return;
    const z = Math.max(m.getZoom(), 13);
    m.flyTo([i.latitude, i.longitude], z, { duration: 0.6 });
    const mk = markers.current.get(selectedId);
    if (mk) setTimeout(() => { try { cluster.current?.zoomToShowLayer(mk, () => mk.openPopup()); } catch { mk.openPopup(); } }, 650);
  }, [selectedId, all]);

  // station mode: frame the focus station
  useEffect(() => {
    const m = map.current; const s = stations.find((x) => x.number === focus);
    if (!m || !stationMode || !s) return;
    m.flyTo([s.latitude, s.longitude], 12, { duration: 0.6 });
  }, [stationMode, focus, stations]);

  return <div ref={el} className="h-full w-full" role="region" aria-label="Incident map" />;
}
