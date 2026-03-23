import { useEffect, useState } from "react";
import type { DecorPreset } from "../../types/game";
import { saveDecorPresets } from "../../api/client";
import { t } from "../../i18n/ui";
import ColorPicker from "../shared/ColorPicker";
import s from "./PresetEditor.module.css";
import me from "./MapEditor.module.css";

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
    <div className={s.wrapper}>
      <div className={s.heading}>{t("section.decorPreset")}</div>
      {editing.map((p, i) => (
        <div key={i} className={s.presetRow}>
          <span className={s.presetPreview} style={{ color: p.color }}>
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
            className={me.editorBtnSm}
            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          >
            x
          </button>
        </div>
      ))}

      <div className={s.addRow}>
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
          className={me.editorBtnSm}
          style={{ color: "var(--success-dim)", borderColor: "var(--success-dim)" }}
        >
          [+]
        </button>
        <span style={{ flex: 1 }} />
        <button
          onClick={handleSave}
          className={me.editorBtnSm}
          style={{ color: "var(--success-dim)", borderColor: "var(--success-dim)" }}
        >
          [{t("btn.savePreset")}]
        </button>
      </div>
    </div>
  );
}
