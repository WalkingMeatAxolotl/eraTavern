import T from "../theme";
import type { GameMap } from "../types/game";

interface MapTabsProps {
  maps: Record<string, GameMap>;
  activeMapId: string;
  playerMapId: string;
  playerCellName: string;
  mapExpanded: boolean;
  onToggleMap: () => void;
  onSelectMap: (mapId: string) => void;
}

export default function MapTabs({
  maps,
  activeMapId,
  playerMapId,
  playerCellName,
  mapExpanded,
  onToggleMap,
  onSelectMap,
}: MapTabsProps) {
  const mapList = Object.values(maps);

  return (
    <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
      {mapList.map((map) => {
        const isActive = map.id === activeMapId;
        const isCurrent = map.id === playerMapId;
        const label = isCurrent ? `${map.name} - ${playerCellName}` : map.name;

        return (
          <button
            key={map.id}
            onClick={() => onSelectMap(map.id)}
            style={{
              padding: "6px 16px",
              backgroundColor: isActive ? T.bg2 : T.bg1,
              color: isActive ? T.accent : T.text,
              border: `1px solid ${T.border}`,
              borderBottom: isActive ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            [{label}]
          </button>
        );
      })}

      <button
        onClick={onToggleMap}
        style={{
          marginLeft: "auto",
          padding: "4px 10px",
          backgroundColor: "transparent",
          color: T.textSub,
          border: `1px solid ${T.border}`,
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        {mapExpanded ? "▲" : "▼"}
      </button>
    </div>
  );
}
