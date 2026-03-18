import T from "../../theme";

export function Tooltip({ text, anchorRef }: { text: string; anchorRef: HTMLElement | null }) {
  if (!anchorRef || !text) return null;
  const rect = anchorRef.getBoundingClientRect();
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.top - 4,
        transform: "translate(-50%, -100%)",
        padding: "4px 10px",
        backgroundColor: T.bg3,
        color: T.text,
        border: `1px solid ${T.borderLight}`,
        borderRadius: "3px",
        fontSize: "11px",
        whiteSpace: "nowrap",
        maxWidth: "320px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {text}
    </div>
  );
}
