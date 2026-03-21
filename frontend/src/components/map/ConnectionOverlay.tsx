import type { MapCell } from "../../types/game";

interface ConnectionOverlayProps {
  cells: MapCell[];
  gridRef: React.RefObject<HTMLDivElement>;
  gridRows: number;
  gridCols: number;
  selectedCellId: number | null;
}

export default function ConnectionOverlay({
  cells,
  gridRows,
  gridCols,
  selectedCellId,
}: ConnectionOverlayProps) {
  // Cell size: 1.2em at 13px font = 15.6px per cell
  const CELL_PX = 15.6;
  const cellW = CELL_PX;
  const cellH = CELL_PX;
  const w = gridCols * cellW;
  const h = gridRows * cellH;

  // Build cell position map: id → {row, col}
  const cellMap = new Map<number, MapCell>();
  for (const c of cells) cellMap.set(c.id, c);

  // Center position of a cell in pixels
  const cx = (c: MapCell) => c.col * cellW + cellW / 2;
  const cy = (c: MapCell) => c.row * cellH + cellH / 2;

  // Connection colors: green=normal, gold=senseBlocked, blue=senseOnly
  const CONN_COLORS = { normal: "#4CAF50", blocked: "#e9a045", senseOnly: "#5b9bd5" } as const;

  // Collect all connection lines (same-map only)
  const lines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    connType: "normal" | "blocked" | "senseOnly";
    highlight: boolean;
    key: string;
  }[] = [];

  for (const cell of cells) {
    for (const conn of cell.connections) {
      // Skip cross-map connections
      if (conn.targetMap) continue;
      const target = cellMap.get(conn.targetCell);
      if (!target) continue;

      const x1 = cx(cell);
      const y1 = cy(cell);
      const x2 = cx(target);
      const y2 = cy(target);

      const highlight = cell.id === selectedCellId || target.id === selectedCellId;
      const connType = conn.senseOnly ? "senseOnly" : conn.senseBlocked ? "blocked" : "normal";

      lines.push({
        x1,
        y1,
        x2,
        y2,
        connType,
        highlight,
        key: `${cell.id}->${conn.targetCell}${conn.senseBlocked ? "s" : ""}${conn.senseOnly ? "o" : ""}`,
      });
    }
  }

  // Shorten lines so arrows don't overlap cell centers
  const shortenLine = (x1: number, y1: number, x2: number, y2: number, shrink: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < shrink * 2) return { x1, y1, x2, y2 };
    const ratio = shrink / len;
    return {
      x1: x1 + dx * ratio,
      y1: y1 + dy * ratio,
      x2: x2 - dx * ratio,
      y2: y2 - dy * ratio,
    };
  };

  // Offset parallel bidirectional lines slightly so they don't overlap
  const offsetLine = (x1: number, y1: number, x2: number, y2: number, offset: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x1, y1, x2, y2 };
    const nx = (-dy / len) * offset;
    const ny = (dx / len) * offset;
    return { x1: x1 + nx, y1: y1 + ny, x2: x2 + nx, y2: y2 + ny };
  };

  // Detect bidirectional pairs for offsetting
  const edgeSet = new Set(
    lines.map((l) => {
      const [from, rest] = l.key.split("->");
      const to = rest?.replace(/[so]/g, "");
      return `${from}->${to}`;
    }),
  );
  const pairSet = new Set<string>();
  for (const line of lines) {
    const [from, rest] = line.key.split("->");
    const to = rest?.replace(/[so]/g, "");
    if (edgeSet.has(`${to}->${from}`)) {
      pairSet.add(line.key);
    }
  }

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: w,
        height: h,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        {(["normal", "blocked", "senseOnly"] as const).map((t) => (
          <g key={t}>
            <marker id={`arrow-${t}`} markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
              <polygon points="0,0 6,2.5 0,5" fill={CONN_COLORS[t]} opacity="0.8" />
            </marker>
            <marker id={`arrow-${t}-hi`} markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
              <polygon points="0,0 6,2.5 0,5" fill={CONN_COLORS[t]} />
            </marker>
          </g>
        ))}
      </defs>
      {lines.map((line) => {
        const isBidi = pairSet.has(line.key);
        const offset = isBidi ? 2.5 : 0;
        const shifted = offsetLine(line.x1, line.y1, line.x2, line.y2, offset);
        const shortened = shortenLine(shifted.x1, shifted.y1, shifted.x2, shifted.y2, cellW * 0.4);

        const color = CONN_COLORS[line.connType];
        const markerId = line.highlight ? `arrow-${line.connType}-hi` : `arrow-${line.connType}`;

        return (
          <line
            key={line.key}
            x1={shortened.x1}
            y1={shortened.y1}
            x2={shortened.x2}
            y2={shortened.y2}
            stroke={color}
            strokeWidth={line.highlight ? 1.5 : 1}
            strokeOpacity={line.highlight ? 0.9 : 0.5}
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
    </svg>
  );
}
