"use client";
import { useEffect, useState } from "react";
import { hhmmss } from "@/lib/format";

export default function Clock({ className = "" }: { className?: string }) {
  const [t, setT] = useState<string>("");
  useEffect(() => {
    const f = () => setT(hhmmss(new Date()));
    f();
    const i = setInterval(f, 1000);
    return () => clearInterval(i);
  }, []);
  return <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>{t || "--:--:--"}</span>;
}
