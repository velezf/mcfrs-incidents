"use client";
import { useEffect } from "react";
import { hydrateDashboard, useDashboard } from "@/store/dashboard";

/**
 * Phase-1 transport: the browser polls OUR server (never upstream) every few
 * seconds. Phase 4 replaces this with SSE; the store API stays the same.
 */
export default function FeedProvider({ intervalMs = 5000 }: { intervalMs?: number }) {
  const setFeed = useDashboard((s) => s.setFeed);
  const setHistory = useDashboard((s) => s.setHistory);
  const setFetchError = useDashboard((s) => s.setFetchError);
  const setReference = useDashboard((s) => s.setReference);
  const setConfig = useDashboard((s) => s.setConfig);

  useEffect(() => {
    hydrateDashboard();
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/incidents", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!stop) setFeed(d.incidents, d.health, d.serverTime);
      } catch (e) {
        if (!stop) setFetchError(e instanceof Error ? e.message : String(e));
      }
    };
    const history = async () => {
      try { const r = await fetch("/api/history?limit=200", { cache: "no-store" }); if (r.ok) setHistory((await r.json()).incidents); } catch { /* optional */ }
    };
    (async () => {
      try {
        const [c, s] = await Promise.all([fetch("/api/config").then((r) => r.json()), fetch("/api/stations").then((r) => r.json())]);
        if (!stop) { setConfig(c); setReference(s.stations, s.hospitals); }
      } catch (e) { setFetchError(e instanceof Error ? e.message : String(e)); }
      await tick();
      await history();
    })();
    const t = setInterval(tick, intervalMs);
    const h = setInterval(history, intervalMs * 6);
    return () => { stop = true; clearInterval(t); clearInterval(h); };
  }, [intervalMs, setFeed, setHistory, setFetchError, setReference, setConfig]);
  return null;
}
