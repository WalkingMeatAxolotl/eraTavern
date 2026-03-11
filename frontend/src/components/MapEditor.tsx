import { useEffect, useState, useCallback, useRef } from "react";
import type { DecorPreset, RawMapData, RawGridCell, MapCell } from "../types/game";
import {
  fetchMapRaw,
  fetchDecorPresets,
  saveDecorPresets,
  saveMapRaw,
  deleteMap,
  fetchMapsRaw,
  uploadAsset,
} from "../api/client";

type Tool = "none" | "blank" | "cell" | { preset: DecorPreset };

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

  const reloadPresets = () => fetchDecorPresets().then(setPresets);

  useEffect(() => {
    fetchMapRaw(mapId).then(setMapData);
    reloadPresets();
    fetchMapsRaw().then(setAllMaps);
  }, [mapId]);

  const updateGrid = useCallback(
    (row: number, col: number, value: RawGridCell) => {
      setMapData((prev) => {
        if (!prev) return prev;
        const newGrid = prev.grid.map((r) => [...r]);
        // Ensure row/col exists
        while (newGrid.length <= row) newGrid.push(Array(prev.grid[0]?.length ?? 1).fill(""));
        while (newGrid[row].length <= col) newGrid[row].push("");
        newGrid[row][col] = value;
        return { ...prev, grid: newGrid };
      });
    },
    []
  );

  const findCellAt = useCallback(
    (row: number, col: number): MapCell | undefined => {
      return mapData?.cells.find((c) => c.row === row && c.col === col);
    },
    [mapData?.cells]
  );

  const removeCellAt = useCallback(
    (row: number, col: number) => {
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
    },
    []
  );

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
          name: `区格${newId}`,
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
    [mapData, tool, findCellAt, removeCellAt, updateGrid]
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
    if (!confirm(`确认删除地图 "${mapData?.name}" ?`)) return;
    const result = await deleteMap(mapId);
    if (result.success) {
      onBack();
    } else {
      alert(result.message);
    }
  };

  const addRow = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      const cols = prev.grid[0]?.length ?? 1;
      return { ...prev, grid: [...prev.grid, Array(cols).fill("")] };
    });
  };

  const removeRow = () => {
    setMapData((prev) => {
      if (!prev || prev.grid.length <= 1) return prev;
      return { ...prev, grid: prev.grid.slice(0, -1) };
    });
  };

  const addCol = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      return { ...prev, grid: prev.grid.map((row) => [...row, ""]) };
    });
  };

  const removeCol = () => {
    setMapData((prev) => {
      if (!prev) return prev;
      if ((prev.grid[0]?.length ?? 0) <= 1) return prev;
      return { ...prev, grid: prev.grid.map((row) => row.slice(0, -1)) };
    });
  };

  if (!mapData) {
    return <div style={{ color: "#888" }}>加载中...</div>;
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
    background: "#1a1a2e",
    border: "1px solid #444",
    color: "#ddd",
    padding: "3px 10px",
    fontFamily: "monospace",
    fontSize: "12px",
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    background: "#1a1a2e",
    border: "1px solid #333",
    color: "#ddd",
    padding: "3px 6px",
    fontFamily: "monospace",
    fontSize: "12px",
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      onMouseUp={() => setMouseDown(false)}
      onMouseLeave={() => setMouseDown(false)}
    >
      {/* A. Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ color: "#e94560", fontSize: "15px", fontWeight: "bold" }}>
          == 编辑: {mapData.name} ==
        </span>
        <button onClick={onBack} style={btnStyle}>[返回]</button>
      </div>

      {/* B. Meta info */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "12px", color: "#888" }}>
          名称
          <input
            value={mapData.name}
            onChange={(e) => setMapData({ ...mapData, name: e.target.value })}
            style={{ ...inputStyle, marginLeft: "4px", width: "120px" }}
          />
        </label>
        <label style={{ fontSize: "12px", color: "#888" }}>
          背景色
          <input
            type="color"
            value={mapData.defaultColor}
            onChange={(e) => setMapData({ ...mapData, defaultColor: e.target.value })}
            style={{ marginLeft: "4px", width: "32px", height: "22px", border: "none", cursor: "pointer" }}
          />
        </label>
      </div>

      {/* C. Grid controls */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button onClick={addRow} style={btnStyle}>[+行]</button>
        <button onClick={removeRow} style={btnStyle}>[-行]</button>
        <button onClick={addCol} style={btnStyle}>[+列]</button>
        <button onClick={removeCol} style={btnStyle}>[-列]</button>
        <span style={{ fontSize: "12px", color: "#888" }}>{rows} x {cols}</span>
      </div>

      {/* D. Toolbar (decor presets) */}
      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", alignItems: "center" }}>
        <ToolButton
          label="选择"
          active={tool === "none"}
          onClick={() => setTool("none")}
          color="#888"
        />
        <ToolButton
          label="空白"
          active={tool === "blank"}
          onClick={() => setTool("blank")}
          color="#555"
        />
        <ToolButton
          label="区格"
          active={tool === "cell"}
          onClick={() => setTool("cell")}
          color="#4CAF50"
        />
        <span style={{ width: "8px" }} />
        {presets.map((p, i) => (
          <ToolButton
            key={i}
            label={p.text}
            active={typeof tool === "object" && "preset" in tool && tool.preset.text === p.text && tool.preset.color === p.color}
            onClick={() => setTool({ preset: p })}
            color={p.color}
          />
        ))}
        <span style={{ width: "8px" }} />
        <button
          onClick={() => setShowPresetEditor((v) => !v)}
          style={{
            ...btnStyle,
            fontSize: "11px",
            padding: "2px 8px",
            color: showPresetEditor ? "#e94560" : "#888",
          }}
        >
          {showPresetEditor ? "[收起预设]" : "[编辑预设]"}
        </button>
      </div>

      {showPresetEditor && (
        <PresetEditor
          presets={presets}
          inputStyle={inputStyle}
          btnStyle={btnStyle}
          onSaved={reloadPresets}
        />
      )}

      {/* E. Grid editing area */}
      <div
        style={{
          overflowX: "auto",
          border: "1px solid #333",
          background: mapData.defaultColor,
          padding: "4px",
          userSelect: "none",
        }}
      >
        <div style={{ display: "inline-block" }}>
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
                      fontFamily: "monospace",
                      color,
                      background: isSelected
                        ? "#2a4a2a"
                        : isCell
                          ? "#1a2a1a"
                          : "#0f0f1a",
                      border: isCell
                        ? "1px dashed #4CAF50"
                        : "1px solid #1a1a2e",
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                    title={
                      isCell
                        ? `区格 #${cellId} (${ri},${ci})`
                        : `(${ri},${ci})`
                    }
                  >
                    {text || "\u00A0"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* F. Cell editing panel */}
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

      {/* G. Action bar */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...btnStyle,
            background: "#0a3d0a",
            borderColor: "#2a6a2a",
            color: "#8f8",
          }}
        >
          {saving ? "保存中..." : "[保存]"}
        </button>
        <button
          onClick={handleDelete}
          style={{
            ...btnStyle,
            background: "#3d0a0a",
            borderColor: "#6a2a2a",
            color: "#f88",
          }}
        >
          [删除地图]
        </button>
        <button onClick={onBack} style={btnStyle}>[返回]</button>
      </div>
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
        fontFamily: "monospace",
        color,
        background: active ? "#2a2a4e" : "#0f0f1a",
        border: active ? "2px solid #e94560" : "1px solid #333",
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
  const gamePresets = presets.filter((p) => p.source === "game");
  const [editing, setEditing] = useState<DecorPreset[]>(
    gamePresets.map((p) => ({ text: p.text, color: p.color }))
  );
  const [newText, setNewText] = useState("");
  const [newColor, setNewColor] = useState("#FFFFFF");

  // Sync when presets reload
  useEffect(() => {
    setEditing(
      presets.filter((p) => p.source === "game").map((p) => ({ text: p.text, color: p.color }))
    );
  }, [presets]);

  const handleSave = async () => {
    await saveDecorPresets(editing);
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
        background: "#16213e",
        border: "1px solid #333",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ fontSize: "12px", color: "#888" }}>
        游戏预设:
      </div>
      {editing.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.2em",
              height: "2.2em",
              fontSize: "13px",
              fontFamily: "monospace",
              color: p.color,
              background: "#0f0f1a",
              border: "1px solid #333",
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
          <input
            type="color"
            value={p.color}
            onChange={(e) => {
              const next = [...editing];
              next[i] = { ...next[i], color: e.target.value };
              setEditing(next);
            }}
            style={{ width: "32px", height: "22px", border: "none", cursor: "pointer" }}
          />
          <button
            onClick={() => setEditing(editing.filter((_, j) => j !== i))}
            style={{ ...btnStyle, color: "#f88", borderColor: "#6a2a2a", padding: "2px 6px" }}
          >
            x
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="符号"
          style={{ ...inputStyle, width: "50px" }}
          maxLength={2}
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          style={{ width: "32px", height: "22px", border: "none", cursor: "pointer" }}
        />
        <button
          onClick={handleAdd}
          style={{ ...btnStyle, color: "#8f8", borderColor: "#2a6a2a" }}
        >
          [+]
        </button>
      </div>

      <button
        onClick={handleSave}
        style={{ ...btnStyle, color: "#8f8", borderColor: "#2a6a2a", alignSelf: "flex-start" }}
      >
        [保存预设]
      </button>
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
    <div
      style={{
        background: "#16213e",
        border: "1px solid #333",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ color: "#e94560", fontSize: "13px", fontWeight: "bold" }}>
        区格编辑 #{cell.id}
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: "12px", color: "#888" }}>
          ID
          <input value={cell.id} disabled style={{ ...inputStyle, marginLeft: "4px", width: "50px", opacity: 0.6 }} />
        </label>
        <label style={{ fontSize: "12px", color: "#888" }}>
          名称
          <input
            value={cell.name ?? ""}
            onChange={(e) => onChange({ ...cell, name: e.target.value })}
            style={{ ...inputStyle, marginLeft: "4px", width: "120px" }}
          />
        </label>
        <label style={{ fontSize: "12px", color: "#888" }}>
          显示文字
          <input
            value={displayText}
            onChange={(e) => onUpdateGridText(e.target.value, displayColor)}
            style={{ ...inputStyle, marginLeft: "4px", width: "60px" }}
          />
        </label>
        <label style={{ fontSize: "12px", color: "#888" }}>
          颜色
          <input
            type="color"
            value={displayColor}
            onChange={(e) => onUpdateGridText(displayText, e.target.value)}
            style={{ marginLeft: "4px", width: "32px", height: "22px", border: "none", cursor: "pointer" }}
          />
        </label>
        <BgImagePicker
          image={cell.backgroundImage}
          cellId={cell.id}
          mapId={currentMapId}
          btnStyle={btnStyle}
          onChange={(filename) => onChange({ ...cell, backgroundImage: filename })}
        />
      </div>

      {/* Tags */}
      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "#888" }}>标签:</span>
        {(cell.tags ?? []).map((tag, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: "3px",
            padding: "1px 6px", fontSize: "11px",
            backgroundColor: "#1a3a2a", border: "1px solid #3a6a3a", borderRadius: "3px", color: "#8f8",
          }}>
            {tag}
            <button onClick={() => {
              const next = (cell.tags ?? []).filter((_, j) => j !== i);
              onChange({ ...cell, tags: next });
            }} style={{ background: "none", border: "none", color: "#f88", cursor: "pointer", padding: 0, fontSize: "11px" }}>×</button>
          </span>
        ))}
        <input
          placeholder="+ 标签"
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

      {/* Connections */}
      <div style={{ fontSize: "12px", color: "#888" }}>连接:</div>
      {cell.connections.map((conn, i) => {
        const targetMapId = conn.targetMap ?? currentMapId;
        // Get cells for the target map
        const targetMapCells =
          targetMapId === currentMapId
            ? mapData.cells
            : []; // For cross-map, we don't have cells loaded
        return (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <select
              value={targetMapId}
              onChange={(e) => {
                const newConns = [...cell.connections];
                if (e.target.value === currentMapId) {
                  newConns[i] = { targetCell: newConns[i].targetCell };
                } else {
                  newConns[i] = { ...newConns[i], targetMap: e.target.value };
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
                  const newConns = [...cell.connections];
                  newConns[i] = { ...newConns[i], targetCell: Number(e.target.value) };
                  onChange({ ...cell, connections: newConns });
                }}
                style={{ ...inputStyle, width: "130px" }}
              >
                {targetMapCells
                  .filter((c) => c.id !== cell.id)
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
                  const newConns = [...cell.connections];
                  newConns[i] = { ...newConns[i], targetCell: Number(e.target.value) };
                  onChange({ ...cell, connections: newConns });
                }}
                placeholder="区格ID"
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
              title="移动耗时(分)"
              style={{ ...inputStyle, width: "50px" }}
            />
            <span style={{ color: "#666", fontSize: "10px" }}>分</span>
            <label style={{ display: "flex", alignItems: "center", gap: "2px", cursor: "pointer" }} title="感知阻断：勾选后NPC无法通过此连接感知对面的角色">
              <input
                type="checkbox"
                checked={!!conn.senseBlocked}
                onChange={(e) => {
                  const newConns = [...cell.connections];
                  if (e.target.checked) {
                    newConns[i] = { ...newConns[i], senseBlocked: true };
                  } else {
                    const { senseBlocked: _, ...rest } = newConns[i];
                    newConns[i] = rest;
                  }
                  onChange({ ...cell, connections: newConns });
                }}
                style={{ margin: 0 }}
              />
              <span style={{ color: "#e9a045", fontSize: "10px", whiteSpace: "nowrap" }}>隔感知</span>
            </label>
            <button
              onClick={() => {
                const newConns = cell.connections.filter((_, j) => j !== i);
                onChange({ ...cell, connections: newConns });
              }}
              style={{ ...btnStyle, color: "#f88", borderColor: "#6a2a2a", padding: "2px 6px" }}
            >
              x
            </button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => {
            // Default: connect to first other cell in same map
            const otherCell = mapData.cells.find((c) => c.id !== cell.id);
            const targetCell = otherCell?.id ?? 1;
            onChange({
              ...cell,
              connections: [...cell.connections, { targetCell }],
            });
          }}
          style={{ ...btnStyle, color: "#8f8", borderColor: "#2a6a2a" }}
        >
          [+连接]
        </button>
        <button
          onClick={onDelete}
          style={{ ...btnStyle, color: "#f88", borderColor: "#6a2a2a" }}
        >
          [删除区格]
        </button>
        <button onClick={onClose} style={btnStyle}>
          [完成]
        </button>
      </div>
    </div>
  );
}

function BgImagePicker({
  image,
  cellId,
  mapId,
  btnStyle: btn,
  onChange,
}: {
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
    const result = await uploadAsset(file, "backgrounds", name);
    if (result.success && result.filename) {
      onChange(result.filename);
    }
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "12px", color: "#888" }}>背景图</span>
      {image && (
        <img
          src={`/assets/backgrounds/${image}?t=${Date.now()}`}
          alt=""
          style={{ height: "28px", width: "48px", objectFit: "cover", borderRadius: "2px", border: "1px solid #333" }}
        />
      )}
      <span style={{ fontSize: "11px", color: "#666" }}>{image ?? "无"}</span>
      <button onClick={() => fileRef.current?.click()} style={{ ...btn, fontSize: "11px", padding: "2px 6px", color: "#8cf" }}>
        [选择]
      </button>
      {image && (
        <button onClick={() => onChange(undefined)} style={{ ...btn, fontSize: "11px", padding: "2px 6px", color: "#f88" }}>
          [清除]
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />
    </div>
  );
}
