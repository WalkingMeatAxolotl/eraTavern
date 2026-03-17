import { useState, useMemo, useRef, useEffect } from "react";
import type { GameDefinitions, RawCharacterData } from "../types/game";
import { saveCharacterConfig, createCharacter, deleteCharacter, uploadAsset } from "../api/client";
import T from "../theme";
import { HelpButton, HelpPanel } from "./HelpToggle";

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
  mainHand: "主手",
  offHand: "副手",
  back: "背部",
  accessory1: "装饰品1",
  accessory2: "装饰品2",
  accessory3: "装饰品3",
};

const GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"];
function expToGrade(exp: number): string {
  const level = Math.min(Math.floor(exp / 1000), GRADES.length - 1);
  return GRADES[Math.max(0, level)];
}

type CharTab = "basic" | "outfit" | "traits" | "items" | "llm";

const TAB_LABELS: { key: CharTab; label: string }[] = [
  { key: "basic", label: "基本" },
  { key: "outfit", label: "服装" },
  { key: "traits", label: "特质" },
  { key: "items", label: "物品" },
  { key: "llm", label: "LLM" },
];

export default function CharacterEditor({ character, definitions, allCharacters, isNew, onBack }: Props) {
  const [data, setData] = useState<RawCharacterData>(() => structuredClone(character));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingGroup, setPendingGroup] = useState<Record<string, string>>({});
  const [selectedOutfit, setSelectedOutfit] = useState<string>("default");
  const [tab, setTab] = useState<CharTab>("basic");
  const [showLlmHelp, setShowLlmHelp] = useState(false);

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

  // Group clothing by slot
  const clothingBySlot = useMemo(() => {
    const grouped: Record<string, { id: string; name: string }[]> = {};
    for (const c of Object.values(clothingDefs)) {
      const cslots = c.slots ?? (c.slot ? [c.slot] : []);
      for (const s of cslots) {
        if (!grouped[s]) grouped[s] = [];
        grouped[s].push({ id: c.id, name: c.name });
      }
    }
    const accessoryItems = grouped["accessory"] ?? [];
    for (const slot of ["accessory1", "accessory2", "accessory3"]) {
      grouped[slot] = [...(grouped[slot] ?? []), ...accessoryItems];
    }
    return grouped;
  }, [clothingDefs]);

  // Fix invalid position
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
  const mapCells = useMemo(() => maps[posMapId]?.cells ?? [], [maps, posMapId]);
  const restMapId = data.restPosition?.mapId ?? data.position.mapId;
  const restMapCells = useMemo(() => maps[restMapId]?.cells ?? [], [maps, restMapId]);

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
      if (result.success && isNew) onBack();
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
    <div style={{ fontSize: "13px", color: T.text, backgroundColor: T.bg2, padding: "12px", borderRadius: "4px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建角色" : `编辑: ${data.id}`} ==
        </span>
        <button onClick={onBack} style={btnStyle(T.textSub)}>[返回列表]</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "4px 14px",
              backgroundColor: tab === t.key ? T.bg3 : "transparent",
              color: tab === t.key ? T.accent : T.textSub,
              border: tab === t.key ? `1px solid ${T.border}` : "1px solid transparent",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: tab === t.key ? "bold" : "normal",
            }}
          >
            [{t.label}]
          </button>
        ))}
      </div>

      {/* === Tab: 基本 === */}
      {tab === "basic" && (
        <>
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

          <Section title="初始资源">
            {template.resources.map((field) => {
              const res = data.resources?.[field.key] ?? { value: field.defaultValue, max: field.defaultMax };
              return (
                <Row key={field.key} label={field.label}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input type="number" min={0} value={res.value}
                      onChange={(e) => updateField("resources", { ...data.resources, [field.key]: { ...res, value: Math.max(0, Number(e.target.value)) } })}
                      style={{ ...inputStyle(), width: "80px" }}
                    />
                    <span style={{ color: T.textSub }}>/</span>
                    <input type="number" min={0} value={res.max}
                      onChange={(e) => updateField("resources", { ...data.resources, [field.key]: { ...res, max: Math.max(0, Number(e.target.value)) } })}
                      style={{ ...inputStyle(), width: "80px" }}
                    />
                  </div>
                </Row>
              );
            })}
          </Section>

          <Section title="初始位置">
            <Row label="地图">
              <select value={posMapId} onChange={(e) => { const m = e.target.value; updateField("position", { mapId: m, cellId: maps[m]?.cells[0]?.id ?? 0 }); }} style={selectStyle()}>
                {Object.entries(maps).map(([id, m]) => <option key={id} value={id}>{m.name} ({id})</option>)}
              </select>
            </Row>
            <Row label="区域">
              <select value={data.position.cellId} onChange={(e) => updateField("position", { mapId: posMapId, cellId: Number(e.target.value) })} style={selectStyle()}>
                {mapCells.map((c) => <option key={c.id} value={c.id}>{c.name ? `${c.name} (${c.id})` : `${c.id}`}</option>)}
              </select>
            </Row>
          </Section>

          <Section title="休息位置">
            <Row label="地图">
              <select value={restMapId} onChange={(e) => { const m = e.target.value; updateField("restPosition", { mapId: m, cellId: maps[m]?.cells[0]?.id ?? 0 }); }} style={selectStyle()}>
                {Object.entries(maps).map(([id, m]) => <option key={id} value={id}>{m.name} ({id})</option>)}
              </select>
            </Row>
            <Row label="区域">
              <select value={data.restPosition?.cellId ?? data.position.cellId} onChange={(e) => updateField("restPosition", { mapId: restMapId, cellId: Number(e.target.value) })} style={selectStyle()}>
                {restMapCells.map((c) => <option key={c.id} value={c.id}>{c.name ? `${c.name} (${c.id})` : `${c.id}`}</option>)}
              </select>
            </Row>
          </Section>
        </>
      )}

      {/* === Tab: 服装 === */}
      {tab === "outfit" && (
        <Section title="服装预设">
          {(() => {
            const outfits: Record<string, Record<string, string[]>> = data.outfits && Object.keys(data.outfits).length > 0
              ? data.outfits
              : (() => {
                const def: Record<string, string[]> = {};
                for (const [slot, info] of Object.entries(data.clothing)) {
                  if (info?.itemId) def[slot] = [info.itemId];
                }
                return { "default": def };
              })();
            const outfitTypeDefs = definitions.outfitTypes ?? [];
            const outfitTypeIds = ["default", ...outfitTypeDefs.map((t) => t.id)];
            const outfitNameMap: Record<string, string> = { "default": "默认服装" };
            for (const t of outfitTypeDefs) outfitNameMap[t.id] = t.name;
            const activeKey = outfitTypeIds.includes(selectedOutfit) ? selectedOutfit : "default";
            const hasCustom = !!outfits[activeKey];
            const resolvedOutfit = (() => {
              if (outfits[activeKey]) return outfits[activeKey];
              if (activeKey === "default") return {};
              const typeDef = outfitTypeDefs.find((t) => t.id === activeKey);
              if (typeDef?.copyDefault) return outfits["default"] ?? {};
              return typeDef?.slots ?? {};
            })();
            const outfit = resolvedOutfit;

            const updateOutfits = (newOutfits: Record<string, Record<string, string[]>>) => {
              updateField("outfits", newOutfits);
              const def = newOutfits["default"];
              if (def) {
                const newClothing: Record<string, { itemId: string; state: "worn" | "halfWorn" | "off" }> = {};
                for (const [slot, items] of Object.entries(def)) {
                  if (items.length > 0) newClothing[slot] = { itemId: items[0], state: "worn" };
                }
                updateField("clothing", newClothing);
              }
            };

            return (
              <>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px", alignItems: "center" }}>
                  {outfitTypeIds.map((id) => (
                    <button key={id} onClick={() => setSelectedOutfit(id)}
                      style={{ ...btnStyle(activeKey === id ? T.accent : T.textSub), fontWeight: activeKey === id ? "bold" : "normal", borderColor: activeKey === id ? T.accent : T.border, minWidth: "60px", textAlign: "center" }}>
                      {outfitNameMap[id] ?? id}
                    </button>
                  ))}
                </div>

                {activeKey !== "default" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    {hasCustom
                      ? <>
                          <span style={{ color: T.textDim, fontSize: "12px" }}>已自定义</span>
                          <button style={{ ...btnStyle(T.danger), fontSize: "12px", padding: "2px 8px" }} onClick={() => { const next = { ...outfits }; delete next[activeKey]; updateOutfits(next); }}>[恢复继承]</button>
                        </>
                      : <>
                          <span style={{ color: T.textDim, fontSize: "12px" }}>继承中</span>
                          <button style={{ ...btnStyle(T.accent), fontSize: "12px", padding: "2px 8px" }} onClick={() => {
                            const typeDef = outfitTypeDefs.find((t) => t.id === activeKey);
                            const source = typeDef?.copyDefault ? structuredClone(outfits["default"] ?? {}) : structuredClone(typeDef?.slots ?? {});
                            updateOutfits({ ...outfits, [activeKey]: source });
                          }}>[自定义]</button>
                        </>
                    }
                  </div>
                )}

                {template.clothingSlots.map((slot) => {
                  const items = outfit[slot] ?? [];
                  const options = clothingBySlot[slot] ?? [];
                  const editable = hasCustom || activeKey === "default";
                  return (
                    <div key={slot}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minHeight: "26px" }}>
                        <span style={{ minWidth: "100px", color: T.textSub }}>{SLOT_LABELS[slot] ?? slot}:</span>
                        {items.length === 0 && <span style={{ color: T.textDim }}>(空)</span>}
                        {items.map((itemId, i) => {
                          const def = clothingDefs[itemId];
                          return (
                            <span key={i} style={{ color: T.text, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                              [{def?.name ?? itemId}]
                              {editable && (
                                <button style={{ ...btnStyle(T.danger), padding: "0 4px", fontSize: "11px", lineHeight: "1" }}
                                  onClick={() => { const newItems = items.filter((_, j) => j !== i); updateOutfits({ ...outfits, [activeKey]: { ...outfit, [slot]: newItems } }); }}>x</button>
                              )}
                            </span>
                          );
                        })}
                        {editable && (
                          <select style={selectStyle()} value="" onChange={(e) => {
                            if (!e.target.value) return;
                            updateOutfits({ ...outfits, [activeKey]: { ...outfit, [slot]: [...items, e.target.value] } });
                          }}>
                            <option value="">+添加</option>
                            {options.filter((c) => !items.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </Section>
      )}

      {/* === Tab: 特质 === */}
      {tab === "traits" && (
        <>
          <Section title="初始特质">
            {template.traits.filter((f) => f.key !== "ability" && f.key !== "experience").length === 0 && (
              <div style={{ color: T.textDim, fontSize: "12px" }}>无特质类别定义</div>
            )}
            {template.traits.filter((f) => f.key !== "ability" && f.key !== "experience").map((field) => {
              const ids = data.traits[field.key] ?? [];
              const catGroups = groupsByCategory[field.key] ?? [];
              const groupsNotFullySelected = catGroups.filter((g) => {
                const isExclusive = g.exclusive !== false;
                return isExclusive ? !g.traits.some((tid) => ids.includes(tid)) : g.traits.some((tid) => !ids.includes(tid));
              });
              const ungroupedAvailable = (traitsByCategory[field.key] ?? []).filter((t) => !traitToGroup[t.id] && !ids.includes(t.id));
              const curPendingGroupId = pendingGroup[field.key];
              const curPendingGroupDef = curPendingGroupId ? catGroups.find((g) => g.id === curPendingGroupId) : undefined;

              return (
                <Row key={field.key} label={field.label}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                    {ids.map((tid) => {
                      const def = traitDefs[tid];
                      return (
                        <span key={tid} style={{ display: "inline-flex", alignItems: "center", gap: "2px", padding: "1px 6px", backgroundColor: T.bg2, border: `1px solid ${T.borderLight}`, borderRadius: "3px", fontSize: "12px" }}>
                          {def?.name ?? tid}
                          <button onClick={() => { const nt = { ...data.traits }; nt[field.key] = ids.filter((x) => x !== tid); updateField("traits", nt); }}
                            style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: "0 2px", fontSize: "12px", lineHeight: 1 }}>x</button>
                        </span>
                      );
                    })}
                    {(groupsNotFullySelected.length > 0 || ungroupedAvailable.length > 0) && (
                      <select value={curPendingGroupId ? `group:${curPendingGroupId}` : ""} onChange={(e) => {
                        const val = e.target.value;
                        if (!val) { setPendingGroup((p) => { const n = { ...p }; delete n[field.key]; return n; }); return; }
                        if (val.startsWith("group:")) { setPendingGroup((p) => ({ ...p, [field.key]: val.slice(6) })); }
                        else { const nt = { ...data.traits }; nt[field.key] = [...ids, val]; updateField("traits", nt); setPendingGroup((p) => { const n = { ...p }; delete n[field.key]; return n; }); }
                      }} style={selectStyle()}>
                        <option value="">+</option>
                        {groupsNotFullySelected.map((g) => <option key={`group:${g.id}`} value={`group:${g.id}`}>{g.name}</option>)}
                        {ungroupedAvailable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    {curPendingGroupDef && (
                      <select value="" onChange={(e) => {
                        if (!e.target.value) return;
                        const nt = { ...data.traits };
                        const isExclusive = curPendingGroupDef.exclusive !== false;
                        let catIds = isExclusive ? ids.filter((x) => !curPendingGroupDef.traits.includes(x)) : [...ids];
                        if (!catIds.includes(e.target.value)) catIds.push(e.target.value);
                        nt[field.key] = catIds;
                        updateField("traits", nt);
                        setPendingGroup((p) => { const n = { ...p }; delete n[field.key]; return n; });
                      }} style={selectStyle()}>
                        <option value="">选择...</option>
                        {curPendingGroupDef.traits.filter((tid) => curPendingGroupDef.exclusive !== false || !ids.includes(tid)).map((tid) => {
                          const def = traitDefs[tid];
                          return <option key={tid} value={tid}>{def?.name ?? tid}</option>;
                        })}
                      </select>
                    )}
                  </div>
                </Row>
              );
            })}
          </Section>

          <Section title="初始能力">
            {(template.abilities ?? []).length === 0 ? (
              <div style={{ color: T.textDim, fontSize: "12px" }}>无能力定义 (在属性页面添加「能力」类别的特质)</div>
            ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px 12px" }}>
              {template.abilities.map((field) => {
                const exp = data.abilities[field.key] ?? field.defaultValue;
                return (
                  <div key={field.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ minWidth: "80px" }}>{field.label}:</span>
                    <input type="number" min={0} value={exp}
                      onChange={(e) => updateField("abilities", { ...data.abilities, [field.key]: Math.max(0, Number(e.target.value)) })}
                      style={{ ...inputStyle(), width: "70px" }} />
                    <span style={{ color: T.textSub }}>{expToGrade(exp)}</span>
                  </div>
                );
              })}
            </div>
            )}
          </Section>

          <Section title="初始经验">
            {(template.experiences ?? []).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px 12px" }}>
                {(template.experiences ?? []).map((field: { key: string; label: string }) => {
                  const expData = data.experiences?.[field.key];
                  const count = expData?.count ?? 0;
                  return (
                    <div key={field.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ minWidth: "80px" }}>{field.label}:</span>
                      <input type="number" min={0} value={count}
                        onChange={(e) => {
                          const nc = Math.max(0, Number(e.target.value));
                          const ne = { ...(data.experiences ?? {}) };
                          const ex = ne[field.key] ?? {};
                          ne[field.key] = { ...ex, count: nc, first: nc > 0 ? (ex.first ?? { event: "未知", location: "未知", target: "未知" }) : undefined };
                          updateField("experiences", ne);
                        }}
                        style={{ ...inputStyle(), width: "70px" }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: T.textDim, fontSize: "12px" }}>无经验定义 (在属性页面添加「经验」类别)</div>
            )}
          </Section>
        </>
      )}

      {/* === Tab: 物品 === */}
      {tab === "items" && (
        <>
          <Section title="初始物品栏">
            {(data.inventory ?? []).map((entry, idx) => {
              const def = itemDefs[entry.itemId];
              const itemName = def?.name ?? entry.itemId;
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ minWidth: "80px", color: T.textSub }}>{itemName}:</span>
                  <input type="number" value={entry.amount} min={1} max={def?.maxStack ?? 99}
                    onChange={(e) => { const ni = [...(data.inventory ?? [])]; ni[idx] = { ...entry, amount: Math.max(1, Number(e.target.value)) }; updateField("inventory", ni); }}
                    style={{ ...inputStyle(), width: "60px" }} />
                  <button onClick={() => updateField("inventory", (data.inventory ?? []).filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: "12px" }}>[x]</button>
                </div>
              );
            })}
            {(() => {
              const existingIds = (data.inventory ?? []).map((e) => e.itemId);
              const available = Object.values(itemDefs).filter((d) => !existingIds.includes(d.id));
              if (available.length === 0) return null;
              return (
                <select value="" onChange={(e) => {
                  if (!e.target.value) return;
                  updateField("inventory", [...(data.inventory ?? []), { itemId: e.target.value, amount: 1 }]);
                }} style={selectStyle()}>
                  <option value="">+ 添加物品</option>
                  {available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              );
            })()}
            {Object.keys(itemDefs).length === 0 && (
              <div style={{ color: T.textDim, fontSize: "12px" }}>无可用物品定义 (在物品页面添加)</div>
            )}
          </Section>

          <Section title="初始好感度">
            {Object.entries(data.favorability ?? {}).map(([targetId, val]) => {
              const tc = allCharacters.find((c) => c.id === targetId);
              const tn = tc ? String(tc.basicInfo?.name || targetId) : targetId;
              return (
                <div key={targetId} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ minWidth: "80px", color: T.textSub }}>{tn}:</span>
                  <input type="number" value={val}
                    onChange={(e) => updateField("favorability", { ...data.favorability, [targetId]: Number(e.target.value) })}
                    style={{ ...inputStyle(), width: "60px" }} />
                  <button onClick={() => { const nf = { ...(data.favorability ?? {}) }; delete nf[targetId]; updateField("favorability", nf); }}
                    style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: "12px" }}>[x]</button>
                </div>
              );
            })}
            {(() => {
              const existing = Object.keys(data.favorability ?? {});
              const available = allCharacters.filter((c) => c.id !== data.id && !existing.includes(c.id));
              if (available.length === 0) return null;
              return (
                <select value="" onChange={(e) => { if (!e.target.value) return; updateField("favorability", { ...data.favorability, [e.target.value]: 0 }); }} style={selectStyle()}>
                  <option value="">+ 添加好感度</option>
                  {available.map((c) => <option key={c.id} value={c.id}>{String(c.basicInfo?.name || c.id)}</option>)}
                </select>
              );
            })()}
            {!allCharacters.some((c) => c.id !== data.id) && (
              <div style={{ color: T.textDim, fontSize: "12px" }}>无其他角色</div>
            )}
          </Section>
        </>
      )}

      {/* === Tab: LLM === */}
      {tab === "llm" && (
        <SectionWithHelp
          title="LLM 描述"
          showHelp={showLlmHelp}
          onToggleHelp={() => setShowLlmHelp((v) => !v)}
          helpContent="不参与游戏逻辑，仅供 LLM 生成叙事时使用。用 {{player.llm.字段名}} 或 {{target.llm.字段名}} 在提示词中引用。"
        >
          {Object.entries(data.llm ?? {}).map(([key, val]) => (
            <div key={key} style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                <input value={key} onChange={(e) => {
                  const nk = e.target.value;
                  if (!nk || nk === key) return;
                  const llm = { ...(data.llm ?? {}) };
                  const v = llm[key]; delete llm[key]; llm[nk] = v;
                  updateField("llm", llm);
                }} placeholder="字段名" style={{ ...inputStyle(), width: "120px", fontSize: "12px" }} />
                <button onClick={() => { const llm = { ...(data.llm ?? {}) }; delete llm[key]; updateField("llm", llm); }}
                  style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: "12px" }}>[x]</button>
              </div>
              <textarea value={val} onChange={(e) => updateField("llm", { ...(data.llm ?? {}), [key]: e.target.value })}
                style={{ ...inputStyle(), width: "100%", minHeight: "50px", resize: "vertical", fontSize: "12px", boxSizing: "border-box" }} />
            </div>
          ))}
          <select value="" onChange={(e) => { if (!e.target.value) return; updateField("llm", { ...(data.llm ?? {}), [e.target.value]: "" }); }}
            style={{ ...inputStyle(), width: "auto", fontSize: "12px" }}>
            <option value="">+ 添加字段</option>
            {["personality", "appearance", "speech", "background"].filter((k) => !(data.llm ?? {})[k]).map((k) => <option key={k} value={k}>{k}</option>)}
            <option value={`custom-${Date.now()}`}>自定义...</option>
          </select>
        </SectionWithHelp>
      )}

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", borderTop: `1px solid ${T.border}`, paddingTop: "12px" }}>
        <button onClick={handleSave} disabled={saving} style={btnStyle(T.successDim)}>
          [{saving ? "提交中..." : "确定"}]
        </button>
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle(T.danger)}>[删除]</button>
        )}
        <button onClick={onBack} style={btnStyle(T.textSub)}>[返回列表]</button>
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
      <div style={{ color: T.accent, borderBottom: `1px solid ${T.border}`, marginBottom: "6px", paddingBottom: "2px", fontWeight: "bold" }}>
        == {title} ==
      </div>
      {children}
    </div>
  );
}

