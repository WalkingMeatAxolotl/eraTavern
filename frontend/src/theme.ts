/**
 * Centralized color theme — CSS custom property references.
 *
 * Values are `var(--xxx)` strings so they work in both:
 *   - inline style={{ color: T.text }}  (legacy, being migrated)
 *   - CSS Modules: use var(--text) directly in .module.css
 *
 * Actual color values live in global.css :root.
 */

const T = {
  // ── Backgrounds ──
  bg0: "var(--bg0)",
  bg1: "var(--bg1)",
  bg2: "var(--bg2)",
  bg3: "var(--bg3)",
  bgFloat: "var(--bg-float)",

  // ── Borders ──
  border: "var(--border)",
  borderLight: "var(--border-light)",
  borderDim: "var(--border-dim)",

  // ── Text ──
  text: "var(--text)",
  textSub: "var(--text-sub)",
  textDim: "var(--text-dim)",
  textFaint: "var(--text-faint)",

  // ── Accent ──
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  accentBg: "var(--accent-bg)",

  // ── Semantic ──
  danger: "var(--danger)",
  dangerBg: "var(--danger-bg)",
  success: "var(--success)",
  successDim: "var(--success-dim)",

  // ── Action type colors ──
  actionMove: "var(--action-move)",
  actionLook: "var(--action-look)",
  actionConfigured: "var(--action-configured)",

  // ── Typography ──
  fontMono: "var(--font-mono)",
  fontBase: 13, // px — keep as number for inline style calculations
  fontSm: 12,
  fontXs: 11,
} as const;

export default T;
