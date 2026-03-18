/**
 * OutcomeEditor — single outcome grade editor with effects, chain, and templates.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import { useState } from "react";
import type { ActionOutcome, ActionEffect, SuggestNext, EffectFilterDef } from "../../types/game";
import T from "../../theme";
import { useEditorContext } from "../shared/EditorContext";
import { inputStyle, addBtnStyle, delBtnStyle, listRowStyle } from "../shared/ConditionEditor";
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
    if (!t || t === "self") return "执行者";
    if (t === "{{targetId}}") return "目标角色";
    if (typeof t === "object") return "过滤目标";
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
        { type: "resource", key: resourceKeys[0]?.key, op: "add", value: 0, target: targetVal },
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
          placeholder="标签"
        />
        <span style={{ color: T.textSub, fontSize: "11px" }}>权重:</span>
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
          label="↳ 权重修正"
        />
      </div>

      {/* Effects grouped by target */}
      <div style={{ marginBottom: "8px" }}>
        {subHeader(
          "效果",
          "#6ec6ff",
          outcome.effects.length,
          !disabled && (
            <div style={{ display: "flex", gap: "4px" }}>
              <button className="ae-add-btn" onClick={() => addTargetGroup("self")} style={addBtnStyle}>
                [+ 执行者]
              </button>
              {targetType === "npc" && (
                <button className="ae-add-btn" onClick={() => addTargetGroup("target")} style={addBtnStyle}>
                  [+ 目标角色]
                </button>
              )}
              <button className="ae-add-btn" onClick={() => addTargetGroup("filter")} style={addBtnStyle}>
                [+ 过滤]
              </button>
            </div>
          ),
        )}
        {targetGroups.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "11px", paddingLeft: "12px" }}>无效果</div>
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
                        <option value="all">全部角色</option>
                        <option value="current">当前地点</option>
                        <option value="specific">指定地点</option>
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
                        排除执行者
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
                  [+ 效果]
                </button>
              )}
            </div>
            {group.indices.map((effIdx, gi) => {
              const eff = outcome.effects[effIdx];
              const hasModifiers =
                eff.type === "resource" ||
                eff.type === "ability" ||
                eff.type === "basicInfo" ||
                eff.type === "favorability";
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
                        label="↳ 数值修正"
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
          "行动链",
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
              <div style={{ color: T.textDim, fontSize: "11px" }}>无行动链（此结果后NPC自由选择下一行动）</div>
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
                    title="匹配模式：单个行动 或 整个分类"
                  >
                    <option value="action">行动</option>
                    <option value="category">分类</option>
                  </select>
                  {mode === "action" ? (
                    <select
                      style={{ ...inputStyle, flex: 1, fontSize: "11px" }}
                      value={sn.actionId ?? ""}
                      onChange={(e) => updateSn({ actionId: e.target.value })}
                      disabled={disabled}
                    >
                      <option value="">-- 选择行动 --</option>
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
                      <option value="">-- 选择分类 --</option>
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
                    title="权重加成"
                  />
                  <span style={{ color: T.textDim, fontSize: "11px", whiteSpace: "nowrap" }}>/</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "45px" }}
                    value={sn.decay}
                    step={5}
                    onChange={(e) => updateSn({ decay: Math.max(5, Math.ceil(Number(e.target.value) / 5) * 5) })}
                    disabled={disabled}
                    title="衰减时间(分钟)"
                  />
                  <span style={{ color: T.textDim, fontSize: "11px" }}>分</span>
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
        {toggleHeader("结果输出", "#7ecf7e", showOutTpl, () => setShowOutTpl(!showOutTpl), tplCount)}
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
