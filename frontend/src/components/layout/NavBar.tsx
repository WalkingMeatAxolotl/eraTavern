import T from "../../theme";
import { t } from "../../i18n/ui";

type NavPage =
  | "characters"
  | "traits"
  | "clothing"
  | "items"
  | "actions"
  | "variables"
  | "events"
  | "lorebook"
  | "maps"
  | "settings"
  | "llm"
  | "system";

interface NavBarProps {
  navPage: NavPage | null;
  onNavChange: (page: NavPage | null) => void;
  worldName: string;
  maxWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

type NavItem = { key: NavPage; label: string };

const worldTabs: NavItem[] = [
  { key: "characters", label: t("nav.characters") },
  { key: "traits", label: t("nav.traits") },
  { key: "clothing", label: t("nav.clothing") },
  { key: "items", label: t("nav.items") },
  { key: "actions", label: t("nav.actions") },
  { key: "variables", label: t("nav.variables") },
  { key: "events", label: t("nav.events") },
  { key: "lorebook", label: t("nav.lorebook") },
  { key: "maps", label: t("nav.maps") },
  { key: "settings", label: t("nav.settings") },
];

const globalTabs: NavItem[] = [
  { key: "llm", label: t("nav.llm") },
  { key: "system", label: t("nav.system") },
];

export default function NavBar({
  navPage,
  onNavChange,
  worldName,
  maxWidth,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
}: NavBarProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    backgroundColor: "transparent",
    color: active ? T.accent : T.textSub,
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? "bold" : "normal",
  });

  const sideToggleStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    backgroundColor: active ? T.accentBg : "transparent",
    color: active ? T.accent : T.textDim,
    border: active ? `1px solid ${T.accentDim}44` : "1px solid transparent",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: active ? "bold" : "normal",
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        backgroundColor: T.bg0,
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px",
          boxSizing: "border-box",
        }}
      >
        {/* Left: world toggle + world name + separator + nav tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <button style={sideToggleStyle(leftOpen)} onClick={onToggleLeft}>
            [{t("btn.world")}]
          </button>
          {worldName && (
            <span
              style={{
                color: T.textDim,
                fontSize: "12px",
                marginLeft: "4px",
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {worldName}
            </span>
          )}
          <span style={{ color: T.borderDim, margin: "0 4px" }}>|</span>
          {worldTabs.map((item) => (
            <button
              key={item.key}
              style={btnStyle(navPage === item.key)}
              onClick={() => onNavChange(navPage === item.key ? null : item.key)}
            >
              [{item.label}]
            </button>
          ))}
        </div>

        {/* Right: global tabs + addon toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {globalTabs.map((item) => (
            <button
              key={item.key}
              style={btnStyle(navPage === item.key)}
              onClick={() => onNavChange(navPage === item.key ? null : item.key)}
            >
              [{item.label}]
            </button>
          ))}
          <span style={{ color: T.borderDim, margin: "0 4px" }}>|</span>
          <button style={sideToggleStyle(rightOpen)} onClick={onToggleRight}>
            [{t("btn.addon")}]
          </button>
        </div>
      </div>
    </div>
  );
}
