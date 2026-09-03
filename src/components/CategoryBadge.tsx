import type { IncidentCategory } from "@/types/incident";
import { categoryStyle } from "@/lib/categories";

export default function CategoryBadge({ category, text, className = "" }: { category: IncidentCategory; text?: string; className?: string }) {
  const s = categoryStyle(category);
  return (
    <span className={`cat-badge ${className}`} style={{ ["--c" as string]: `var(--${s.token})` }} title={s.label}>
      <span aria-hidden>{s.glyph}</span>
      <span>{text ?? s.code}</span>
    </span>
  );
}
