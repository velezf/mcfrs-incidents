"use client";
import { create } from "zustand";
import type { IncidentWire, SourceHealth } from "@/types/incident";
import type { PublicConfig } from "@/lib/config";
import { applyFilters, EMPTY_FILTERS, sortIncidents, type Filters, type Preset, type SortMode } from "@/lib/filters";
import type { Station } from "@/data/stations";
import type { Hospital } from "@/data/hospitals";

export type MobileView = "list" | "map" | "station";
export type Theme = "dark" | "light" | "system";

export interface HealthWire extends Omit<SourceHealth, "lastPollAt" | "lastSuccessAt" | "lastIncidentUpdateAt"> {
  lastPollAt?: string; lastSuccessAt?: string; lastIncidentUpdateAt?: string;
}

interface DashboardState {
  incidents: IncidentWire[];
  history: IncidentWire[];
  health?: HealthWire;
  serverTime?: string;
  lastFetchAt?: number;
  fetchError?: string;
  /** ids that arrived in the latest fetch (for the flash). */
  freshIds: Set<string>;
  stations: Station[];
  hospitals: Hospital[];
  config?: PublicConfig;

  selectedId?: string;
  filters: Filters;
  activePresetId?: string;
  sort: SortMode;
  focusStation: number;
  stationMode: boolean;
  mobileView: MobileView;
  theme: Theme;
  drawerOpen: boolean;
  savedPresets: Preset[];

  setFeed(incidents: IncidentWire[], health: HealthWire, serverTime: string): void;
  setHistory(h: IncidentWire[]): void;
  setFetchError(e?: string): void;
  setReference(stations: Station[], hospitals: Hospital[]): void;
  setConfig(c: PublicConfig): void;
  select(id?: string): void;
  setFilters(f: Partial<Filters>): void;
  clearFilters(): void;
  applyPreset(p?: Preset): void;
  setSort(s: SortMode): void;
  setFocusStation(n: number): void;
  setStationMode(on: boolean): void;
  setMobileView(v: MobileView): void;
  setTheme(t: Theme): void;
  savePreset(label: string): void;
  deletePreset(id: string): void;
}

const LS = { theme: "mcfrs.theme", presets: "mcfrs.presets", focus: "mcfrs.focusStation" };
function load<T>(k: string, fallback: T): T {
  try { const v = typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode etc. */ } }

export const useDashboard = create<DashboardState>((set, get) => ({
  incidents: [], history: [], freshIds: new Set(), stations: [], hospitals: [],
  filters: EMPTY_FILTERS, sort: "newest", focusStation: 14, stationMode: false, mobileView: "list", theme: "dark", drawerOpen: false, savedPresets: [],

  setFeed: (incidents, health, serverTime) => {
    const prev = new Set(get().incidents.map((i) => i.id));
    const fresh = new Set(incidents.filter((i) => !prev.has(i.id) && prev.size > 0).map((i) => i.id));
    set({ incidents, health, serverTime, lastFetchAt: Date.now(), fetchError: undefined, freshIds: fresh });
    if (fresh.size) setTimeout(() => set({ freshIds: new Set() }), 3000);
    // A selected incident that closed stays selected (drawer shows it from history) — nothing to do here.
  },
  setHistory: (history) => set({ history }),
  setFetchError: (fetchError) => set({ fetchError }),
  setReference: (stations, hospitals) => set({ stations, hospitals }),
  setConfig: (config) => set((s) => ({ config, focusStation: load(LS.focus, config.focusStation) ?? s.focusStation })),
  select: (selectedId) => set({ selectedId, drawerOpen: Boolean(selectedId) }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f }, activePresetId: undefined })),
  clearFilters: () => set({ filters: EMPTY_FILTERS, activePresetId: undefined }),
  applyPreset: (p) => set(p ? { filters: { ...EMPTY_FILTERS, ...p.filters }, activePresetId: p.id } : { filters: EMPTY_FILTERS, activePresetId: undefined }),
  setSort: (sort) => set({ sort }),
  setFocusStation: (focusStation) => { save(LS.focus, focusStation); set({ focusStation }); },
  setStationMode: (stationMode) => set({ stationMode }),
  setMobileView: (mobileView) => set({ mobileView }),
  setTheme: (theme) => { save(LS.theme, theme); document.documentElement.dataset.theme = theme; set({ theme }); },
  savePreset: (label) => {
    const p: Preset = { id: `user-${Date.now()}`, label, filters: get().filters };
    const savedPresets = [...get().savedPresets, p];
    save(LS.presets, savedPresets);
    set({ savedPresets, activePresetId: p.id });
  },
  deletePreset: (id) => { const savedPresets = get().savedPresets.filter((p) => p.id !== id); save(LS.presets, savedPresets); set({ savedPresets }); },
}));

/** Hydrate persisted bits once on the client. */
export function hydrateDashboard() {
  const theme = load<Theme>(LS.theme, "dark");
  document.documentElement.dataset.theme = theme;
  useDashboard.setState({ theme, savedPresets: load<Preset[]>(LS.presets, []) });
}

/* ---- selectors ---- */
export const selectVisible = (s: DashboardState) => sortIncidents(applyFilters(s.incidents, s.filters), s.sort);
export const selectSelected = (s: DashboardState) => s.incidents.find((i) => i.id === s.selectedId) ?? s.history.find((i) => i.id === s.selectedId);
