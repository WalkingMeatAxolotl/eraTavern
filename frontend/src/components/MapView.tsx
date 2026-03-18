import { useCallback } from "react";
import type { GameMap, MapGrid } from "../types/game";

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
          title={isPlayerHere ? "当前位置" : isMovable ? `移动到 ${cell.text}号` : undefined}
        >
          {cell.text || "\u00A0"}
        </span>
      );
    },
    [playerCellId, onCellClick],
  );

  return (
    <div
      style={{
        fontSize: "14px",
        backgroundColor:
          map.defaultColor +
          Math.round((map.mapOverlayOpacity ?? 0.7) * 255)
            .toString(16)
            .padStart(2, "0"),
        padding: "12px",
        borderRadius: "4px",
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}
    >
      {map.grid.map((row, rowIdx) => (
        <div key={rowIdx} style={{ display: "flex" }}>
          {row.map((cell, colIdx) => renderCell(cell, rowIdx, colIdx))}
        </div>
      ))}
    </div>
  );
}
