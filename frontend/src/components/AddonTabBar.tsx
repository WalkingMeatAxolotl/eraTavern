import T from "../theme";

interface AddonTabBarProps {
  addons: { id: string; version: string }[];
  selectedAddon: string | null; // null = "全部(只读)"
  onSelect: (addonId: string | null) => void;
}

const tabBase: React.CSSProperties = {
  padding: "4px 12px",
  border: `1px solid ${T.border}`,
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
      borderBottom: `1px solid ${T.border}`,
      marginBottom: "8px",
      flexWrap: "wrap",
    }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          ...tabBase,
          backgroundColor: selectedAddon === null ? T.bg2 : "transparent",
          color: selectedAddon === null ? T.accent : T.textDim,
          borderColor: selectedAddon === null ? T.border : T.borderDim,
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
            backgroundColor: selectedAddon === a.id ? T.bg2 : "transparent",
            color: selectedAddon === a.id ? T.accent : T.textSub,
            borderColor: selectedAddon === a.id ? T.border : T.borderDim,
          }}
        >
          {a.id}
        </button>
      ))}
    </div>
  );
}
