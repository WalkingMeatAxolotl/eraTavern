import { useEffect, useState, useCallback } from "react";
import type { GameDefinitions, RawCharacterData } from "../types/game";
import { fetchDefinitions, fetchCharacterConfigs, patchCharacter } from "../api/client";
import CharacterEditor from "./CharacterEditor";

export default function CharacterManager() {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [characters, setCharacters] = useState<RawCharacterData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const loadData = useCallback(async () => {
    const [defs, chars] = await Promise.all([
      fetchDefinitions(),
      fetchCharacterConfigs(),
    ]);
    setDefinitions(defs);
    setCharacters(chars);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = (id: string) => {
    setIsNew(false);
    setEditingId(id);
  };

  const handleNew = () => {
    setIsNew(true);
    setEditingId("__new__");
  };

  const handleBack = () => {
    setEditingId(null);
    setIsNew(false);
    loadData();
  };

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

  if (!definitions) {
    return (
      <div style={{ color: "#666", fontFamily: "monospace", padding: "20px", textAlign: "center" }}>
        加载中...
      </div>
    );
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
      basicInfo: Object.fromEntries(
        template.basicInfo.map((f) => [f.key, f.defaultValue])
      ),
      resources: Object.fromEntries(
        template.resources.map((f) => [f.key, { value: f.defaultValue, max: f.defaultMax }])
      ),
      clothing: {},
      traits: Object.fromEntries(
        template.traits.map((f) => [f.key, []])
      ),
      abilities: Object.fromEntries(
        template.abilities.map((f) => [f.key, f.defaultValue])
      ),
      position: { mapId: firstMapId, cellId: 0 },
      restPosition: { mapId: firstMapId, cellId: 0 },
    };

    return (
      <CharacterEditor
        character={isNew ? blank : (existing ?? blank)}
        definitions={definitions}
        allCharacters={characters}
        isNew={isNew}
        onBack={handleBack}
      />
    );
  }

  // List view
  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ddd",
        padding: "12px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: "#e94560", fontWeight: "bold", fontSize: "14px" }}>
          == 角色列表 ==
        </span>
        <button
          onClick={handleNew}
          style={{
            padding: "4px 12px",
            backgroundColor: "#16213e",
            color: "#0f0",
            border: "1px solid #333",
            borderRadius: "3px",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        >
          [+ 新建角色]
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {characters.map((char) => {
          const isActive = char.active !== false;
          return (
            <div
              key={char.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "7px 12px",
                backgroundColor: "#1a1a2e",
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
                  color: "#ddd",
                  cursor: "pointer",
                  fontFamily: "monospace",
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
                  label="启用"
                  onClick={() => handleToggleActive(char.id, isActive)}
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
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <svg width={w} height={h} style={{ display: "block" }}>
        {/* Track */}
        <rect
          x={1} y={1}
          width={w - 2} height={h - 2}
          rx={(h - 2) / 2} ry={(h - 2) / 2}
          fill={on ? onColor : "transparent"}
          stroke={on ? onColor : "#555"}
          strokeWidth={1.5}
        />
        {/* Thumb */}
        <circle
          cx={cx} cy={h / 2} r={r}
          fill={on ? "#fff" : "#888"}
        />
      </svg>
      <span style={{ fontSize: "11px", color: on ? "#ccc" : "#555", userSelect: "none" }}>
        {label}
      </span>
    </div>
  );
}
