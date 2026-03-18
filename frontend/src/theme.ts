/**
 * Centralized color theme.
 *
 * UI chrome: black/grey + accent orange.  Minimal color.
 * Data layer (editor section borders, resource bars, map cells):
 *   uses semantic colors defined where needed, not here.
 */

const T = {
  // ── Backgrounds (pure grey, no blue tint) ──
  bg0: "#0c0c0c", // deepest: app root
  bg1: "#141414", // panels, cards
  bg2: "#1c1c1c", // elevated: selected items, modals, expanded cards
  bg3: "#242424", // inputs, inset areas
  bgFloat: "#111111ee", // floating panels (with transparency)

  // ── Borders ──
  border: "#2a2a2a", // default
  borderLight: "#383838", // emphasized (selected, hover)
  borderDim: "#1e1e1e", // subtle dividers

  // ── Text ──
  text: "#d8d8d8", // primary
  textSub: "#999", // secondary (labels, IDs)
  textDim: "#666", // muted (placeholders, source, empty state)
  textFaint: "#444", // very muted (disabled)

  // ── Accent (single theme color — orange) ──
  accent: "#e8a040", // primary accent: active states, important labels
  accentDim: "#b07830", // muted accent: borders, less prominent
  accentBg: "#1a1408", // accent background tint (very subtle)

  // ── Semantic (used sparingly) ──
  danger: "#c05050", // delete, error, destructive
  dangerBg: "#1a0808", // danger button background
  success: "#5a9a5a", // success messages
  successDim: "#3a6a3a", // success button text / add buttons

  // ── Legacy support: action type colors (data layer) ──
  actionMove: "#0ff",
  actionLook: "#6ec6ff",
  actionConfigured: "#ff0",
  // ── Typography ──
  fontMono: '"Consolas", "Menlo", "Monaco", "Courier New", monospace',
  fontBase: 13, // px — default body size
  fontSm: 12, // px — secondary text, chips, tags
  fontXs: 11, // px — smallest readable (labels, hints)
} as const;

export default T;
