import { useEffect, useState, useCallback, useRef } from "react";
import type { DecorPreset, RawMapData, RawMapGrid, MapCell } from "../../types/game";
import {
  fetchMapRaw,
  fetchDecorPresets,
  saveMapRaw,
  deleteMap,
  fetchMapsRaw,
  uploadAsset,
} from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import ColorPicker from "../shared/ColorPicker";
import { HelpButton, HelpPanel, helpStyles } from "../shared/HelpToggle";
import ConnectionOverlay from "./ConnectionOverlay";
import PresetEditor from "./PresetEditor";
import CellEditor from "./CellEditor";

type Tool = "none" | "blank" | "cell" | { preset: DecorPreset };

export function HelpTip({ text }: { text: string }) {
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
            <div className={helpStyles.helpP}>{t("map.bgHelp")}</div>
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

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
      <span style={{ minWidth: "90px", color: T.textSub }}>{label}:</span>
      {children}
    </div>
  );
}

// --- Sub-components ---

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

export function BgImagePicker({
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
