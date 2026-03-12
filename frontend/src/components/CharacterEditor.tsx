import { useState, useMemo, useRef, useEffect } from "react";
import type { GameDefinitions, RawCharacterData } from "../types/game";
import { saveCharacterConfig, createCharacter, deleteCharacter, uploadAsset } from "../api/client";
import T from "../theme";

interface Props {
  character: RawCharacterData;
  definitions: GameDefinitions;
  allCharacters: RawCharacterData[];
  isNew: boolean;
  onBack: () => void;
}

const SLOT_LABELS: Record<string, string> = {
  hat: "帽子",
  upperBody: "上半身",
  upperUnderwear: "上半身内衣",
  lowerBody: "下半身",
  lowerUnderwear: "下半身内衣",
  hands: "手",
  feet: "脚",
  shoes: "鞋子",
  accessory1: "装饰品1",
  accessory2: "装饰品2",
  accessory3: "装饰品3",
};

const GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"];
function expToGrade(exp: number): string {
  const level = Math.min(Math.floor(exp / 1000), GRADES.length - 1);
  return GRADES[Math.max(0, level)];
}

export default function CharacterEditor({ character, definitions, allCharacters, isNew, onBack }: Props) {
  const [data, setData] = useState<RawCharacterData>(() => structuredClone(character));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Tracks which trait group is pending selection per category (first dropdown picked a group)
  const [pendingGroup, setPendingGroup] = useState<Record<string, string>>({});

  const { template, clothingDefs, itemDefs, traitDefs, traitGroups, maps } = definitions;

  // Group traits by category
  const traitsByCategory = useMemo(() => {
    const grouped: Record<string, { id: string; name: string }[]> = {};
    for (const t of Object.values(traitDefs)) {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push({ id: t.id, name: t.name });
    }
    return grouped;
  }, [traitDefs]);

  // Trait groups by category + lookup: traitId -> group
  const { groupsByCategory, traitToGroup } = useMemo(() => {
    const byCategory: Record<string, typeof traitGroups[string][]> = {};
    const t2g: Record<string, typeof traitGroups[string]> = {};
    for (const g of Object.values(traitGroups)) {
      if (!byCategory[g.category]) byCategory[g.category] = [];
      byCategory[g.category].push(g);
      for (const tid of g.traits) t2g[tid] = g;
    }
    return { groupsByCategory: byCategory, traitToGroup: t2g };
  }, [traitGroups]);

  // Group clothing by slot — accessory1/2/3 share items from "accessory" slot
  const clothingBySlot = useMemo(() => {
    const grouped: Record<string, { id: string; name: string }[]> = {};
    for (const c of Object.values(clothingDefs)) {
      if (!grouped[c.slot]) grouped[c.slot] = [];
      grouped[c.slot].push({ id: c.id, name: c.name });
    }
    // Share "accessory" items across accessory1/2/3
    const accessoryItems = grouped["accessory"] ?? [];
    for (const slot of ["accessory1", "accessory2", "accessory3"]) {
      grouped[slot] = [...(grouped[slot] ?? []), ...accessoryItems];
    }
    return grouped;
  }, [clothingDefs]);

  // If position mapId doesn't exist, fix data to first available map
  const mapIds = Object.keys(maps);
  useEffect(() => {
    if (mapIds.length === 0) return;
    let changed = false;
    const updates: Partial<RawCharacterData> = {};
    if (!maps[data.position.mapId]) {
      const fallbackMap = mapIds[0];
      const fallbackCell = maps[fallbackMap]?.cells[0]?.id ?? 0;
      updates.position = { mapId: fallbackMap, cellId: fallbackCell };
      changed = true;
    }
    const rMapId = data.restPosition?.mapId ?? data.position.mapId;
    if (!maps[rMapId]) {
      const fallbackMap = updates.position?.mapId ?? mapIds[0];
      const fallbackCell = maps[fallbackMap]?.cells[0]?.id ?? 0;
      updates.restPosition = { mapId: fallbackMap, cellId: fallbackCell };
      changed = true;
    }
    if (changed) setData((prev) => ({ ...prev, ...updates }));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const posMapId = data.position.mapId;
  const mapCells = useMemo(() => {
    return maps[posMapId]?.cells ?? [];
  }, [maps, posMapId]);

  const restMapId = data.restPosition?.mapId ?? data.position.mapId;
  const restMapCells = useMemo(() => {
    return maps[restMapId]?.cells ?? [];
  }, [maps, restMapId]);

  const updateField = <K extends keyof RawCharacterData>(key: K, val: RawCharacterData[K]) => {
    setData((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = isNew
        ? await createCharacter(data)
        : await saveCharacterConfig(data.id, data);
      setMessage(result.message);
      if (result.success && isNew) {
        // After creating, switch to edit mode
        onBack();
      }
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定删除角色 "${data.id}" ？`)) return;
    setSaving(true);
    try {
      await deleteCharacter(data.id);
      onBack();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: T.text,
        backgroundColor: T.bg2,
        padding: "12px",
        borderRadius: "4px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建角色" : `编辑: ${data.id}`} ==
        </span>
        <button onClick={onBack} style={btnStyle(T.textSub)}>
          [返回列表]
        </button>
      </div>

      {/* Basic settings */}
      <Section title="基本设置">
        <Row label="ID">
          <input
            value={data.id}
            onChange={(e) => updateField("id", e.target.value)}
            readOnly={!isNew}
            style={inputStyle(isNew ? undefined : T.textDim)}
          />
        </Row>
        <Row label="立绘">
          <PortraitPicker
            portrait={data.portrait ?? null}
            characterId={data.id}
            onChange={(filename) => updateField("portrait", filename)}
          />
        </Row>
      </Section>

      {/* Basic info */}
      <Section title="基本信息">
        {template.basicInfo.map((field) => (
          <Row key={field.key} label={field.label}>
            <input
              type={field.type === "number" ? "number" : "text"}
              value={data.basicInfo[field.key] ?? field.defaultValue}
              onChange={(e) => {
                const val = field.type === "number" ? Number(e.target.value) : e.target.value;
                updateField("basicInfo", { ...data.basicInfo, [field.key]: val });
              }}
              style={inputStyle()}
            />
          </Row>
        ))}
      </Section>

      {/* Resources */}
      <Section title="初始资源">
        {template.resources.map((field) => {
          const res = data.resources?.[field.key] ?? { value: field.defaultValue, max: field.defaultMax };
          return (
            <Row key={field.key} label={field.label}>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="number"
                  value={res.value}
                  onChange={(e) => {
                    updateField("resources", {
                      ...data.resources,
                      [field.key]: { ...res, value: Number(e.target.value) },
                    });
                  }}
                  style={{ ...inputStyle(), width: "80px" }}
                />
                <span style={{ color: T.textSub }}>/</span>
                <input
                  type="number"
                  value={res.max}
                  onChange={(e) => {
                    updateField("resources", {
                      ...data.resources,
                      [field.key]: { ...res, max: Number(e.target.value) },
                    });
                  }}
                  style={{ ...inputStyle(), width: "80px" }}
                />
              </div>
            </Row>
          );
        })}
      </Section>

      {/* Clothing */}
      <Section title="初始服装">
        {template.clothingSlots.map((slot) => {
          const equipped = data.clothing[slot];
          const options = clothingBySlot[slot] ?? [];
          return (
            <Row key={slot} label={SLOT_LABELS[slot] ?? slot}>
              <select
                value={equipped?.itemId ?? ""}
                onChange={(e) => {
                  const newClothing = { ...data.clothing };
                  if (e.target.value) {
                    newClothing[slot] = { itemId: e.target.value, state: "worn" };
                  } else {
                    delete newClothing[slot];
                  }
                  updateField("clothing", newClothing);
                }}
                style={selectStyle()}
              >
                <option value="">无</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Row>
          );
        })}
      </Section>

      {/* Traits */}
      <Section title="初始特质">
        {template.traits.filter((f) => f.key !== "ability" && f.key !== "experience").map((field) => {
          const ids = data.traits[field.key] ?? [];
          const catGroups = groupsByCategory[field.key] ?? [];

          // Build dropdown options: trait groups (whose member is not yet selected) + ungrouped traits not yet selected
          const groupsNotFullySelected = catGroups.filter(
            (g) => !g.traits.some((tid) => ids.includes(tid))
          );
          const ungroupedAvailable = (traitsByCategory[field.key] ?? [])
            .filter((t) => !traitToGroup[t.id] && !ids.includes(t.id));

          const curPendingGroupId = pendingGroup[field.key];
          const curPendingGroupDef = curPendingGroupId
            ? catGroups.find((g) => g.id === curPendingGroupId)
            : undefined;

          return (
            <Row key={field.key} label={field.label}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                {/* Selected traits as tags */}
                {ids.map((tid) => {
                  const def = traitDefs[tid];
                  return (
                    <span
                      key={tid}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                        padding: "1px 6px",
                        backgroundColor: T.bg2,
                        border: `1px solid ${T.borderLight}`,
                        borderRadius: "3px",
                        fontSize: "12px",
                      }}
                    >
                      {def?.name ?? tid}
                      <button
                        onClick={() => {
                          const newTraits = { ...data.traits };
                          newTraits[field.key] = ids.filter((x) => x !== tid);
                          updateField("traits", newTraits);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: T.danger,
                          cursor: "pointer",
                          padding: "0 2px",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          lineHeight: 1,
                        }}
                      >
                        x
                      </button>
                    </span>
                  );
                })}

                {/* First dropdown: trait groups + ungrouped traits */}
                {(groupsNotFullySelected.length > 0 || ungroupedAvailable.length > 0) && (
                  <select
                    value={curPendingGroupId ? `group:${curPendingGroupId}` : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setPendingGroup((prev) => { const next = { ...prev }; delete next[field.key]; return next; });
                        return;
                      }
                      if (val.startsWith("group:")) {
                        // Selected a trait group — show second dropdown
                        setPendingGroup((prev) => ({ ...prev, [field.key]: val.slice(6) }));
                      } else {
                        // Selected an ungrouped trait — add directly
                        const newTraits = { ...data.traits };
                        newTraits[field.key] = [...ids, val];
                        updateField("traits", newTraits);
                        setPendingGroup((prev) => { const next = { ...prev }; delete next[field.key]; return next; });
                      }
                    }}
                    style={selectStyle()}
                  >
                    <option value="">+</option>
                    {groupsNotFullySelected.map((g) => (
                      <option key={`group:${g.id}`} value={`group:${g.id}`}>{g.name}</option>
                    ))}
                    {ungroupedAvailable.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}

                {/* Second dropdown: member traits of selected group */}
                {curPendingGroupDef && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const newTraits = { ...data.traits };
                      // Remove any existing trait from this group, add new one
                      let catIds = ids.filter((x) => !curPendingGroupDef.traits.includes(x));
                      catIds.push(e.target.value);
                      newTraits[field.key] = catIds;
                      updateField("traits", newTraits);
                      setPendingGroup((prev) => { const next = { ...prev }; delete next[field.key]; return next; });
                    }}
                    style={selectStyle()}
                  >
                    <option value="">选择...</option>
                    {curPendingGroupDef.traits.map((tid) => {
                      const def = traitDefs[tid];
                      return (
                        <option key={tid} value={tid}>{def?.name ?? tid}</option>
                      );
                    })}
                  </select>
                )}
              </div>
            </Row>
          );
        })}
      </Section>

      {/* Abilities */}
      <Section title="初始能力">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px 12px" }}>
          {template.abilities.map((field) => {
            const exp = data.abilities[field.key] ?? field.defaultValue;
            return (
              <div key={field.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ minWidth: "80px" }}>{field.label}:</span>
                <input
                  type="number"
                  value={exp}
                  onChange={(e) => {
                    updateField("abilities", { ...data.abilities, [field.key]: Number(e.target.value) });
                  }}
                  style={{ ...inputStyle(), width: "70px" }}
                />
                <span style={{ color: T.textSub }}>{expToGrade(exp)}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Experiences */}
      <Section title="初始经验">
        {(template.experiences ?? []).length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px 12px" }}>
            {(template.experiences ?? []).map((field: { key: string; label: string }) => {
              const expData = data.experiences?.[field.key];
              const count = expData?.count ?? 0;
              return (
                <div key={field.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ minWidth: "80px" }}>{field.label}:</span>
                  <input
                    type="number"
                    value={count}
                    onChange={(e) => {
                      const newCount = Math.max(0, Number(e.target.value));
                      const newExps = { ...(data.experiences ?? {}) };
                      const existing = newExps[field.key] ?? {};
                      newExps[field.key] = {
                        ...existing,
                        count: newCount,
                        // count > 0: set placeholder first; count = 0: clear first
                        first: newCount > 0
                          ? (existing.first ?? { event: "未知", location: "未知", target: "未知" })
                          : undefined,
                      };
                      updateField("experiences", newExps);
                    }}
                    style={{ ...inputStyle(), width: "70px" }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: T.textDim, fontSize: "12px" }}>无经验定义 (在属性页面添加「经验」类别)</div>
        )}
      </Section>

      {/* Inventory */}
      <Section title="初始物品栏">
        {(data.inventory ?? []).map((entry, idx) => {
          const def = itemDefs[entry.itemId];
          return (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <select
                value={entry.itemId}
                onChange={(e) => {
                  const newInv = [...(data.inventory ?? [])];
                  newInv[idx] = { ...entry, itemId: e.target.value };
                  updateField("inventory", newInv);
                }}
                style={selectStyle()}
              >
                <option value="">选择物品...</option>
                {Object.values(itemDefs).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <span style={{ color: T.textSub, fontSize: "11px" }}>x</span>
              <input
                type="number"
                value={entry.amount}
                min={1}
                max={def?.maxStack ?? 99}
                onChange={(e) => {
                  const newInv = [...(data.inventory ?? [])];
                  newInv[idx] = { ...entry, amount: Math.max(1, Number(e.target.value)) };
                  updateField("inventory", newInv);
                }}
                style={{ ...inputStyle(), width: "50px" }}
              />
              <button
                onClick={() => {
                  const newInv = (data.inventory ?? []).filter((_, i) => i !== idx);
                  updateField("inventory", newInv);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: T.danger,
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  padding: "0 4px",
                }}
              >
                x
              </button>
            </div>
          );
        })}
        <button
          onClick={() => {
            const firstItem = Object.keys(itemDefs)[0] ?? "";
            updateField("inventory", [...(data.inventory ?? []), { itemId: firstItem, amount: 1 }]);
          }}
          disabled={Object.keys(itemDefs).length === 0}
          style={btnStyle(T.successDim)}
        >
          [+ 添加物品]
        </button>
        {Object.keys(itemDefs).length === 0 && (
          <span style={{ color: T.textDim, fontSize: "12px", marginLeft: "8px" }}>无可用物品定义</span>
        )}
      </Section>

      {/* Initial Position */}
      <Section title="初始位置">
        <Row label="地图">
          <select
            value={posMapId}
            onChange={(e) => {
              const newMap = e.target.value;
              const firstCell = maps[newMap]?.cells[0]?.id ?? 0;
              updateField("position", { mapId: newMap, cellId: firstCell });
            }}
            style={selectStyle()}
          >
            {Object.entries(maps).map(([id, m]) => (
              <option key={id} value={id}>{m.name} ({id})</option>
            ))}
          </select>
        </Row>
        <Row label="区域">
          <select
            value={data.position.cellId}
            onChange={(e) => {
              updateField("position", { mapId: posMapId, cellId: Number(e.target.value) });
            }}
            style={selectStyle()}
          >
            {mapCells.map((cell) => (
              <option key={cell.id} value={cell.id}>
                {cell.name ? `${cell.name} (${cell.id})` : `${cell.id}`}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      {/* Rest Position */}
      <Section title="休息位置">
        <Row label="地图">
          <select
            value={restMapId}
            onChange={(e) => {
              const newMap = e.target.value;
              const firstCell = maps[newMap]?.cells[0]?.id ?? 0;
              updateField("restPosition", { mapId: newMap, cellId: firstCell });
            }}
            style={selectStyle()}
          >
            {Object.entries(maps).map(([id, m]) => (
              <option key={id} value={id}>{m.name} ({id})</option>
            ))}
          </select>
        </Row>
        <Row label="区域">
          <select
            value={data.restPosition?.cellId ?? data.position.cellId}
            onChange={(e) => {
              updateField("restPosition", {
                mapId: restMapId,
                cellId: Number(e.target.value),
              });
            }}
            style={selectStyle()}
          >
            {restMapCells.map((cell) => (
              <option key={cell.id} value={cell.id}>
                {cell.name ? `${cell.name} (${cell.id})` : `${cell.id}`}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      {/* Favorability */}
      <Section title="初始好感度">
        {Object.entries(data.favorability ?? {}).map(([targetId, val]) => {
          const targetChar = allCharacters.find((c) => c.id === targetId);
          const targetName = targetChar ? String(targetChar.basicInfo?.name || targetId) : targetId;
          return (
            <div key={targetId} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <span style={{ minWidth: "80px", color: T.textSub }}>{targetName}:</span>
              <input
                type="number"
                value={val}
                onChange={(e) => {
                  updateField("favorability", {
                    ...data.favorability,
                    [targetId]: Number(e.target.value),
                  });
                }}
                style={{ ...inputStyle(), width: "80px" }}
              />
              <button
                onClick={() => {
                  const newFav = { ...(data.favorability ?? {}) };
                  delete newFav[targetId];
                  updateField("favorability", newFav);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: T.danger,
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  padding: "0 4px",
                }}
              >
                x
              </button>
            </div>
          );
        })}
        {(() => {
          const existingIds = Object.keys(data.favorability ?? {});
          const available = allCharacters.filter((c) => c.id !== data.id && !existingIds.includes(c.id));
          if (available.length === 0) return null;
          return (
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                updateField("favorability", {
                  ...data.favorability,
                  [e.target.value]: 0,
                });
              }}
              style={selectStyle()}
            >
              <option value="">+ 添加好感度</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>{String(c.basicInfo?.name || c.id)}</option>
              ))}
            </select>
          );
        })()}
        {Object.keys(data.favorability ?? {}).length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", marginBottom: "4px" }}>未设置 (默认 0)</div>
        )}
      </Section>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", borderTop: `1px solid ${T.border}`, paddingTop: "12px" }}>
        <button onClick={handleSave} disabled={saving} style={btnStyle(T.successDim)}>
          [{saving ? "保存中..." : "保存"}]
        </button>
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle(T.danger)}>
            [删除]
          </button>
        )}
        <button onClick={onBack} style={btnStyle(T.textSub)}>
          [返回列表]
        </button>
        {message && (
          <span style={{ color: message.includes("fail") || message.includes("not found") ? T.danger : T.success, marginLeft: "8px", alignSelf: "center" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Helper components & styles ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "12px" }}>
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
      <span style={{ minWidth: "100px", color: T.textSub }}>{label}:</span>
      {children}
    </div>
  );
}

function inputStyle(color?: string): React.CSSProperties {
  return {
    backgroundColor: T.bg2,
    color: color ?? T.text,
    border: `1px solid ${T.borderLight}`,
    borderRadius: "3px",
    padding: "3px 6px",
    fontFamily: "monospace",
    fontSize: "13px",
    outline: "none",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    backgroundColor: T.bg2,
    color: T.text,
    border: `1px solid ${T.borderLight}`,
    borderRadius: "3px",
    padding: "3px 6px",
    fontFamily: "monospace",
    fontSize: "13px",
    outline: "none",
    cursor: "pointer",
  };
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "4px 12px",
    backgroundColor: "transparent",
    color,
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "13px",
  };
}

function PortraitPicker({
  portrait,
  characterId,
  onChange,
}: {
  portrait: string | null;
  characterId: string;
  onChange: (filename: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadAsset(file, "characters", characterId);
    if (result.success && result.filename) {
      onChange(result.filename);
    }
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {portrait && (
        <img
          src={`/assets/characters/${portrait}?t=${Date.now()}`}
          alt=""
          style={{ height: "40px", width: "40px", objectFit: "cover", borderRadius: "3px", border: `1px solid ${T.border}` }}
        />
      )}
      <span style={{ fontSize: "12px", color: T.textSub, minWidth: "60px" }}>
        {portrait ?? "无"}
      </span>
      <button onClick={() => fileRef.current?.click()} style={btnStyle(T.accent)}>
        [选择图片]
      </button>
      {portrait && (
        <button onClick={() => onChange(null)} style={btnStyle(T.danger)}>
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
