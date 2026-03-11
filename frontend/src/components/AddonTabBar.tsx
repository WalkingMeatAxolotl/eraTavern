interface AddonTabBarProps {
  addons: { id: string; version: string }[];
  selectedAddon: string | null; // null = "全部(只读)"
  onSelect: (addonId: string | null) => void;
}

const tabBase: React.CSSProperties = {
  padding: "4px 12px",
  border: "1px solid #333",
  borderBottom: "none",
  borderRadius: "4px 4px 0 0",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "12px",
  background: "none",
};

export default function AddonTabBar({ addons, selectedAddon, onSelect }: AddonTabBarProps) {
  if (addons.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      gap: "2px",
      borderBottom: "1px solid #333",
      marginBottom: "8px",
      flexWrap: "wrap",
    }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          ...tabBase,
          backgroundColor: selectedAddon === null ? "#16213e" : "transparent",
          color: selectedAddon === null ? "#e94560" : "#666",
          borderColor: selectedAddon === null ? "#333" : "#222",
        }}
      >
        [全部(只读)]
      </button>
      {addons.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a.id)}
          style={{
            ...tabBase,
            backgroundColor: selectedAddon === a.id ? "#16213e" : "transparent",
            color: selectedAddon === a.id ? "#e94560" : "#888",
            borderColor: selectedAddon === a.id ? "#333" : "#222",
          }}
        >
          {a.id}
        </button>
      ))}
    </div>
  );
}
