import T from "../../theme";

/** Horizontal divider with an accent label — used to separate sections in Manager lists. */
export function SectionDivider({ label, margin }: { label: string; margin?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: margin ?? "4px 0 2px",
        fontSize: "12px",
        color: T.textDim,
      }}
    >
      <span style={{ color: T.accent, fontWeight: "bold" }}>{label}</span>
      <span style={{ flex: 1, height: "1px", backgroundColor: T.borderDim }} />
    </div>
  );
}
