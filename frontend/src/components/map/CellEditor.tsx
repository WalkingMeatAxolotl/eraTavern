import type { MapCell, RawMapData } from "../../types/game";
import T from "../../theme";
import { t } from "../../i18n/ui";
import ColorPicker from "../shared/ColorPicker";
import { Section, Row, BgImagePicker, HelpTip } from "./MapEditor";

interface CellEditorProps {
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
}

export default function CellEditor({
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
}: CellEditorProps) {
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
