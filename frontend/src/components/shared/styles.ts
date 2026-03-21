import T from "../../theme";

export const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: T.bg3,
  color: T.text,
  border: `1px solid ${T.borderLight}`,
  borderRadius: "3px",
  fontSize: "12px",
};

export const labelStyle: React.CSSProperties = {
  color: T.textSub,
  fontSize: "11px",
  marginBottom: "2px",
};

// ── Button factory ──

type BtnType = "default" | "neutral" | "create" | "danger" | "primary" | "add" | "del";
type BtnSize = "sm" | "md" | "lg";

const BTN_COLORS: Record<BtnType, string> = {
  default: T.text,
  neutral: T.textSub,
  create: T.successDim,
  danger: T.danger,
  primary: T.accent,
  add: T.successDim,
  del: T.danger,
};

const BTN_BG: Partial<Record<BtnType, { bg: string; border: string }>> = {
  add: { bg: "#0a1a0a", border: "1px solid #2a4a2a" },
  del: { bg: "#1a0a0a", border: "1px solid #4a2a2a" },
};

const BTN_SIZES: Record<BtnSize, { padding: string; fontSize: string }> = {
  sm: { padding: "2px 8px", fontSize: "11px" },
  md: { padding: "4px 12px", fontSize: "13px" },
  lg: { padding: "5px 16px", fontSize: "13px" },
};

/** Unified button style factory.
 * @param type  color variant (default: "default")
 * @param size  padding/font size (default: "lg")
 * @example btn("create", "md")  // green manager header button
 * @example btn("danger")        // red editor button (lg)
 * @example btn("add", "sm")     // green-tinted inline [+] button
 * @example btn("del", "sm")     // red-tinted inline [x] button
 */
export const btn = (type: BtnType = "default", size: BtnSize = "lg"): React.CSSProperties => {
  const tint = BTN_BG[type];
  return {
    ...BTN_SIZES[size],
    backgroundColor: tint?.bg ?? T.bg2,
    color: BTN_COLORS[type],
    border: tint?.border ?? `1px solid ${T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
  };
};


export const rowBg = (idx: number) => (idx % 2 === 0 ? T.bg1 : T.bg2);

export const listRowStyle = (idx: number, last: boolean): React.CSSProperties => ({
  backgroundColor: rowBg(idx),
  borderBottom: last ? "none" : `1px solid ${T.borderDim}`,
  padding: "3px 4px",
  borderRadius: "2px",
});

// ── Manager hover styles ──

const HOVER_RULES = {
  /** Items / chips with border highlight */
  border: `background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important;`,
  /** Category buttons with text color highlight */
  color: `background-color: ${T.bg3} !important; color: ${T.text} !important;`,
  /** Simple bg-only hover */
  simple: `background-color: ${T.bg3} !important;`,
} as const;

type HoverType = keyof typeof HOVER_RULES;

/**
 * Generate `<style>` CSS for manager hover effects.
 * @param prefix - class prefix, e.g. "am" → `.am-item:hover`
 * @param rules  - [classSuffix, hoverType] pairs
 * @example createHoverStyles("am", [["cat-btn","color"], ["item","border"], ["action-btn","border"]])
 */
export function createHoverStyles(prefix: string, rules: [string, HoverType][]): string {
  return rules.map(([cls, type]) => `.${prefix}-${cls}:hover { ${HOVER_RULES[type]} }`).join("\n");
}
