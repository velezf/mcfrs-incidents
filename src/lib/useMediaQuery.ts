"use client";
import { useSyncExternalStore } from "react";
/** True when the media query matches; false during the server render. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => { const m = window.matchMedia(query); m.addEventListener("change", onChange); return () => m.removeEventListener("change", onChange); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
