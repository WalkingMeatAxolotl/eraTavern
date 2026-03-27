import { useState, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import type { GameDefinitions, RawCharacterData } from "../../types/game";
import { saveCharacterConfig, createCharacter, deleteCharacter, uploadAsset } from "../../api/client";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { HelpButton, HelpPanel } from "../shared/HelpToggle";
import { RawJsonPanel } from "../shared/RawJsonEditor";
import CloneButton from "../shared/CloneDialog";
import s from "./CharacterEditor.module.css";

interface Props {
  character: RawCharacterData;
  definitions: GameDefinitions;
  allCharacters: RawCharacterData[];
  isNew: boolean;
  onBack: () => void;
  addonIds?: string[];
}

const GRADES = ["G", "F", "E", "D", "C", "B", "A", "S"];
function expToGrade(exp: number): string {
  const level = Math.min(Math.floor(exp / 1000), GRADES.length - 1);
  return GRADES[Math.max(0, level)];
}

type CharTab = "basic" | "outfit" | "traits" | "items" | "llm";

const TAB_LABELS: { key: CharTab; label: string }[] = [
  { key: "basic", label: t("charEdit.basic") },
  { key: "outfit", label: t("charEdit.outfit") },
  { key: "traits", label: t("charEdit.traits") },
  { key: "items", label: t("charEdit.items") },
  { key: "llm", label: "LLM" },
];

export default function CharacterEditor({ character, definitions, allCharacters, isNew, onBack, addonIds }: Props) {
  const [data, setData] = useState<RawCharacterData>(() => structuredClone(character));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingGroup, setPendingGroup] = useState<Record<string, string>>({});
  const [selectedOutfit, setSelectedOutfit] = useState<string>("default");
  const [tab, setTab] = useState<CharTab>("basic");
  const [showLlmHelp, setShowLlmHelp] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);

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
    const byCategory: Record<string, (typeof traitGroups)[string][]> = {};
    const t2g: Record<string, (typeof traitGroups)[string]> = {};
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const result = isNew ? await createCharacter(data) : await saveCharacterConfig(data.id, data);
      setMessage(result.message);
      if (result.success && isNew) onBack();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteChar", { name: data.id }))) return;
    setSaving(true);
    try {
      await deleteCharacter(data.id);
      onBack();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  };

  if (jsonMode) {
    return (
      <RawJsonPanel
        data={data as unknown as Record<string, unknown>}
        onSave={async (parsed) => {
          const result = isNew
            ? await createCharacter(parsed as unknown as RawCharacterData)
            : await saveCharacterConfig(data.id, parsed as unknown as RawCharacterData);
          if (result.success && isNew) onBack();
          return result;
        }}
        onToggle={() => setJsonMode(false)}
      />
    );
  }

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.title}>
          == {isNew ? t("editor.newChar") : t("editor.editNamed", { name: data.id })} ==
        </span>
        <button onClick={onBack} className={clsx(s.btn, s.btnNeutral)}>
          [{t("btn.back")}]
        </button>
      </div>

      {/* Tab bar */}
      <div className={s.tabBar}>
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(s.tab, tab === t.key && s.tabActive)}
          >
            [{t.label}]
          </button>
        ))}
      </div>

      {/* === Tab: 基本 === */}
      {tab === "basic" && (
        <>
          <Section title={t("section.basicSettings")}>
            <Row label="ID">
              <input
                value={data.id}
                onChange={(e) => updateField("id", e.target.value)}
                readOnly={!isNew}
                className={clsx(s.input, !isNew && s.inputReadonly)}
              />
            </Row>
            {template.basicInfo
              .filter((f) => f.type !== "number")
              .map((field) => (
                <Row key={field.key} label={field.label}>
                  <input
                    type="text"
                    value={data.basicInfo[field.key] ?? field.defaultValue}
                    onChange={(e) =>
                      updateField("basicInfo", { ...data.basicInfo, [field.key]: e.target.value })
                    }
                    className={s.input}
                  />
                </Row>
              ))}
            <Row label={t("field.portrait")}>
              <PortraitPicker
                portrait={data.portrait ?? null}
                characterId={data.id}
                onChange={(filename) => updateField("portrait", filename)}
              />
            </Row>
          </Section>

          <Section title={t("section.initialResources")} color="var(--sec-orange)">
            {template.basicInfo
              .filter((f) => f.type === "number")
              .map((field) => (
                <Row key={field.key} label={field.label}>
                  <input
                    type="number"
                    value={data.basicInfo[field.key] ?? field.defaultValue}
                    onChange={(e) =>
                      updateField("basicInfo", { ...data.basicInfo, [field.key]: Number(e.target.value) })
                    }
                    className={s.input}
                  />
                </Row>
              ))}
            {template.resources.map((field) => {
              const res = data.resources?.[field.key] ?? { value: field.defaultValue, max: field.defaultMax };
              return (
                <Row key={field.key} label={field.label}>
                  <div className={s.resInputRow}>
                    <input
                      type="number"
                      min={0}
                      value={res.value}
                      onChange={(e) =>
                        updateField("resources", {
                          ...data.resources,
                          [field.key]: { ...res, value: Math.max(0, Number(e.target.value)) },
                        })
                      }
                      className={clsx(s.input, s.w80)}
                    />
                    <span className={s.subText}>/</span>
                    <input
                      type="number"
                      min={0}
                      value={res.max}
                      onChange={(e) =>
                        updateField("resources", {
                          ...data.resources,
                          [field.key]: { ...res, max: Math.max(0, Number(e.target.value)) },
                        })
                      }
                      className={clsx(s.input, s.w80)}
                    />
                  </div>
                </Row>
              );
            })}
          </Section>

          <Section title={t("section.initialPosition")} color="var(--sec-purple)">
            <Row label={t("field.map")}>
              <select
                value={posMapId}
                onChange={(e) => {
                  const m = e.target.value;
                  updateField("position", { mapId: m, cellId: maps[m]?.cells[0]?.id ?? 0 });
                }}
                className={s.select}
              >
                {Object.entries(maps).map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.name} ({id})
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t("field.area")}>
              <select
                value={data.position.cellId}
                onChange={(e) => updateField("position", { mapId: posMapId, cellId: Number(e.target.value) })}
                className={s.select}
              >
                {mapCells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} (${c.id})` : `${c.id}`}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          <Section title={t("section.restPosition")} color="var(--sec-purple)">
            <Row label={t("field.map")}>
              <select
                value={restMapId}
                onChange={(e) => {
                  const m = e.target.value;
                  updateField("restPosition", { mapId: m, cellId: maps[m]?.cells[0]?.id ?? 0 });
                }}
                className={s.select}
              >
                {Object.entries(maps).map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.name} ({id})
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t("field.area")}>
              <select
                value={data.restPosition?.cellId ?? data.position.cellId}
                onChange={(e) => updateField("restPosition", { mapId: restMapId, cellId: Number(e.target.value) })}
                className={s.select}
              >
                {restMapCells.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} (${c.id})` : `${c.id}`}
                  </option>
                ))}
              </select>
            </Row>
          </Section>
        </>
      )}

      {/* === Tab: 服装 === */}
      {tab === "outfit" && (
        <Section title={t("section.outfitPresets")}>
          {(() => {
            const outfits: Record<string, Record<string, string[]>> = data.outfits &&
            Object.keys(data.outfits).length > 0
              ? data.outfits
              : (() => {
                  const def: Record<string, string[]> = {};
                  for (const [slot, info] of Object.entries(data.clothing)) {
                    if (info?.itemId) def[slot] = [info.itemId];
                  }
                  return { default: def };
                })();
            const outfitTypeDefs = definitions.outfitTypes ?? [];
            const outfitTypeIds = ["default", ...outfitTypeDefs.map((t) => t.id)];
            const outfitNameMap: Record<string, string> = { default: t("label.defaultOutfit") };
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
                <div className={s.outfitBtnRow}>
                  {outfitTypeIds.map((id) => (
                    <button
                      key={id}
                      onClick={() => setSelectedOutfit(id)}
                      className={clsx(s.outfitBtn, activeKey === id && s.outfitBtnActive)}
                    >
                      {outfitNameMap[id] ?? id}
                    </button>
                  ))}
                </div>

                {activeKey !== "default" && (
                  <div className={s.outfitStatusRow}>
                    {hasCustom ? (
                      <>
                        <span className={s.outfitStatusLabel}>{t("ui.customized")}</span>
                        <button
                          className={clsx(s.outfitStatusBtn, s.btnDanger)}
                          onClick={() => {
                            const next = { ...outfits };
                            delete next[activeKey];
                            updateOutfits(next);
                          }}
                        >
                          [{t("btn.restoreInherit")}]
                        </button>
                      </>
                    ) : (
                      <>
                        <span className={s.outfitStatusLabel}>{t("ui.inherited")}</span>
                        <button
                          className={clsx(s.outfitStatusBtn, s.btnAccent)}
                          onClick={() => {
                            const typeDef = outfitTypeDefs.find((t) => t.id === activeKey);
                            const source = typeDef?.copyDefault
                              ? structuredClone(outfits["default"] ?? {})
                              : structuredClone(typeDef?.slots ?? {});
                            updateOutfits({ ...outfits, [activeKey]: source });
                          }}
                        >
                          [{t("btn.customize")}]
                        </button>
                      </>
                    )}
                  </div>
                )}

                {template.clothingSlots.map((slot) => {
                  const items = outfit[slot] ?? [];
                  const options = clothingBySlot[slot] ?? [];
                  const editable = hasCustom || activeKey === "default";
                  return (
                    <div key={slot}>
                      <div className={s.slotRow}>
                        <span className={s.slotLabel}>{SLOT_LABELS[slot] ?? slot}:</span>
                        {items.length === 0 && <span className={s.slotEmpty}>{t("empty.slot")}</span>}
                        {items.map((itemId, i) => {
                          const def = clothingDefs[itemId];
                          return (
                            <span key={i} className={s.slotItem}>
                              [{def?.name ?? itemId}]
                              {editable && (
                                <button
                                  className={clsx(s.btnInline, s.btnRemoveItem)}
                                  onClick={() => {
                                    const newItems = items.filter((_, j) => j !== i);
                                    updateOutfits({ ...outfits, [activeKey]: { ...outfit, [slot]: newItems } });
                                  }}
                                >
                                  x
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {editable && (
                          <select
                            className={s.select}
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              updateOutfits({
                                ...outfits,
                                [activeKey]: { ...outfit, [slot]: [...items, e.target.value] },
                              });
                            }}
                          >
                            <option value="">{t("btn.addClothingItem")}</option>
                            {options
                              .filter((c) => !items.includes(c.id))
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
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
          <Section title={t("section.initialTraits")}>
            {template.traits.filter((f) => f.key !== "ability" && f.key !== "experience").length === 0 && (
              <div className={s.dimText}>{t("empty.noTraitCats")}</div>
            )}
            {template.traits
              .filter((f) => f.key !== "ability" && f.key !== "experience")
              .map((field) => {
                const ids = data.traits[field.key] ?? [];
                const catGroups = groupsByCategory[field.key] ?? [];
                const groupsNotFullySelected = catGroups.filter((g) => {
                  const isExclusive = g.exclusive !== false;
                  return isExclusive
                    ? !g.traits.some((tid) => ids.includes(tid))
                    : g.traits.some((tid) => !ids.includes(tid));
                });
                const ungroupedAvailable = (traitsByCategory[field.key] ?? []).filter(
                  (t) => !traitToGroup[t.id] && !ids.includes(t.id),
                );
                const curPendingGroupId = pendingGroup[field.key];
                const curPendingGroupDef = curPendingGroupId
                  ? catGroups.find((g) => g.id === curPendingGroupId)
                  : undefined;

                return (
                  <Row key={field.key} label={field.label}>
                    <div className={s.traitList}>
                      {ids.map((tid) => {
                        const def = traitDefs[tid];
                        return (
                          <span key={tid} className={s.traitChip}>
                            {def?.name ?? tid}
                            <button
                              onClick={() => {
                                const nt = { ...data.traits };
                                nt[field.key] = ids.filter((x) => x !== tid);
                                updateField("traits", nt);
                              }}
                              className={s.btnRemoveChip}
                            >
                              x
                            </button>
                          </span>
                        );
                      })}
                      {(groupsNotFullySelected.length > 0 || ungroupedAvailable.length > 0) && (
                        <select
                          value={curPendingGroupId ? `group:${curPendingGroupId}` : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              setPendingGroup((p) => {
                                const n = { ...p };
                                delete n[field.key];
                                return n;
                              });
                              return;
                            }
                            if (val.startsWith("group:")) {
                              setPendingGroup((p) => ({ ...p, [field.key]: val.slice(6) }));
                            } else {
                              const nt = { ...data.traits };
                              nt[field.key] = [...ids, val];
                              updateField("traits", nt);
                              setPendingGroup((p) => {
                                const n = { ...p };
                                delete n[field.key];
                                return n;
                              });
                            }
                          }}
                          className={s.select}
                        >
                          <option value="">+</option>
                          {groupsNotFullySelected.map((g) => (
                            <option key={`group:${g.id}`} value={`group:${g.id}`}>
                              {g.name}
                            </option>
                          ))}
                          {ungroupedAvailable.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {curPendingGroupDef && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const nt = { ...data.traits };
                            const isExclusive = curPendingGroupDef.exclusive !== false;
                            const catIds = isExclusive
                              ? ids.filter((x) => !curPendingGroupDef.traits.includes(x))
                              : [...ids];
                            if (!catIds.includes(e.target.value)) catIds.push(e.target.value);
                            nt[field.key] = catIds;
                            updateField("traits", nt);
                            setPendingGroup((p) => {
                              const n = { ...p };
                              delete n[field.key];
                              return n;
                            });
                          }}
                          className={s.select}
                        >
                          <option value="">{t("opt.selectEllipsis")}</option>
                          {curPendingGroupDef.traits
                            .filter((tid) => curPendingGroupDef.exclusive !== false || !ids.includes(tid))
                            .map((tid) => {
                              const def = traitDefs[tid];
                              return (
                                <option key={tid} value={tid}>
                                  {def?.name ?? tid}
                                </option>
                              );
                            })}
                        </select>
                      )}
                    </div>
                  </Row>
                );
              })}
          </Section>

          <Section title={t("section.initialAbility")} color="var(--sec-orange)">
            {(template.abilities ?? []).length === 0 ? (
              <div className={s.dimText}>{t("empty.noAbilityDefs")}</div>
            ) : (
              <div className={s.grid}>
                {template.abilities.map((field) => {
                  const exp = data.abilities[field.key] ?? field.defaultValue;
                  return (
                    <div key={field.key} className={s.gridItem}>
                      <span className={s.gridLabel}>{field.label}:</span>
                      <input
                        type="number"
                        min={0}
                        value={exp}
                        onChange={(e) =>
                          updateField("abilities", {
                            ...data.abilities,
                            [field.key]: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className={clsx(s.input, s.w70)}
                      />
                      <span className={s.subText}>{expToGrade(exp)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title={t("section.initialExp")} color="var(--sec-orange)">
            {(template.experiences ?? []).length > 0 ? (
              <div className={s.grid}>
                {(template.experiences ?? []).map((field: { key: string; label: string }) => {
                  const expData = data.experiences?.[field.key];
                  const count = expData?.count ?? 0;
                  return (
                    <div key={field.key} className={s.gridItem}>
                      <span className={s.gridLabel}>{field.label}:</span>
                      <input
                        type="number"
                        min={0}
                        value={count}
                        onChange={(e) => {
                          const nc = Math.max(0, Number(e.target.value));
                          const ne = { ...(data.experiences ?? {}) };
                          const ex = ne[field.key] ?? {};
                          ne[field.key] = {
                            ...ex,
                            count: nc,
                            first:
                              nc > 0 ? (ex.first ?? { event: t("ui.unknown"), location: t("ui.unknown"), target: t("ui.unknown") }) : undefined,
                          };
                          updateField("experiences", ne);
                        }}
                        className={clsx(s.input, s.w70)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={s.dimText}>{t("empty.noExpDefs")}</div>
            )}
          </Section>
        </>
      )}

      {/* === Tab: 物品 === */}
      {tab === "items" && (
        <>
          <Section title={t("section.initialInventory")}>
            {(data.inventory ?? []).map((entry, idx) => {
              const def = itemDefs[entry.itemId];
              const itemName = def?.name ?? entry.itemId;
              return (
                <div key={idx} className={s.inlineRow}>
                  <span className={s.inlineLabel}>{itemName}:</span>
                  <input
                    type="number"
                    value={entry.amount}
                    min={1}
                    max={def?.maxStack ?? 99}
                    onChange={(e) => {
                      const ni = [...(data.inventory ?? [])];
                      ni[idx] = { ...entry, amount: Math.max(1, Number(e.target.value)) };
                      updateField("inventory", ni);
                    }}
                    className={clsx(s.input, s.w60)}
                  />
                  <button
                    onClick={() =>
                      updateField(
                        "inventory",
                        (data.inventory ?? []).filter((_, i) => i !== idx),
                      )
                    }
                    className={s.btnInline}
                  >
                    [x]
                  </button>
                </div>
              );
            })}
            {(() => {
              const existingIds = (data.inventory ?? []).map((e) => e.itemId);
              const available = Object.values(itemDefs).filter((d) => !existingIds.includes(d.id));
              if (available.length === 0) return null;
              return (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    updateField("inventory", [...(data.inventory ?? []), { itemId: e.target.value, amount: 1 }]);
                  }}
                  className={s.select}
                >
                  <option value="">{t("btn.addItem")}</option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              );
            })()}
            {Object.keys(itemDefs).length === 0 && (
              <div className={s.dimText}>{t("empty.noItemDefs")}</div>
            )}
          </Section>

          <Section title={t("section.initialFav")} color="var(--sec-red)">
            {Object.entries(data.favorability ?? {}).map(([targetId, val]) => {
              const tc = allCharacters.find((c) => c.id === targetId);
              const tn = tc ? String(tc.basicInfo?.name || targetId) : targetId;
              return (
                <div key={targetId} className={s.inlineRow}>
                  <span className={s.inlineLabel}>{tn}:</span>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) =>
                      updateField("favorability", { ...data.favorability, [targetId]: Number(e.target.value) })
                    }
                    className={clsx(s.input, s.w60)}
                  />
                  <button
                    onClick={() => {
                      const nf = { ...(data.favorability ?? {}) };
                      delete nf[targetId];
                      updateField("favorability", nf);
                    }}
                    className={s.btnInline}
                  >
                    [x]
                  </button>
                </div>
              );
            })}
            {(() => {
              const existing = Object.keys(data.favorability ?? {});
              const available = allCharacters.filter((c) => c.id !== data.id && !existing.includes(c.id));
              if (available.length === 0) return null;
              return (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    updateField("favorability", { ...data.favorability, [e.target.value]: 0 });
                  }}
                  className={s.select}
                >
                  <option value="">{t("btn.addFav")}</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {String(c.basicInfo?.name || c.id)}
                    </option>
                  ))}
                </select>
              );
            })()}
            {!allCharacters.some((c) => c.id !== data.id) && (
              <div className={s.dimText}>{t("empty.noOtherChars")}</div>
            )}
          </Section>
        </>
      )}

      {/* === Tab: LLM === */}
      {tab === "llm" && (
        <SectionWithHelp
          title={t("section.llmDesc")}
          color="var(--sec-green)"
          showHelp={showLlmHelp}
          onToggleHelp={() => setShowLlmHelp((v) => !v)}
          helpContent={t("help.llmDesc")}
        >
          {Object.entries(data.llm ?? {}).map(([key, val]) => (
            <div key={key} className={s.llmFieldRow}>
              <div className={s.llmKeyRow}>
                <input
                  value={key}
                  onChange={(e) => {
                    const nk = e.target.value;
                    if (!nk || nk === key) return;
                    const llm = { ...(data.llm ?? {}) };
                    const v = llm[key];
                    delete llm[key];
                    llm[nk] = v;
                    updateField("llm", llm);
                  }}
                  placeholder={t("ph.fieldName")}
                  className={clsx(s.input, s.w120)}
                />
                <button
                  onClick={() => {
                    const llm = { ...(data.llm ?? {}) };
                    delete llm[key];
                    updateField("llm", llm);
                  }}
                  className={s.btnInline}
                >
                  [x]
                </button>
              </div>
              <textarea
                value={val}
                onChange={(e) => updateField("llm", { ...(data.llm ?? {}), [key]: e.target.value })}
                className={s.textarea}
              />
            </div>
          ))}
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              updateField("llm", { ...(data.llm ?? {}), [e.target.value]: "" });
            }}
            className={clsx(s.select, s.wAuto)}
          >
            <option value="">{t("btn.addField")}</option>
            {["personality", "appearance", "speech", "background"]
              .filter((k) => !(data.llm ?? {})[k])
              .map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            <option value={`custom-${Date.now()}`}>{t("ui.custom")}</option>
          </select>
        </SectionWithHelp>
      )}

      {/* Action bar */}
      <div className={s.actionBar}>
        <button onClick={handleSave} disabled={saving} className={clsx(s.btn, s.btnSuccess)}>
          [{saving ? t("status.submitting") : t("btn.confirm")}]
        </button>
        {!isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={data.source || ""}
            entityType="characters"
            sourceId={data.id}
            onSuccess={onBack}
            className={clsx(s.btn, s.btnAccent)}
          />
        )}
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} className={clsx(s.btn, s.btnDanger)}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} className={clsx(s.btn, s.btnNeutral)}>
          [{t("btn.back")}]
        </button>
        <button onClick={() => setJsonMode(true)} className={clsx(s.btn, s.btnNeutral)}>
          [JSON]
        </button>
        {message && (
          <span
            className={message.includes("fail") || message.includes("not found") ? s.msgError : s.msgSuccess}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Helper components ---

function Section({ title, color = "var(--sec-blue)", children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div className={s.section} style={{ "--sec-color": color } as React.CSSProperties}>
      <div className={s.sectionTitle}>
        <span className={s.sectionTitleText}>{title}</span>
      </div>
      <div className={s.sectionContent}>{children}</div>
    </div>
  );
}

function SectionWithHelp({
  title,
  color = "var(--sec-blue)",
  showHelp,
  onToggleHelp,
  helpContent,
  children,
}: {
  title: string;
  color?: string;
  showHelp: boolean;
  onToggleHelp: () => void;
  helpContent: string;
  children: React.ReactNode;
}) {
  return (
    <div className={s.section} style={{ "--sec-color": color } as React.CSSProperties}>
      <div className={s.sectionTitle}>
        <span className={s.sectionTitleText}>{title}</span>
        <HelpButton show={showHelp} onToggle={onToggleHelp} />
      </div>
      <div className={s.sectionContent}>
        {showHelp && (
          <HelpPanel>
            <div className={s.fs11}>{helpContent}</div>
          </HelpPanel>
        )}
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}:</span>
      {children}
    </div>
  );
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
  const [cacheBust, setCacheBust] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const addonId = characterId.includes(".") ? characterId.split(".")[0] : undefined;
    const result = await uploadAsset(file, "characters", characterId, { addonId });
    if (result.success && result.filename) {
      onChange(result.filename);
      setCacheBust((n) => n + 1);
    }
    e.target.value = "";
  };

  return (
    <div className={s.portraitRow}>
      {portrait && (
        <img
          src={`/assets/characters/${portrait}?t=${cacheBust}`}
          alt=""
          className={s.portraitImg}
        />
      )}
      <span className={s.portraitName}>{portrait ?? t("ui.none")}</span>
      <button onClick={() => fileRef.current?.click()} className={clsx(s.btn, s.btnAccent)}>
        [{t("btn.selectImage")}]
      </button>
      {portrait && (
        <button onClick={() => onChange(null)} className={clsx(s.btn, s.btnDanger)}>
          [{t("btn.clear")}]
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
