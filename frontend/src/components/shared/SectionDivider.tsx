import s from "./SectionDivider.module.css";

/** Lightweight section label with trailing line — separates top-level sections in Manager lists. */
export function SectionDivider({ label, margin }: { label: string; margin?: string }) {
  return (
    <div className={s.divider} style={margin ? { margin } : undefined}>
      <span className={s.label}>{label}</span>
      <span className={s.line} />
    </div>
  );
}
