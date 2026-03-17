import T from "../theme";

type NavPage = "characters" | "traits" | "clothing" | "items" | "actions" | "variables" | "events" | "maps" | "llm" | "settings";

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

const navItems: NavItem[] = [
  { key: "characters", label: "人物" },
  { key: "traits", label: "属性" },
  { key: "clothing", label: "服装" },
  { key: "items", label: "物品" },
  { key: "actions", label: "行动" },
  { key: "variables", label: "变量" },
  { key: "events", label: "事件" },
  { key: "maps", label: "地图" },
  { key: "llm", label: "LLM" },
  { key: "settings", label: "设置" },
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
            [世界]
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
          {navItems.map((item) => (
            <button
              key={item.key}
              style={btnStyle(navPage === item.key)}
              onClick={() =>
                onNavChange(navPage === item.key ? null : item.key)
              }
            >
              [{item.label}]
            </button>
          ))}
        </div>

        {/* Right: addon toggle */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <button style={sideToggleStyle(rightOpen)} onClick={onToggleRight}>
            [扩展]
          </button>
        </div>
      </div>
    </div>
  );
}
