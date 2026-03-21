import { useEffect, useState } from "react";
import type { DecorPreset } from "../../types/game";
import { saveDecorPresets } from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import ColorPicker from "../shared/ColorPicker";

interface PresetEditorProps {
  presets: DecorPreset[];
  inputStyle: React.CSSProperties;
  btnStyle: React.CSSProperties;
  onSaved: () => void;
}

export default function PresetEditor({
  presets,
  inputStyle,
  btnStyle,
  onSaved,
}: PresetEditorProps) {
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
