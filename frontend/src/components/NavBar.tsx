type NavPage = "characters" | "traits" | "clothing" | "items" | "actions" | "maps" | "settings";

interface NavBarProps {
  navPage: NavPage | null;
  onNavChange: (page: NavPage | null) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  gameName: string;
  maxWidth: number;
}

type NavItem = { key: NavPage; label: string };

const navItems: NavItem[] = [
  { key: "characters", label: "人物" },
  { key: "traits", label: "特质" },
  { key: "clothing", label: "服装" },
  { key: "items", label: "物品" },
  { key: "actions", label: "行动" },
  { key: "maps", label: "地图" },
  { key: "settings", label: "系统配置" },
];

export default function NavBar({
  navPage,
  onNavChange,
  sidebarOpen,
  onToggleSidebar,
  gameName,
  maxWidth,
}: NavBarProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    backgroundColor: "transparent",
    color: active ? "#e94560" : "#888",
    border: "none",
    cursor: "pointer",
    fontFamily: "monospace",
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
        backgroundColor: "#0a0a1a",
        borderBottom: "1px solid #333",
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
          padding: "0 8px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: "4px" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              color: "#666",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
          >
            {gameName}
          </span>
          <button
            style={btnStyle(sidebarOpen)}
            onClick={onToggleSidebar}
          >
            [游戏卡]
          </button>
        </div>
      </div>
    </div>
  );
}
