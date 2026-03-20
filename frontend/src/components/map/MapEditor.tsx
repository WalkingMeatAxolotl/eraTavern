import { useEffect, useState, useCallback, useRef } from "react";
import type { DecorPreset, RawMapData, RawMapGrid, MapCell } from "../../types/game";
import {
  fetchMapRaw,
  fetchDecorPresets,
  saveDecorPresets,
  saveMapRaw,
  deleteMap,
  fetchMapsRaw,
  uploadAsset,
} from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import ColorPicker from "../shared/ColorPicker";
import { HelpButton, HelpPanel, helpP } from "../shared/HelpToggle";

type Tool = "none" | "blank" | "cell" | { preset: DecorPreset };

function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        backgroundColor: T.bg3,
        color: T.textDim,
        fontSize: "10px",
        cursor: "help",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      ?
      {show &&
        ref.current &&
        (() => {
          const rect = ref.current!.getBoundingClientRect();
          return (
            <span
              style={{
                position: "fixed",
                left: rect.left + rect.width / 2,
                top: rect.top - 4,
                transform: "translate(-50%, -100%)",
                padding: "4px 10px",
                backgroundColor: T.bg3,
                color: T.text,
                border: `1px solid ${T.borderLight}`,
                borderRadius: "3px",
                fontSize: "11px",
                whiteSpace: "nowrap",
                maxWidth: "350px",
                pointerEvents: "none",
                zIndex: 1000,
              }}
            >
              {text}
            </span>
          );
        })()}
    </span>
  );
}

interface Props {
  mapId: string;
  onBack: () => void;
}