function SectionWithHelp({ title, showHelp, onToggleHelp, helpContent, children }: {
  title: string;
  showHelp: boolean;
  onToggleHelp: () => void;
  helpContent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ color: T.accent, borderBottom: `1px solid ${T.border}`, marginBottom: "6px", paddingBottom: "2px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
        == {title} ==
        <HelpButton show={showHelp} onToggle={onToggleHelp} />
      </div>
      {showHelp && (
        <HelpPanel>
          <div style={{ fontSize: "11px" }}>{helpContent}</div>
        </HelpPanel>
      )}
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
    fontSize: "13px",
  };
}

function PortraitPicker({
  portrait, characterId, onChange,
}: {
  portrait: string | null;
  characterId: string;
  onChange: (filename: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cacheBust, setCacheBust] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const addonId = characterId.includes(".") ? characterId.split(".")[0] : undefined;
    const result = await uploadAsset(file, "characters", characterId, { addonId });
    if (result.success && result.filename) {
      onChange(result.filename);
      setCacheBust(n => n + 1);
    }
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {portrait && (
        <img src={`/assets/characters/${portrait}?t=${cacheBust}`} alt=""
          style={{ height: "40px", width: "40px", objectFit: "cover", borderRadius: "3px", border: `1px solid ${T.border}` }} />
      )}
      <span style={{ fontSize: "12px", color: T.textSub, minWidth: "60px" }}>{portrait ?? "无"}</span>
      <button onClick={() => fileRef.current?.click()} style={btnStyle(T.accent)}>[选择图片]</button>
      {portrait && <button onClick={() => onChange(null)} style={btnStyle(T.danger)}>[清除]</button>}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
