import type { GameMap } from "../../types/game";
import s from "./MapTabs.module.css";

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
    <div className={s.wrapper}>
      {mapList.map((map) => {
        const isActive = map.id === activeMapId;
        const isCurrent = map.id === playerMapId;
        const label = isCurrent ? `${map.name} - ${playerCellName}` : map.name;

        return (
          <button
            key={map.id}
            onClick={() => onSelectMap(map.id)}
            className={isActive ? s.tabActive : s.tab}
          >
            [{label}]
          </button>
        );
      })}

      <button onClick={onToggleMap} className={s.toggleBtn}>
        {mapExpanded ? "\u25B2" : "\u25BC"}
      </button>
    </div>
  );
}
