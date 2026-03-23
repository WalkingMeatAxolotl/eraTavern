/**
 * OutcomeEditor — single outcome grade editor with effects, chain, and templates.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import { useState } from "react";
import clsx from "clsx";
import type { ActionOutcome, ActionEffect, SuggestNext, EffectFilterDef } from "../../types/game";
import { t as t_ } from "../../i18n/ui";
import { EF, TargetType } from "../../constants";
import { useEditorContext } from "../shared/EditorContext";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./OutcomeEditor.module.css";
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
    <div className={s.subHeader} style={{ borderBottom: `1px solid ${color}33` }}>
      <span className={s.subHeaderLabel}>
        <span className={s.subHeaderPipe} style={{ color }}>
          |
        </span>
        <span className={s.subHeaderText}>{label}</span>
        {count !== null && <span className={s.subHeaderCount}>({count})</span>}
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
      className={clsx(s.toggleHeader, isOpen && s.toggleHeaderOpen, !isOpen && count === 0 && s.toggleHeaderDim)}
      style={{ borderBottom: isOpen ? `1px solid ${color}33` : "none" }}
      onClick={toggle}
    >
      <span className={s.toggleHeaderLabel}>
        <span className={s.toggleHeaderArrow} style={{ color }}>
          {isOpen ? "\u25BC" : "\u25B6"}
        </span>
        <span className={s.toggleHeaderText}>{label}</span>
        {count > 0 && <span className={s.toggleHeaderCount}>({count})</span>}
      </span>
      <div onClick={(e) => e.stopPropagation()}>{rightContent}</div>
    </div>
  );

  const chainCount = (outcome.suggestNext ?? []).length;
  const tplCount = (outcome.outputTemplates ?? (outcome.outputTemplate ? [{ text: outcome.outputTemplate }] : []))
    .length;

  return (
    <div className={s.outcome}>
      {/* Outcome header: grade, label, weight */}
      <div className={s.header}>
        <input
          className={clsx(sh.input, s.w80)}
          value={outcome.grade}
          onChange={(e) => update({ grade: e.target.value })}
          disabled={disabled}
          placeholder="grade"
        />
        <input
          className={clsx(sh.input, s.w60)}
          value={outcome.label}
          onChange={(e) => update({ label: e.target.value })}
          disabled={disabled}
          placeholder={t_("outcome.label")}
        />
        <span className={s.weightLabel}>{t_("label.weight")}</span>
        <input
          type="number"
          min={0}
          className={clsx(sh.input, s.w50)}
          value={outcome.weight}
          onChange={(e) => update({ weight: Math.max(0, Number(e.target.value)) })}
          disabled={disabled}
        />
        {!disabled && (
          <button className={clsx(btnClass("del", "sm"), s.headerMlAuto)} onClick={onRemove}>
            x
          </button>
        )}
      </div>

      {/* Weight modifiers */}
      <div className={s.modifierPanel}>
        <ModifierListEditor
          modifiers={outcome.weightModifiers ?? []}
          onChange={(mods) => update({ weightModifiers: mods.length > 0 ? mods : undefined })}
          disabled={disabled}
          label={t_("outcome.weightMod")}
        />
      </div>

      {/* Effects grouped by target */}
      <div className={s.effectsSection}>
        {subHeader(
          t_("outcome.effects"),
          "#6ec6ff",
          outcome.effects.length,
          !disabled && (
            <div className={s.addBtnRow}>
              <button className={btnClass("add", "sm")} onClick={() => addTargetGroup("self")}>
                [+ {t_("target.self")}]
              </button>
              {targetType === TargetType.NPC && (
                <button className={btnClass("add", "sm")} onClick={() => addTargetGroup("target")}>
                  [+ {t_("target.target")}]
                </button>
              )}
              <button className={btnClass("add", "sm")} onClick={() => addTargetGroup("filter")}>
                [+ {t_("target.filtered")}]
              </button>
            </div>
          ),
        )}
        {targetGroups.length === 0 && <div className={s.emptyHint}>{t_("empty.noEffects")}</div>}
        {targetGroups.map((group) => (
          <div
            key={group.key}
            className={s.targetGroup}
            style={{
              border: `1px solid ${targetColor(group.target)}33`,
              borderLeft: `3px solid ${targetColor(group.target)}`,
            }}
          >
            <div className={s.targetGroupHeader}>
              <span className={s.targetLabel} style={{ color: targetColor(group.target) }}>
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
                        className={clsx(sh.input, s.wAuto, s.fs11)}
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
                            className={clsx(sh.input, s.wAuto, s.fs11)}
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
                            className={clsx(sh.input, s.wAuto, s.fs11)}
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
                      <label className={s.filterLabel}>
                        <input
                          type="checkbox"
                          checked={f.excludeSelf ?? false}
                          onChange={(e) => updateFilter({ excludeSelf: e.target.checked || undefined })}
                          disabled={disabled}
                          className={s.filterCheckbox}
                        />
                        {t_("ui.excludeSelf")}
                      </label>
                    </>
                  );
                })()}
              {!disabled && (
                <button
                  className={clsx(btnClass("add", "sm"), s.headerMlAuto)}
                  onClick={() => addEffectForTarget(group.target)}
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
                <div key={effIdx} className={s.effRow} className={clsx(sh.listRow, gi % 2 === 0 ? sh.listRowOdd : sh.listRowEven)}>
                  <div className={s.effRowInner}>
                    <EffectEditor
                      effect={eff}
                      onChange={(e) => updateEffect(effIdx, { ...e, target: group.target })}
                      disabled={disabled}
                    />
                    {!disabled && (
                      <button className={btnClass("del", "sm")} onClick={() => removeEffect(effIdx)}>
                        x
                      </button>
                    )}
                  </div>
                  {hasModifiers && (
                    <div className={s.valueModPanel}>
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
      <div className={s.chainSection}>
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
              className={btnClass("add", "sm")}
            >
              [+]
            </button>
          ),
        )}
        {showChain && (
          <div className={s.chainContent}>
            {chainCount === 0 && <div className={s.chainEmpty}>{t_("outcome.noChain")}</div>}
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
                  className={clsx(s.chainRow, sh.listRow, snIdx % 2 === 0 ? sh.listRowOdd : sh.listRowEven)}
                >
                  <select
                    className={clsx(sh.input, s.wAuto, s.fs11)}
                    style={{ color: mode === "category" ? "#e9a045" : "#6ec6ff" }}
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
                      className={clsx(sh.input, s.flex1, s.fs11)}
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
                      className={clsx(sh.input, s.flex1, s.fs11)}
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
                  <span className={s.chainAccent}>+</span>
                  <input
                    type="number"
                    className={clsx(sh.input, s.w45)}
                    value={sn.bonus}
                    onChange={(e) => updateSn({ bonus: Number(e.target.value) })}
                    disabled={disabled}
                    title={t_("outcome.bonusWeight")}
                  />
                  <span className={s.chainSep}>/</span>
                  <input
                    type="number"
                    className={clsx(sh.input, s.w45)}
                    value={sn.decay}
                    step={5}
                    onChange={(e) => updateSn({ decay: Math.max(5, Math.ceil(Number(e.target.value) / 5) * 5) })}
                    disabled={disabled}
                    title={t_("outcome.decayTime")}
                  />
                  <span className={s.chainMinutes}>{t_("ui.minutes")}</span>
                  {!disabled && (
                    <button
                      className={btnClass("del", "sm")}
                      onClick={() => {
                        const next = (outcome.suggestNext ?? []).filter((_, i) => i !== snIdx);
                        update({ suggestNext: next.length > 0 ? next : undefined });
                      }}
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
          <div className={s.tplContent}>
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
