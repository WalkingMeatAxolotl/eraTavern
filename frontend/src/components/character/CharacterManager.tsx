import T from "../../theme";
import { useState, useCallback } from "react";
import { t } from "../../i18n/ui";
import type { GameDefinitions, RawCharacterData } from "../../types/game";
import { fetchDefinitions, fetchCharacterConfigs, patchCharacter } from "../../api/client";
import CharacterEditor from "./CharacterEditor";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import { btn } from "../shared/styles";

export default function CharacterManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [characters, setCharacters] = useState<RawCharacterData[]>([]);

  const loadFn = useCallback(async () => {
    const [defs, chars] = await Promise.all([fetchDefinitions(), fetchCharacterConfigs()]);
    setDefinitions(defs);
    setCharacters(chars);
  }, []);

  const { editingId, isNew, loading, handleEdit, handleNew, handleBack, loadData } = useManagerState({
    onEditingChange,
    loadFn,
  });

  const handleTogglePlayer = async (id: string, current: boolean) => {
    try {
      await patchCharacter(id, { isPlayer: !current });
      await loadData();
    } catch (e) {
      console.error("Failed to toggle player:", e);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await patchCharacter(id, { active: !current });
      await loadData();
    } catch (e) {
      console.error("Failed to toggle active:", e);
    }
  };

  if (loading || !definitions) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
  }

  // Editor view
  if (editingId !== null) {
    const existing = characters.find((c) => c.id === editingId);
    const template = definitions.template;
    const firstMapId = Object.keys(definitions.maps)[0] ?? "";

    const blank: RawCharacterData = {
      id: "",
      template: template.id,
      isPlayer: false,
      active: true,
      portrait: null,
      basicInfo: Object.fromEntries(template.basicInfo.map((f) => [f.key, f.defaultValue])),
      resources: Object.fromEntries(
        template.resources.map((f) => [f.key, { value: f.defaultValue, max: f.defaultMax }]),
      ),
      clothing: {},
      traits: Object.fromEntries(template.traits.map((f) => [f.key, []])),
      abilities: Object.fromEntries(template.abilities.map((f) => [f.key, f.defaultValue])),
      position: { mapId: firstMapId, cellId: 0 },
      restPosition: { mapId: firstMapId, cellId: 0 },
      source: selectedAddon ?? "",
    } as RawCharacterData;

    return (
      <CharacterEditor
        character={isNew ? blank : (existing ?? blank)}
        definitions={definitions}
        allCharacters={characters}
        isNew={isNew}
        onBack={handleBack}
        addonIds={addonIds}
      />
    );
  }

  const readOnly = isReadOnly(selectedAddon);
  const filteredCharacters = selectedAddon
    ? characters.filter((c) => (c as Record<string, unknown>)._source === selectedAddon)
    : characters;

  // List view
  return (
    <div
      style={{
        fontSize: "13px",
        color: T.text,
        padding: "12px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.charList")} ==</span>
        {!readOnly && (
          <button onClick={handleNew} style={btn("create", "md")}>
            [{t("btn.newChar")}]
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {filteredCharacters.map((char) => {
          const isActive = char.active !== false;
          return (
            <div
              key={char.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "7px 12px",
                backgroundColor: T.bg1,
                borderRadius: "4px",
                opacity: isActive ? 1 : 0.45,
              }}
            >
              {/* Name — click to edit */}
              <button
                onClick={() => handleEdit(char.id)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  color: T.text,
                  cursor: "pointer",
                  fontSize: "13px",
                  textAlign: "left",
                  padding: 0,
                }}
              >
                {char.basicInfo?.name || char.id}
              </button>

              {/* Right-side toggles */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                <ToggleSwitch
                  on={isActive}
                  onColor="#e89a19"
                  label={t("field.enabled")}
                  onClick={() => {
                    if (char.isPlayer && isActive) {
                      alert(t("msg.freezePlayerFirst"));
                      return;
                    }
                    handleToggleActive(char.id, isActive);
                  }}
                />
                <ToggleSwitch
                  on={char.isPlayer}
                  onColor="#22c55e"
                  label="Player"
                  onClick={() => handleTogglePlayer(char.id, char.isPlayer)}
                />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

/** Pill-shaped slide toggle, SVG-based. */
function ToggleSwitch({
  on,
  onColor,
  label,
  onClick,
}: {
  on: boolean;
  onColor: string;
  label: string;
  onClick: () => void;
}) {
  const w = 32;
  const h = 18;
  const r = h / 2 - 2;
  const cx = on ? w - h / 2 : h / 2;

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <svg width={w} height={h} style={{ display: "block" }}>
        {/* Track */}
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={(h - 2) / 2}
          ry={(h - 2) / 2}
          fill={on ? onColor : "transparent"}
          stroke={on ? onColor : T.borderLight}
          strokeWidth={1.5}
        />
        {/* Thumb */}
        <circle cx={cx} cy={h / 2} r={r} fill={on ? "#fff" : T.textSub} />
      </svg>
      <span style={{ fontSize: "11px", color: on ? "#ccc" : T.borderLight, userSelect: "none" }}>{label}</span>
    </div>
  );
}
