/**
 * OutcomeEditor — single outcome grade editor with effects, chain, and templates.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import { useState } from "react";
import type { ActionOutcome, ActionEffect, SuggestNext, EffectFilterDef } from "../../types/game";
import T from "../../theme";
import { t as t_ } from "../../i18n/ui";
import { EF, TargetType } from "../../constants";
import { useEditorContext } from "../shared/EditorContext";
import { inputStyle, addBtnStyle, delBtnStyle, listRowStyle } from "../shared/styles";
import { ModifierListEditor } from "./ModifierEditor";
import { EffectEditor } from "./EffectEditor";
import { TemplateListEditor } from "./TemplateEditor";

export interface OutcomeEditorProps {
  outcome: ActionOutcome;
  onChange: (o: ActionOutcome) => void;
  onRemove: () => void;
  disabled: boolean;
}

export function OutcomeEditor({ outcome, onChange, onRemove, disabled }: OutcomeEditorProps) {
  const { targetType, resourceKeys, mapList, npcList, actionList, categoryList } = useEditorContext();

  const [showChain, setShowChain] = useState((outcome.suggestNext ?? []).length > 0);
  const [showOutTpl, setShowOutTpl] = useState((outcome.outputTemplates ?? []).length > 0 || !!outcome.outputTemplate);

  const update = (patch: Partial<ActionOutcome>) => onChange({ ...outcome, ...patch });

  const removeEffect = (idx: number) => {
    update({ effects: outcome.effects.filter((_, i) => i !== idx) });
  };
  const updateEffect = (idx: number, eff: ActionEffect) => {
    const next = [...outcome.effects];
    next[idx] = eff;
    update({ effects: next });
  };

  // Group effects by target — serialize target for grouping key
  const targetKey = (t: ActionEffect["target"]): string => {
    if (!t || t === "self") return "self";
    if (typeof t === "string") return t;
    return JSON.stringify(t);
  };
  const targetLabel = (t: ActionEffect["target"]): string => {
    if (!t || t === "self") return t_("target.self");
    if (t === "{{targetId}}") return t_("target.target");
    if (typeof t === "object") return t_("target.filtered");
    return npcList.find((n) => n.id === t)?.name ?? t;
  };

  const targetGroups: { target: ActionEffect["target"]; key: string; label: string; indices: number[] }[] = [];
  const seenTargets: Record<string, number> = {};
  for (let i = 0; i < outcome.effects.length; i++) {
    const eff = outcome.effects[i];
    const t = eff.target ?? "self";
    const k = targetKey(t);
    if (k in seenTargets) {
      targetGroups[seenTargets[k]].indices.push(i);
    } else {
      seenTargets[k] = targetGroups.length;
      targetGroups.push({ target: t, key: k, label: targetLabel(t), indices: [i] });
    }
  }

  const addEffectForTarget = (targetVal: ActionEffect["target"]) => {
    update({
      effects: [
        ...outcome.effects,
        { type: EF.RESOURCE, key: resourceKeys[0]?.key, op: "add", value: 0, target: targetVal },
      ],
    });
  };

  const addTargetGroup = (type: "self" | "target" | "filter") => {
    if (type === "self") addEffectForTarget("self");
    else if (type === "target") addEffectForTarget("{{targetId}}");
    else addEffectForTarget({ filter: { cell: "current", excludeSelf: true } });
  };

  const targetColor = (t: ActionEffect["target"]) => {
    if (!t || t === "self") return "#6ec6ff";
    if (typeof t === "object") return "#cc66cc";
    return "#e9a045";
  };

  // Sub-section header helper
  const subHeader = (label: string, color: string, count: number | null, rightContent?: React.ReactNode) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "3px 0",
        marginBottom: "4px",
        borderBottom: `1px solid ${color}33`,
      }}
    >
      <span style={{ fontSize: "11px", fontWeight: "bold" }}>
        <span style={{ color, marginRight: "4px" }}>|</span>
        <span style={{ color: T.textSub }}>{label}</span>
        {count !== null && <span style={{ color: T.textDim, fontSize: "11px", marginLeft: "4px" }}>({count})</span>}
      </span>
      {rightContent}
    </div>
  );

  // Collapsible toggle header helper
  const toggleHeader = (
    label: string,
    color: string,
    isOpen: boolean,
    toggle: () => void,
    count: number,
    rightContent?: React.ReactNode,
  ) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "3px 0",
        cursor: "pointer",
        userSelect: "none",
        borderBottom: isOpen ? `1px solid ${color}33` : "none",
        marginBottom: isOpen ? "4px" : "0",
        opacity: isOpen || count > 0 ? 1 : 0.5,
      }}
      onClick={toggle}
    >
      <span style={{ fontSize: "11px", fontWeight: "bold" }}>
        <span style={{ color, marginRight: "4px" }}>{isOpen ? "\u25BC" : "\u25B6"}</span>
        <span style={{ color: T.textSub }}>{label}</span>
        {count > 0 && <span style={{ color: T.textDim, fontSize: "11px", marginLeft: "4px" }}>({count})</span>}
      </span>
      <div onClick={(e) => e.stopPropagation()}>{rightContent}</div>
    </div>
  );

  const chainCount = (outcome.suggestNext ?? []).length;
  const tplCount = (outcome.outputTemplates ?? (outcome.outputTemplate ? [{ text: outcome.outputTemplate }] : []))
    .length;

  return (
    <div
      style={{
        border: `1px solid ${T.borderLight}`,
        borderRadius: "3px",
        padding: "8px",
        marginBottom: "8px",
        backgroundColor: T.bg2,
      }}
    >
      {/* Outcome header: grade, label, weight */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          alignItems: "center",
          marginBottom: "8px",
          paddingBottom: "6px",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <input
          style={{ ...inputStyle, width: "80px" }}
          value={outcome.grade}
          onChange={(e) => update({ grade: e.target.value })}
          disabled={disabled}
          placeholder="grade"
        />
        <input
          style={{ ...inputStyle, width: "60px" }}
          value={outcome.label}
          onChange={(e) => update({ label: e.target.value })}
          disabled={disabled}
          placeholder={t_("outcome.label")}
        />
        <span style={{ color: T.textSub, fontSize: "11px" }}>{t_("label.weight")}</span>
        <input
          type="number"
          min={0}
          style={{ ...inputStyle, width: "50px" }}
          value={outcome.weight}
          onChange={(e) => update({ weight: Math.max(0, Number(e.target.value)) })}
          disabled={disabled}
        />
        {!disabled && (
          <button className="ae-del-btn" onClick={onRemove} style={{ ...delBtnStyle, marginLeft: "auto" }}>
            x
          </button>
        )}
      </div>

      {/* Weight modifiers */}
      <div
        style={{
          marginLeft: "8px",
          paddingLeft: "8px",
          borderLeft: "2px solid #333",
          backgroundColor: T.bg1,
          borderRadius: "0 3px 3px 0",
          marginBottom: "8px",
        }}
      >
        <ModifierListEditor
          modifiers={outcome.weightModifiers ?? []}
          onChange={(mods) => update({ weightModifiers: mods.length > 0 ? mods : undefined })}
          disabled={disabled}
          label={t_("outcome.weightMod")}
        />
      </div>

      {/* Effects grouped by target */}
      <div style={{ marginBottom: "8px" }}>
        {subHeader(
          t_("outcome.effects"),
          "#6ec6ff",
          outcome.effects.length,
          !disabled && (
            <div style={{ display: "flex", gap: "4px" }}>
              <button className="ae-add-btn" onClick={() => addTargetGroup("self")} style={addBtnStyle}>
                [+ {t_("target.self")}]
              </button>
              {targetType === TargetType.NPC && (
                <button className="ae-add-btn" onClick={() => addTargetGroup("target")} style={addBtnStyle}>
                  [+ {t_("target.target")}]
                </button>
              )}
              <button className="ae-add-btn" onClick={() => addTargetGroup("filter")} style={addBtnStyle}>
                [+ {t_("target.filtered")}]
              </button>
            </div>
          ),
        )}
        {targetGroups.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "11px", paddingLeft: "12px" }}>{t_("empty.noEffects")}</div>
        )}
        {targetGroups.map((group) => (
          <div
            key={group.key}
            style={{
              border: `1px solid ${targetColor(group.target)}33`,
              borderLeft: `3px solid ${targetColor(group.target)}`,
              borderRadius: "3px",
              padding: "4px 6px",
              marginBottom: "4px",
              backgroundColor: T.bg3,
            }}
          >
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }}>
              <span style={{ color: targetColor(group.target), fontSize: "11px", fontWeight: "bold" }}>
                {group.label}
              </span>
              {typeof group.target === "object" &&
                group.target?.filter &&
                (() => {
                  const f = group.target.filter;
                  const updateFilter = (patch: Partial<EffectFilterDef>) => {
                    const newFilter = { ...f, ...patch };
                    const newTarget = { filter: newFilter };
                    const next = [...outcome.effects];
                    for (const i of group.indices) {
                      next[i] = { ...next[i], target: newTarget };
                    }
                    update({ effects: next });
                  };
                  return (
                    <>
                      <select
                        style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                        value={f.cell === "current" ? "current" : typeof f.cell === "object" ? "specific" : "all"}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "current") updateFilter({ cell: "current" });
                          else if (v === "specific") updateFilter({ cell: { mapId: mapList[0]?.id ?? "", cellId: 0 } });
                          else updateFilter({ cell: undefined });
                        }}
                        disabled={disabled}
                      >
                        <option value="all">{t_("opt.allChars")}</option>
                        <option value="current">{t_("opt.currentLocation")}</option>
                        <option value="specific">{t_("opt.specificLocation")}</option>
                      </select>
                      {typeof f.cell === "object" && f.cell !== null && f.cell !== "current" && (
                        <>
                          <select
                            style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                            value={(f.cell as { mapId: string }).mapId ?? ""}
                            onChange={(e) => updateFilter({ cell: { mapId: e.target.value, cellId: 0 } })}
                            disabled={disabled}
                          >
                            {mapList.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <select
                            style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                            value={(f.cell as { cellId: number }).cellId ?? 0}
                            onChange={(e) =>
                              updateFilter({
                                cell: { mapId: (f.cell as { mapId: string }).mapId, cellId: Number(e.target.value) },
                              })
                            }
                            disabled={disabled}
                          >
                            {(mapList.find((m) => m.id === (f.cell as { mapId: string }).mapId)?.cells ?? []).map(
                              (c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name ? `${c.name} (${c.id})` : `${c.id}`}
                                </option>
                              ),
                            )}
                          </select>
                        </>
                      )}
                      <label
                        style={{
                          fontSize: "11px",
                          color: T.textSub,
                          display: "flex",
                          alignItems: "center",
                          gap: "2px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={f.excludeSelf ?? false}
                          onChange={(e) => updateFilter({ excludeSelf: e.target.checked || undefined })}
                          disabled={disabled}
                          style={{ accentColor: T.accent }}
                        />
                        {t_("ui.excludeSelf")}
                      </label>
                    </>
                  );
                })()}
              {!disabled && (
                <button
                  className="ae-add-btn"
                  onClick={() => addEffectForTarget(group.target)}
                  style={{ ...addBtnStyle, marginLeft: "auto" }}
                >
                  [+ {t_("btn.addEffect")}]
                </button>
              )}
            </div>
            {group.indices.map((effIdx, gi) => {
              const eff = outcome.effects[effIdx];
              const hasModifiers =
                eff.type === EF.RESOURCE ||
                eff.type === EF.ABILITY ||
                eff.type === EF.BASIC_INFO ||
                eff.type === EF.FAVORABILITY;
              return (
                <div key={effIdx} style={{ ...listRowStyle(gi, gi === group.indices.length - 1), marginTop: "2px" }}>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                    <EffectEditor
                      effect={eff}
                      onChange={(e) => updateEffect(effIdx, { ...e, target: group.target })}
                      disabled={disabled}
                    />
                    {!disabled && (
                      <button className="ae-del-btn" onClick={() => removeEffect(effIdx)} style={delBtnStyle}>
                        x
                      </button>
                    )}
                  </div>
                  {hasModifiers && (
                    <div
                      style={{
                        marginTop: "2px",
                        marginLeft: "12px",
                        paddingLeft: "8px",
                        borderLeft: "2px solid #333",
                        backgroundColor: T.bg1,
                        borderRadius: "0 3px 3px 0",
                      }}
                    >
                      <ModifierListEditor
                        modifiers={eff.valueModifiers ?? []}
                        onChange={(mods) =>
                          updateEffect(effIdx, {
                            ...eff,
                            target: group.target,
                            valueModifiers: mods.length > 0 ? mods : undefined,
                          })
                        }
                        disabled={disabled}
                        label={t_("outcome.valueMod")}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Action Chain (suggestNext) — collapsible */}
      <div style={{ marginBottom: "6px" }}>
        {toggleHeader(
          t_("outcome.actionChain"),
          "#e9a045",
          showChain,
          () => setShowChain(!showChain),
          chainCount,
          !disabled && showChain && (
            <button
              onClick={() =>
                update({
                  suggestNext: [
                    ...(outcome.suggestNext ?? []),
                    { actionId: actionList[0]?.id ?? "", bonus: 50, decay: 60 },
                  ],
                })
              }
              style={addBtnStyle}
            >
              [+]
            </button>
          ),
        )}
        {showChain && (
          <div style={{ paddingLeft: "12px" }}>
            {chainCount === 0 && (
              <div style={{ color: T.textDim, fontSize: "11px" }}>{t_("outcome.noChain")}</div>
            )}
            {(outcome.suggestNext ?? []).map((sn, snIdx) => {
              const mode = sn.category ? "category" : "action";
              const updateSn = (patch: Partial<SuggestNext>) => {
                const next = [...(outcome.suggestNext ?? [])];
                next[snIdx] = { ...next[snIdx], ...patch };
                update({ suggestNext: next });
              };
              return (
                <div
                  key={snIdx}
                  style={{
                    ...listRowStyle(snIdx, snIdx === (outcome.suggestNext ?? []).length - 1),
                    display: "flex",
                    gap: "4px",
                    alignItems: "center",
                    borderLeft: "2px solid #e9a04566",
                    borderRadius: "0 3px 3px 0",
                  }}
                >
                  <select
                    style={{
                      ...inputStyle,
                      width: "auto",
                      fontSize: "11px",
                      color: mode === "category" ? "#e9a045" : "#6ec6ff",
                    }}
                    value={mode}
                    onChange={(e) => {
                      if (e.target.value === "category") {
                        updateSn({ actionId: undefined, category: categoryList[0] ?? "" });
                      } else {
                        updateSn({ category: undefined, actionId: actionList[0]?.id ?? "" });
                      }
                    }}
                    disabled={disabled}
                    title={t_("outcome.matchMode")}
                  >
                    <option value="action">{t_("outcome.action")}</option>
                    <option value="category">{t_("opt.category")}</option>
                  </select>
                  {mode === "action" ? (
                    <select
                      style={{ ...inputStyle, flex: 1, fontSize: "11px" }}
                      value={sn.actionId ?? ""}
                      onChange={(e) => updateSn({ actionId: e.target.value })}
                      disabled={disabled}
                    >
                      <option value="">{t_("outcome.selectAction")}</option>
                      {actionList.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      style={{ ...inputStyle, flex: 1, fontSize: "11px" }}
                      value={sn.category ?? ""}
                      onChange={(e) => updateSn({ category: e.target.value })}
                      disabled={disabled}
                    >
                      <option value="">{t_("outcome.selectCategory")}</option>
                      {categoryList.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                  <span style={{ color: "#e9a045", fontSize: "11px", whiteSpace: "nowrap" }}>+</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "45px" }}
                    value={sn.bonus}
                    onChange={(e) => updateSn({ bonus: Number(e.target.value) })}
                    disabled={disabled}
                    title={t_("outcome.bonusWeight")}
                  />
                  <span style={{ color: T.textDim, fontSize: "11px", whiteSpace: "nowrap" }}>/</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "45px" }}
                    value={sn.decay}
                    step={5}
                    onChange={(e) => updateSn({ decay: Math.max(5, Math.ceil(Number(e.target.value) / 5) * 5) })}
                    disabled={disabled}
                    title={t_("outcome.decayTime")}
                  />
                  <span style={{ color: T.textDim, fontSize: "11px" }}>{t_("ui.minutes")}</span>
                  {!disabled && (
                    <button
                      className="ae-del-btn"
                      onClick={() => {
                        const next = (outcome.suggestNext ?? []).filter((_, i) => i !== snIdx);
                        update({ suggestNext: next.length > 0 ? next : undefined });
                      }}
                      style={delBtnStyle}
                    >
                      x
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Output templates — collapsible */}
      <div>
        {toggleHeader(t_("outcome.outputTpl"), "#7ecf7e", showOutTpl, () => setShowOutTpl(!showOutTpl), tplCount)}
        {showOutTpl && (
          <div style={{ paddingLeft: "12px" }}>
            <TemplateListEditor
              templates={outcome.outputTemplates ?? (outcome.outputTemplate ? [{ text: outcome.outputTemplate }] : [])}
              onChange={(tpls) =>
                update({ outputTemplates: tpls.length > 0 ? tpls : undefined, outputTemplate: undefined })
              }
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
