type NavPage = "characters" | "traits" | "clothing" | "items" | "actions" | "maps" | "settings";

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
    color: active ? "#e94560" : "#888",
    border: "none",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "13px",
    fontWeight: active ? "bold" : "normal",
  });

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    backgroundColor: "transparent",
    color: active ? "#e94560" : "#666",
    border: "none",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "14px",
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
          padding: "0 4px",
          boxSizing: "border-box",
        }}
      >
        {/* Left toggle + nav tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <button style={toggleStyle(leftOpen)} onClick={onToggleLeft} title="世界">
            {leftOpen ? "[W]" : "[W]"}
          </button>
          <span style={{ color: "#333", margin: "0 2px" }}>|</span>
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

        {/* World name + right toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span
            style={{
              color: "#666",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
          >
            {worldName || "空世界"}
          </span>
          <span style={{ color: "#333", margin: "0 2px" }}>|</span>
          <button style={toggleStyle(rightOpen)} onClick={onToggleRight} title="Add-on">
            [A]
          </button>
        </div>
      </div>
    </div>
  );
}