export default function MapEditor({ mapId, onBack }: Props) {
  const [mapData, setMapData] = useState<RawMapData | null>(null);
  const [presets, setPresets] = useState<DecorPreset[]>([]);
  const [allMaps, setAllMaps] = useState<{ id: string; name: string }[]>([]);
  const [tool, setTool] = useState<Tool>("none");
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [mouseDown, setMouseDown] = useState(false);
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  const [showConnections, setShowConnections] = useState(true);
  const [showBgHelp, setShowBgHelp] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const reloadPresets = () => fetchDecorPresets().then(setPresets);

  useEffect(() => {
    fetchMapRaw(mapId).then(setMapData);
    reloadPresets();
    fetchMapsRaw().then(setAllMaps);
  }, [mapId]);

  const updateGrid = useCallback((row: number, col: number, value: RawMapGrid) => {
    setMapData((prev) => {
      if (!prev) return prev;
      const newGrid = prev.grid.map((r) => [...r]);
      // Ensure row/col exists
      while (newGrid.length <= row) newGrid.push(Array(prev.grid[0]?.length ?? 1).fill(""));
      while (newGrid[row].length <= col) newGrid[row].push("");
      newGrid[row][col] = value;
      return { ...prev, grid: newGrid };
    });
  }, []);

  const findCellAt = useCallback(
    (row: number, col: number): MapCell | undefined => {
      return mapData?.cells.find((c) => c.row === row && c.col === col);
    },
    [mapData?.cells],
  );

  const removeCellAt = useCallback((row: number, col: number) => {
    setMapData((prev) => {
      if (!prev) return prev;
      const cellAtPos = prev.cells.find((c) => c.row === row && c.col === col);
      if (!cellAtPos) return prev;
      const removedId = cellAtPos.id;
      // Remove cell and clean connections referencing it
      const newCells = prev.cells
        .filter((c) => c.id !== removedId)
        .map((c) => ({
          ...c,
          connections: c.connections.filter((conn) => conn.targetCell !== removedId),
        }));
      return { ...prev, cells: newCells };
    });
  }, []);

  const handleGridClick = useCallback(
    (row: number, col: number) => {
      if (!mapData) return;

      const existingCell = findCellAt(row, col);

      if (tool === "blank") {
        if (existingCell) removeCellAt(row, col);
        updateGrid(row, col, "");
        setSelectedCellId(null);
      } else if (tool === "cell") {
        if (existingCell) {
          setSelectedCellId(existingCell.id);
          return;
        }
        // Create new cell
        const maxId = mapData.cells.reduce((max, c) => Math.max(max, c.id), 0);
        const newId = maxId + 1;
        const newCell: MapCell = {
          id: newId,
          row,
          col,
          name: t("map.defaultCellName", { id: newId }),
          connections: [],
        };
        setMapData((prev) => {
          if (!prev) return prev;
          return { ...prev, cells: [...prev.cells, newCell] };
        });
        updateGrid(row, col, [`${newId}`, mapData.defaultColor]);
        setSelectedCellId(newId);
      } else if (typeof tool === "object" && "preset" in tool) {
        if (existingCell) removeCellAt(row, col);
        updateGrid(row, col, [tool.preset.text, tool.preset.color]);
        setSelectedCellId(null);
      } else {
        // "none" tool - click to select cell
        if (existingCell) {
          setSelectedCellId(existingCell.id);
        } else {
          setSelectedCellId(null);
        }
      }
    },
    [mapData, tool, findCellAt, removeCellAt, updateGrid],
  );

  const handleSave = async () => {
    if (!mapData) return;
    setSaving(true);
    try {
      const result = await saveMapRaw(mapId, mapData);
      if (!result.success) alert(result.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteMap", { name: mapData?.name ?? "" }))) return;
    const result = await deleteMap(mapId);
    if (result.success) {
      onBack();
    } else {
      alert(result.message);
    }
  };

  const addRowBottom = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      const cols = prev.grid[0]?.length ?? 1;
      return { ...prev, grid: [...prev.grid, Array(cols).fill("")] };
    });
  };

  const addRowTop = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      const cols = prev.grid[0]?.length ?? 1;
      return {
        ...prev,
        grid: [Array(cols).fill(""), ...prev.grid],
        cells: prev.cells.map((c) => ({ ...c, row: c.row + 1 })),
      };
    });
  };

  const removeRowBottom = () => {
    setMapData((prev) => {
      if (!prev || prev.grid.length <= 1) return prev;
      const lastRow = prev.grid.length - 1;
      return {
        ...prev,
        grid: prev.grid.slice(0, -1),
        cells: prev.cells.filter((c) => c.row !== lastRow),
      };
    });
  };

  const removeRowTop = () => {
    setMapData((prev) => {
      if (!prev || prev.grid.length <= 1) return prev;
      return {
        ...prev,
        grid: prev.grid.slice(1),
        cells: prev.cells.filter((c) => c.row !== 0).map((c) => ({ ...c, row: c.row - 1 })),
      };
    });
  };

  const addColRight = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      return { ...prev, grid: prev.grid.map((row) => [...row, ""]) };
    });
  };

  const addColLeft = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        grid: prev.grid.map((row) => ["", ...row]),
        cells: prev.cells.map((c) => ({ ...c, col: c.col + 1 })),
      };
    });
  };

  const removeColRight = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      if ((prev.grid[0]?.length ?? 0) <= 1) return prev;
      const lastCol = (prev.grid[0]?.length ?? 1) - 1;
      return {
        ...prev,
        grid: prev.grid.map((row) => row.slice(0, -1)),
        cells: prev.cells.filter((c) => c.col !== lastCol),
      };
    });
  };

  const removeColLeft = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      if ((prev.grid[0]?.length ?? 0) <= 1) return prev;
      return {
        ...prev,
        grid: prev.grid.map((row) => row.slice(1)),
        cells: prev.cells.filter((c) => c.col !== 0).map((c) => ({ ...c, col: c.col - 1 })),
      };
    });
  };

  if (!mapData) {
    return <div style={{ color: T.textSub }}>{t("status.loading")}</div>;
  }

  const selectedCell = mapData.cells.find((c) => c.id === selectedCellId);
  const rows = mapData.grid.length;
  const cols = mapData.grid[0]?.length ?? 0;

  // Build set of cell positions for quick lookup
  const cellPositions = new Map<string, number>();
  for (const c of mapData.cells) {
    cellPositions.set(`${c.row},${c.col}`, c.id);
  }

  const btnStyle: React.CSSProperties = {
    background: "transparent",
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    color: T.text,
    padding: "4px 12px",
    fontSize: "13px",
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    background: T.bg3,
    border: `1px solid ${T.borderLight}`,
    borderRadius: "3px",
    color: T.text,
    padding: "3px 6px",
    fontSize: "13px",
    outline: "none",
  };

  return (
    <div
      style={{ fontSize: "13px", color: T.text, display: "flex", flexDirection: "column", gap: "6px" }}
      onMouseUp={() => setMouseDown(false)}
      onMouseLeave={() => setMouseDown(false)}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: "2px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("editor.editMap", { name: mapData.name })} ==</span>
      </div>

      {/* ── Section: 地图属性 ── */}
      <Section title={t("map.mapProps")}>
        <Row label={t("field.name")}>
          <input
            value={mapData.name}
            onChange={(e) => setMapData({ ...mapData, name: e.target.value })}
            style={{ ...inputStyle, width: "140px" }}
          />
        </Row>
        <Row label={t("field.intro")}>
          <input
            value={mapData.description ?? ""}
            onChange={(e) => setMapData({ ...mapData, description: e.target.value || undefined })}
            style={{ ...inputStyle, width: "200px" }}
            placeholder={t("map.mapIntro")}
          />
        </Row>
        <Row label={t("field.bgColor")}>
          <ColorPicker value={mapData.defaultColor} onChange={(c) => setMapData({ ...mapData, defaultColor: c })} />
        </Row>
        <Row label={t("field.bgImage")}>
          <BgImagePicker
            image={mapData.backgroundImage}
            cellId={0}
            mapId={mapId}
            btnStyle={btnStyle}
            onChange={(filename) => setMapData({ ...mapData, backgroundImage: filename })}
          />
          <HelpButton show={showBgHelp} onToggle={() => setShowBgHelp((v) => !v)} />
        </Row>
        {showBgHelp && (
          <HelpPanel>
            <div style={helpP}>{t("map.bgHelp")}</div>
          </HelpPanel>
        )}
        {mapData.backgroundImage && (
          <Row label={t("field.gridOpacity")}>
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round((mapData.mapOverlayOpacity ?? 0.7) * 100)}
              onChange={(e) =>
                setMapData({
                  ...mapData,
                  mapOverlayOpacity: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100,
                })
              }
              style={{ ...inputStyle, width: "60px" }}
            />
            <span style={{ color: T.textDim, fontSize: "11px" }}>%</span>
          </Row>
        )}
      </Section>

      {/* ── Section: 网格编辑 ── */}
      <Section title={t("map.gridEdit")}>
        {/* Grid size + view controls */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
          <span style={{ color: T.textSub, minWidth: "46px" }}>{t("map.size")}</span>
          <span style={{ color: T.textDim }}>{t("map.rows")}</span>
          <button onClick={addRowTop} style={{ ...btnStyle, padding: "2px 8px" }}>
            [↑+]
          </button>
          <button onClick={removeRowTop} style={{ ...btnStyle, padding: "2px 8px" }}>
            [↑-]
          </button>
          <button onClick={addRowBottom} style={{ ...btnStyle, padding: "2px 8px" }}>
            [↓+]
          </button>
          <button onClick={removeRowBottom} style={{ ...btnStyle, padding: "2px 8px" }}>
            [↓-]
          </button>
          <span style={{ color: T.textDim }}>{t("map.cols")}</span>
          <button onClick={addColLeft} style={{ ...btnStyle, padding: "2px 8px" }}>
            [←+]
          </button>
          <button onClick={removeColLeft} style={{ ...btnStyle, padding: "2px 8px" }}>
            [←-]
          </button>
          <button onClick={addColRight} style={{ ...btnStyle, padding: "2px 8px" }}>
            [→+]
          </button>
          <button onClick={removeColRight} style={{ ...btnStyle, padding: "2px 8px" }}>
            [→-]
          </button>
          <span style={{ color: T.textDim }}>
            {rows} × {cols}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setShowConnections((v) => !v)}
            style={{
              ...btnStyle,
              padding: "2px 8px",
              color: showConnections ? T.accent : T.textDim,
              borderColor: showConnections ? T.accentDim : T.border,
            }}
          >
            {showConnections ? `[${t("btn.hideConn")}]` : `[${t("btn.showConn")}]`}
          </button>
          {showConnections && (
            <span style={{ display: "inline-flex", gap: "8px", fontSize: "11px" }}>
              <span style={{ color: "#4CAF50" }}>{t("map.legendAll")}</span>
              <span style={{ color: "#e9a045" }}>{t("map.legendSenseBlock")}</span>
              <span style={{ color: "#5b9bd5" }}>{t("map.legendSenseOnly")}</span>
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ color: T.textSub, marginRight: "4px" }}>{t("map.tool")}</span>
          <ToolButton label={t("map.toolSelect")} active={tool === "none"} onClick={() => setTool("none")} color={T.textSub} />
          <ToolButton label={t("map.toolEmpty")} active={tool === "blank"} onClick={() => setTool("blank")} color={T.textDim} />
          <ToolButton label={t("map.toolCell")} active={tool === "cell"} onClick={() => setTool("cell")} color="#4CAF50" />
          {presets.length > 0 && (
            <>
              <span style={{ width: "1px", height: "18px", background: T.border, margin: "0 4px" }} />
              {presets.map((p, i) => (
                <ToolButton
                  key={i}
                  label={p.text}
                  active={
                    typeof tool === "object" &&
                    "preset" in tool &&
                    tool.preset.text === p.text &&
                    tool.preset.color === p.color
                  }
                  onClick={() => setTool({ preset: p })}
                  color={p.color}
                />
              ))}
            </>
          )}
          <span style={{ width: "1px", height: "18px", background: T.border, margin: "0 4px" }} />
          <button
            onClick={() => setShowPresetEditor((v) => !v)}
            style={{
              ...btnStyle,
              padding: "2px 8px",
              color: showPresetEditor ? T.accent : T.textSub,
              borderColor: showPresetEditor ? T.accentDim : T.border,
            }}
          >
            {showPresetEditor ? `[${t("btn.hidePresets")}]` : `[${t("btn.showPresets")}]`}
          </button>
        </div>

        {showPresetEditor && (
          <div style={{ marginBottom: "6px" }}>
            <PresetEditor presets={presets} inputStyle={inputStyle} btnStyle={btnStyle} onSaved={reloadPresets} />
          </div>
        )}

        {/* Grid canvas */}
        <div
          style={{
            overflowX: "auto",
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            background: mapData.defaultColor,
            backgroundImage: mapData.backgroundImage
              ? `url(/assets/backgrounds/${mapData.backgroundImage})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            padding: "4px",
            userSelect: "none",
            position: "relative",
          }}
        >
          {/* Overlay: defaultColor with mapOverlayOpacity on top of background image */}
          {mapData.backgroundImage && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: mapData.defaultColor,
                opacity: mapData.mapOverlayOpacity ?? 0.7,
                pointerEvents: "none",
                borderRadius: "3px",
              }}
            />
          )}
          <div ref={gridRef} style={{ display: "inline-block", position: "relative" }}>
            {mapData.grid.map((row, ri) => (
              <div key={ri} style={{ display: "flex" }}>
                {row.map((cell, ci) => {
                  const cellId = cellPositions.get(`${ri},${ci}`);
                  const isCell = cellId !== undefined;
                  const isSelected = isCell && cellId === selectedCellId;
                  let text = "";
                  let color = mapData.defaultColor;
                  if (typeof cell === "string") {
                    text = cell;
                  } else if (Array.isArray(cell) && cell.length === 2) {
                    text = cell[0];
                    color = cell[1];
                  }

                  return (
                    <div
                      key={ci}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setMouseDown(true);
                        handleGridClick(ri, ci);
                      }}
                      onMouseEnter={() => {
                        if (mouseDown && tool !== "none" && tool !== "cell") {
                          handleGridClick(ri, ci);
                        }
                      }}
                      style={{
                        width: "1.2em",
                        height: "1.2em",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        color,
                        background: isSelected
                          ? "rgba(42, 74, 42, 0.6)"
                          : isCell
                            ? "rgba(26, 42, 26, 0.5)"
                            : "rgba(15, 15, 26, 0.35)",
                        border: isCell ? "1px dashed #4CAF50" : `1px solid ${T.bg2}`,
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                      title={isCell ? t("map.cellTitle", { id: cellId!, row: ri, col: ci }) : `(${ri},${ci})`}
                    >
                      {text || "\u00A0"}
                    </div>
                  );
                })}
              </div>
            ))}
            {showConnections && (
              <ConnectionOverlay
                cells={mapData.cells}
                gridRef={gridRef}
                gridRows={rows}
                gridCols={cols}
                selectedCellId={selectedCellId}
              />
            )}
          </div>
        </div>
      </Section>

      {/* ── Section: 区格编辑 ── */}
      {selectedCell && (
        <CellEditor
          cell={selectedCell}
          mapData={mapData}
          allMaps={allMaps}
          currentMapId={mapId}
          inputStyle={inputStyle}
          btnStyle={btnStyle}
          onChange={(updated) => {
            setMapData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                cells: prev.cells.map((c) => (c.id === updated.id ? updated : c)),
              };
            });
          }}
          onChangeCells={(updatedCells) => {
            setMapData((prev) => {
              if (!prev) return prev;
              const updateMap = new Map(updatedCells.map((c) => [c.id, c]));
              return {
                ...prev,
                cells: prev.cells.map((c) => updateMap.get(c.id) ?? c),
              };
            });
          }}
          onUpdateGridText={(text, color) => {
            updateGrid(selectedCell.row, selectedCell.col, [text, color]);
          }}
          onDelete={() => {
            removeCellAt(selectedCell.row, selectedCell.col);
            updateGrid(selectedCell.row, selectedCell.col, "");
            setSelectedCellId(null);
          }}
          onClose={() => setSelectedCellId(null)}
        />
      )}

      {/* ── Footer actions ── */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          paddingTop: "8px",
          borderTop: `1px solid ${T.border}`,
          marginTop: "4px",
        }}
      >
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, color: T.successDim }}>
          {saving ? `[${t("status.submitting")}]` : `[${t("btn.confirm")}]`}
        </button>
        <button onClick={handleDelete} style={{ ...btnStyle, color: T.danger }}>
          [{t("btn.delete")}]
        </button>
        <button onClick={onBack} style={{ ...btnStyle, color: T.textSub }}>
          [{t("btn.back")}]
        </button>
      </div>
    </div>
  );
}

// --- Layout helpers ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "4px" }}>
      <div
        style={{
          color: T.accent,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: "6px",
          paddingBottom: "2px",
          fontWeight: "bold",
        }}
      >
        == {title} ==
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
      <span style={{ minWidth: "90px", color: T.textSub }}>{label}:</span>
      {children}
    </div>
  );
}

// --- Sub-components ---

function ConnectionOverlay({
  cells,
  gridRows,
  gridCols,
  selectedCellId,
}: {
  cells: MapCell[];
  gridRows: number;
  gridCols: number;
  selectedCellId: number | null;
}) {
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

function ToolButton({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "2.2em",
        height: "2.2em",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "13px",
        color,
        background: active ? T.bg2 : T.bg3,
        border: active ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
        cursor: "pointer",
        boxSizing: "border-box",
      }}
      title={label}
    >
      {label}
    </button>
  );
}

function PresetEditor({
  presets,
  inputStyle,
  btnStyle,
  onSaved,
}: {
  presets: DecorPreset[];
  inputStyle: React.CSSProperties;
  btnStyle: React.CSSProperties;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<DecorPreset[]>(
    presets.filter((p) => p.source === "game").map((p) => ({ text: p.text, color: p.color })),
  );
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState("#FFFFFF");

  // Sync when presets reload
  useEffect(() => {
    setEditing(presets.filter((p) => p.source === "game").map((p) => ({ text: p.text, color: p.color })));
  }, [presets]);

  const handleSave = async () => {
    // Merge: keep non-game presets unchanged, replace game presets with edited
    const nonGame = presets.filter((p) => p.source !== "game");
    const gameEdited = editing.map((p) => ({ ...p, source: "game" as const }));
    await saveDecorPresets([...nonGame, ...gameEdited]);
    onSaved();
  };

  const handleAdd = () => {
    if (!newText.trim()) return;
    setEditing([...editing, { text: newText.trim(), color: newColor }]);
    setNewText("");
  };

  return (
    <div
      style={{
        background: T.bg2,
        border: `1px solid ${T.border}`,
        borderRadius: "3px",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div style={{ color: T.textSub, fontWeight: "bold", fontSize: "12px" }}>{t("section.decorPreset")}</div>
      {editing.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            paddingLeft: "4px",
            borderLeft: `2px solid ${T.border}`,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.2em",
              height: "2.2em",
              fontSize: "13px",
              color: p.color,
              background: T.bg3,
              border: `1px solid ${T.border}`,
              borderRadius: "2px",
              flexShrink: 0,
            }}
          >
            {p.text}
          </span>
          <input
            value={p.text}
            onChange={(e) => {
              const next = [...editing];
              next[i] = { ...next[i], text: e.target.value };
              setEditing(next);
            }}
            style={{ ...inputStyle, width: "50px" }}
            maxLength={2}
          />
          <ColorPicker
            value={p.color}
            onChange={(c) => {
              const next = [...editing];
              next[i] = { ...next[i], color: c };
              setEditing(next);
            }}
          />
          <button
            onClick={() => setEditing(editing.filter((_, j) => j !== i))}
            style={{ ...btnStyle, color: T.danger, borderColor: `${T.danger}66`, padding: "2px 6px" }}
          >
            x
          </button>
        </div>
      ))}

      <div
        style={{
          display: "flex",
          gap: "6px",
          alignItems: "center",
          paddingTop: "4px",
          borderTop: `1px solid ${T.borderDim}`,
        }}
      >
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={t("map.symbol")}
          style={{ ...inputStyle, width: "50px" }}
          maxLength={2}
        />
        <ColorPicker value={newColor} onChange={(c) => setNewColor(c)} />
        <button
          onClick={handleAdd}
          style={{ ...btnStyle, padding: "2px 8px", color: T.successDim, borderColor: T.successDim }}
        >
          [+]
        </button>
        <span style={{ flex: 1 }} />
        <button
          onClick={handleSave}
          style={{ ...btnStyle, padding: "2px 8px", color: T.successDim, borderColor: T.successDim }}
        >
          [{t("btn.savePreset")}]
        </button>
      </div>
    </div>
  );
}

function CellEditor({
  cell,
  mapData,
  allMaps,
  currentMapId,
  inputStyle,
  btnStyle,
  onChange,
  onChangeCells,
  onUpdateGridText,
  onDelete,
  onClose,
}: {
  cell: MapCell;
  mapData: RawMapData;
  allMaps: { id: string; name: string }[];
  currentMapId: string;
  inputStyle: React.CSSProperties;
  btnStyle: React.CSSProperties;
  onChange: (cell: MapCell) => void;
  onChangeCells: (cells: MapCell[]) => void;
  onUpdateGridText: (text: string, color: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // Get current grid display text/color for this cell
  const gridVal = mapData.grid[cell.row]?.[cell.col];
  let displayText = "";
  let displayColor = mapData.defaultColor;
  if (typeof gridVal === "string") {
    displayText = gridVal;
  } else if (Array.isArray(gridVal) && gridVal.length === 2) {
    displayText = gridVal[0];
    displayColor = gridVal[1];
  }

  return (
    <Section title={t("map.cellEditTitle", { id: cell.id, name: cell.name ?? "" })}>
      {/* Basic properties */}
      <Row label={t("field.name")}>
        <input
          value={cell.name ?? ""}
          onChange={(e) => onChange({ ...cell, name: e.target.value })}
          style={{ ...inputStyle, width: "140px" }}
        />
      </Row>
      <Row label={t("field.intro")}>
        <input
          value={cell.description ?? ""}
          onChange={(e) => onChange({ ...cell, description: e.target.value || undefined })}
          style={{ ...inputStyle, width: "200px" }}
          placeholder={t("map.cellIntro")}
        />
      </Row>
      <Row label={t("map.displayText")}>
        <input
          value={displayText}
          onChange={(e) => onUpdateGridText(e.target.value, displayColor)}
          style={{ ...inputStyle, width: "60px" }}
        />
      </Row>
      <Row label={t("map.color")}>
        <ColorPicker value={displayColor} onChange={(c) => onUpdateGridText(displayText, c)} />
      </Row>
      <Row label={t("map.sceneBg")}>
        <BgImagePicker
          image={cell.backgroundImage}
          cellId={cell.id}
          mapId={currentMapId}
          btnStyle={btnStyle}
          onChange={(filename) => onChange({ ...cell, backgroundImage: filename })}
        />
        <HelpTip text={t("map.sceneBgHelp")} />
      </Row>

      {/* Tags */}
      <Row label={t("field.tags")}>
        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          {(cell.tags ?? []).map((tag, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "1px 6px",
                fontSize: "11px",
                backgroundColor: "#1a3a2a",
                border: "1px solid #3a6a3a",
                borderRadius: "3px",
                color: "#8f8",
              }}
            >
              {tag}
              <button
                onClick={() => {
                  const next = (cell.tags ?? []).filter((_, j) => j !== i);
                  onChange({ ...cell, tags: next });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: T.danger,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "11px",
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            placeholder={t("map.addTag")}
            style={{ ...inputStyle, width: "70px", fontSize: "11px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val && !(cell.tags ?? []).includes(val)) {
                  onChange({ ...cell, tags: [...(cell.tags ?? []), val] });
                }
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
      </Row>

      {/* Connections */}
      <div style={{ marginTop: "4px", borderTop: `1px solid ${T.borderDim}`, paddingTop: "6px" }}>
        <div style={{ color: T.textSub, marginBottom: "4px", fontWeight: "bold" }}>{t("section.connections")}</div>
        {cell.connections.map((conn, i) => {
          const targetMapId = conn.targetMap ?? currentMapId;
          const targetMapCells = targetMapId === currentMapId ? mapData.cells : [];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "6px",
                alignItems: "center",
                marginBottom: "4px",
                paddingLeft: "4px",
                borderLeft: `2px solid ${T.border}`,
              }}
            >
              <select
                value={targetMapId}
                onChange={(e) => {
                  const newMapId = e.target.value === currentMapId ? undefined : e.target.value;
                  const curTarget = cell.connections[i].targetCell;
                  if (
                    cell.connections.some(
                      (c, j) =>
                        j !== i &&
                        c.targetCell === curTarget &&
                        (c.targetMap ?? currentMapId) === (newMapId ?? currentMapId),
                    )
                  )
                    return;
                  const newConns = [...cell.connections];
                  if (!newMapId) {
                    const { targetMap: _, senseBlocked: __, ...rest } = newConns[i];
                    newConns[i] = rest;
                  } else {
                    newConns[i] = {
                      ...newConns[i],
                      targetMap: newMapId,
                      senseBlocked: newConns[i].senseBlocked ?? true,
                    };
                  }
                  onChange({ ...cell, connections: newConns });
                }}
                style={{ ...inputStyle, width: "130px" }}
              >
                {allMaps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {targetMapId === currentMapId ? (
                <select
                  value={conn.targetCell}
                  onChange={(e) => {
                    const newTarget = Number(e.target.value);
                    if (newTarget < 0) return;
                    const newConns = [...cell.connections];
                    const isBidi = (newConns[i] as any)._bidirectional;
                    const { _bidirectional: _, ...cleaned } = newConns[i] as any;
                    newConns[i] = { ...cleaned, targetCell: newTarget };
                    const updatedCell = { ...cell, connections: newConns };
                    // Handle bidirectional: add reverse connection on target
                    if (isBidi) {
                      const targetCellData = mapData.cells.find((c) => c.id === newTarget);
                      if (targetCellData && !targetCellData.connections.some((c) => c.targetCell === cell.id && !c.targetMap)) {
                        const updatedTarget = {
                          ...targetCellData,
                          connections: [...targetCellData.connections, { targetCell: cell.id }],
                        };
                        onChangeCells([updatedCell, updatedTarget]);
                        return;
                      }
                    }
                    onChange(updatedCell);
                  }}
                  style={{ ...inputStyle, width: "130px" }}
                >
                  {conn.targetCell < 0 && (
                    <option value={-1}>{t("map.selectCell")}</option>
                  )}
                  {targetMapCells
                    .filter(
                      (c) =>
                        c.id !== cell.id &&
                        (c.id === conn.targetCell ||
                          !cell.connections.some(
                            (cn, j) =>
                              j !== i && cn.targetCell === c.id && (cn.targetMap ?? currentMapId) === currentMapId,
                          )),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} {c.name ?? ""}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={conn.targetCell}
                  onChange={(e) => {
                    const newTarget = Number(e.target.value);
                    const newMap = cell.connections[i].targetMap;
                    if (
                      cell.connections.some((c, j) => j !== i && c.targetCell === newTarget && c.targetMap === newMap)
                    )
                      return;
                    const newConns = [...cell.connections];
                    newConns[i] = { ...newConns[i], targetCell: newTarget };
                    onChange({ ...cell, connections: newConns });
                  }}
                  placeholder={t("map.cellIdPh")}
                  style={{ ...inputStyle, width: "80px" }}
                />
              )}
              <input
                type="number"
                step={5}
                min={5}
                value={conn.travelTime ?? 10}
                onChange={(e) => {
                  const newConns = [...cell.connections];
                  const val = Math.max(5, Math.round(Number(e.target.value) / 5) * 5);
                  newConns[i] = { ...newConns[i], travelTime: val };
                  onChange({ ...cell, connections: newConns });
                }}
                title={t("map.travelTimeTitle")}
                style={{ ...inputStyle, width: "50px" }}
              />
              <span style={{ color: T.textDim, fontSize: "11px" }}>{t("ui.minutes")}</span>
              <label style={{ display: "flex", alignItems: "center", gap: "2px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!conn.senseBlocked}
                  disabled={!!conn.senseOnly}
                  onChange={(e) => {
                    const newConns = [...cell.connections];
                    newConns[i] = { ...newConns[i], senseBlocked: !e.target.checked };
                    onChange({ ...cell, connections: newConns });
                  }}
                  style={{ margin: 0 }}
                />
                <span style={{ color: T.textSub, fontSize: "11px", whiteSpace: "nowrap" }}>{t("map.canSense")}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "2px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!conn.senseOnly}
                  onChange={(e) => {
                    const newConns = [...cell.connections];
                    newConns[i] = {
                      ...newConns[i],
                      senseOnly: e.target.checked || undefined,
                      senseBlocked: e.target.checked ? undefined : newConns[i].senseBlocked,
                    };
                    onChange({ ...cell, connections: newConns });
                  }}
                  style={{ margin: 0 }}
                />
                <span style={{ color: T.textSub, fontSize: "11px", whiteSpace: "nowrap" }}>{t("map.senseOnly")}</span>
              </label>
              <HelpTip text={t("map.senseHelp")} />
              <button
                onClick={() => {
                  const newConns = cell.connections.filter((_, j) => j !== i);
                  onChange({ ...cell, connections: newConns });
                }}
                style={{ ...btnStyle, color: T.danger, borderColor: `${T.danger}66`, padding: "2px 6px" }}
              >
                x
              </button>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          <button
            onClick={() => {
              onChange({
                ...cell,
                connections: [...cell.connections, { targetCell: -1 }],
              });
            }}
            style={{ ...btnStyle, padding: "2px 8px", color: T.successDim, borderColor: T.successDim }}
          >
            [{t("btn.addOneWayConn")}]
          </button>
          <button
            onClick={() => {
              onChange({
                ...cell,
                connections: [...cell.connections, { targetCell: -1, _bidirectional: true } as any],
              });
            }}
            style={{ ...btnStyle, padding: "2px 8px", color: T.accent, borderColor: T.accentDim }}
          >
            [{t("btn.addTwoWayConn")}]
          </button>
        </div>
      </div>

      {/* Cell action bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "6px",
          paddingTop: "6px",
          borderTop: `1px solid ${T.borderDim}`,
        }}
      >
        <button onClick={onDelete} style={{ ...btnStyle, color: T.danger }}>
          [{t("btn.deleteCell")}]
        </button>
        <button onClick={onClose} style={{ ...btnStyle, color: T.textSub }}>
          [{t("btn.close")}]
        </button>
      </div>
    </Section>
  );
}

function BgImagePicker({
  label,
  image,
  cellId,
  mapId,
  btnStyle: btn,
  onChange,
}: {
  label?: string;
  image?: string;
  cellId: number;
  mapId: string;
  btnStyle: React.CSSProperties;
  onChange: (filename: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = `${mapId}_cell${cellId}`;
    const addonId = mapId.includes(".") ? mapId.split(".")[0] : undefined;
    const result = await uploadAsset(file, "backgrounds", name, { addonId });
    if (result.success && result.filename) {
      onChange(result.filename);
    }
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {label && <span style={{ fontSize: "13px", color: T.textSub }}>{label}</span>}
      {image && (
        <img
          src={`/assets/backgrounds/${image}?t=${Date.now()}`}
          alt=""
          style={{
            height: "24px",
            width: "42px",
            objectFit: "cover",
            borderRadius: "2px",
            border: `1px solid ${T.border}`,
          }}
        />
      )}
      <span
        style={{
          fontSize: "11px",
          color: T.textDim,
          maxWidth: "120px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {image ?? t("ui.none")}
      </span>
      <button onClick={() => fileRef.current?.click()} style={{ ...btn, padding: "2px 8px", color: T.accent }}>
        [{t("btn.select")}]
      </button>
      {image && (
        <button onClick={() => onChange(undefined)} style={{ ...btn, padding: "2px 8px", color: T.danger }}>
          [{t("btn.clear")}]
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
