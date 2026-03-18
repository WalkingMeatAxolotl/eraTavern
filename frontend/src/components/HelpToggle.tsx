import { useState } from "react";
import T from "../theme";

// Shared help text styles
export const helpBox: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: T.bg3,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
};
export const helpSub: React.CSSProperties = {
  color: "#e9a045",
  fontSize: "11px",
  fontWeight: "bold",
  marginTop: "6px",
  marginBottom: "2px",
};
export const helpP: React.CSSProperties = { color: T.textSub, fontSize: "11px", lineHeight: "1.6", margin: "2px 0" };
export const helpEm: React.CSSProperties = { color: "#0ff", fontSize: "11px" };
export const helpDim: React.CSSProperties = { color: T.textDim, fontSize: "11px", fontStyle: "italic" };

interface Props {
  children: React.ReactNode;
}

/**
 * [?] toggle button. Renders help panel below the button's parent via portal-like pattern.
 * Usage: place <HelpToggle> as last child in a label/header row.
 */
export function HelpButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: "3px 10px",
        backgroundColor: T.bg2,
        border: `1px solid ${T.border}`,
        borderRadius: "3px",
        cursor: "pointer",
        fontSize: "11px",
        color: show ? T.danger : T.textSub,
      }}
    >
      [?]
    </button>
  );
}

export function HelpPanel({ children }: Props) {
  return <div style={{ ...helpBox, marginTop: "4px", marginBottom: "4px" }}>{children}</div>;
}

/**
 * Combined [?] button + panel. Must be placed in its own container (not inside a flex row).
 * For flex row usage, use HelpButton + HelpPanel separately.
 */
export default function HelpToggle({ children }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: "inline-block" }}>
      <HelpButton show={show} onToggle={() => setShow((v) => !v)} />
      {show && <HelpPanel>{children}</HelpPanel>}
    </div>
  );
}
