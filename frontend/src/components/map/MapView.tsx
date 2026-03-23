import { useCallback } from "react";
import type { GameMap, MapGrid } from "../../types/game";
import { t } from "../../i18n/ui";
import s from "./MapView.module.css";

interface MapViewProps {
  map: GameMap;
  playerCellId: number | null;
  onCellClick: (cellId: number) => void;
}

export default function MapView({ map, playerCellId, onCellClick }: MapViewProps) {
  const renderCell = useCallback(
    (cell: MapGrid, rowIdx: number, colIdx: number) => {
      const isPlayerHere = cell.cellId !== null && cell.cellId === playerCellId;
      const isMovable = cell.cellId !== null && !isPlayerHere;

      const style: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.2em",
        height: "1.2em",
        textAlign: "center",
        boxSizing: "border-box" as const,
        color: isPlayerHere ? "#00FF00" : cell.color,
        fontWeight: isPlayerHere ? "bold" : "normal",
        cursor: isMovable ? "pointer" : "default",
        backgroundColor: isPlayerHere
          ? "rgba(0, 255, 0, 0.15)"
          : isMovable
            ? "rgba(255, 255, 255, 0.05)"
            : "transparent",
        borderRadius: isPlayerHere ? "3px" : "0",
        textDecoration: isMovable ? "underline" : "none",
      };

      return (
        <span
          key={`${rowIdx}-${colIdx}`}
          style={style}
          onClick={isMovable ? () => onCellClick(cell.cellId!) : undefined}
          title={isPlayerHere ? t("map.currentPos") : isMovable ? t("map.moveTo", { cell: cell.text }) : undefined}
        >
          {cell.text || "\u00A0"}
        </span>
      );
    },
    [playerCellId, onCellClick],
  );

  return (
    <div
      className={s.wrapper}
      style={{
        backgroundColor:
          map.defaultColor +
          Math.round((map.mapOverlayOpacity ?? 0.7) * 255)
            .toString(16)
            .padStart(2, "0"),
      }}
    >
      {map.grid.map((row, rowIdx) => (
        <div key={rowIdx} className={s.row}>
          {row.map((cell, colIdx) => renderCell(cell, rowIdx, colIdx))}
        </div>
      ))}
    </div>
  );
}
