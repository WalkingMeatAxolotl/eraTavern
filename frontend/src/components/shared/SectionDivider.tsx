import s from "./SectionDivider.module.css";

/** Horizontal divider with an accent label — used to separate sections in Manager lists. */
export function SectionDivider({ label, margin }: { label: string; margin?: string }) {
  return (
    <div className={s.divider} style={margin ? { margin } : undefined}>
      <span className={s.label}>{label}</span>
      <span className={s.line} />
    </div>
  );
}
