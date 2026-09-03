"use client";
import { useSyncExternalStore } from "react";
/** Wall-clock ticks for elapsed-time displays, quantized to the interval. Null on the server render. */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (onChange) => { const t = setInterval(onChange, intervalMs); return () => clearInterval(t); },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}
