"use client";
import { useEffect, useState } from "react";
import { useDashboard } from "@/store/dashboard";
import { ago } from "@/lib/format";

/** Honest source state. Never says LIVE when the last success is stale. */
export default function SourceStatus({ detailed = false }: { detailed?: boolean }) {
  const health = useDashboard((s) => s.health);
  const fetchError = useDashboard((s) => s.fetchError);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, []);

  const state = fetchError ? "down" : health?.state ?? "starting";
  const color = state === "connected" ? "bg-ok" : state === "delayed" ? "bg-warn" : state === "starting" ? "bg-fg-3" : "bg-bad";
  const label = state === "connected" ? "SOURCE: CONNECTED" : state === "delayed" ? "SOURCE DELAYED" : state === "starting" ? "SOURCE: STARTING" : "SOURCE DOWN";
  const title = [
    `Adapter: ${health?.adapter ?? "?"}`, `Last poll: ${ago(health?.lastPollAt)}`, `Last successful update: ${ago(health?.lastSuccessAt)}`,
    `Last incident update: ${ago(health?.lastIncidentUpdateAt)}`, health?.lastLatencyMs !== undefined ? `API latency: ${health.lastLatencyMs} ms` : "",
    health?.lastError ? `Error: ${health.lastError}` : "", fetchError ? `Browser: ${fetchError}` : "",
  ].filter(Boolean).join("\n");

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono" title={title} aria-live="polite">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span className={state === "connected" ? "text-fg-1" : state === "delayed" ? "text-warn" : "text-bad"}>{label}</span>
      {detailed && health && (
        <span className="text-fg-2 hidden md:inline">
          · poll {ago(health.lastPollAt)} · update {ago(health.lastIncidentUpdateAt)}{health.lastLatencyMs !== undefined ? ` · ${health.lastLatencyMs} ms` : ""}
          {state !== "connected" && health.lastSuccessAt ? ` · last ok ${new Date(health.lastSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
        </span>
      )}
    </div>
  );
}
