/**
 * ModifierListEditor — reusable modifier list for weight modifiers and value modifiers.
 *
 * Extracted from ActionEditor.tsx. Reads shared definition lists from EditorContext.
 */
import clsx from "clsx";
import type { ValueModifier } from "../../types/game";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { EF, BonusMode, CondTarget, TargetType } from "../../constants";
import { useEditorContext } from "../shared/EditorContext";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./ModifierEditor.module.css";

export function ModifierListEditor({
  modifiers,
  onChange,
  disabled,
  label,
}: {
  modifiers: ValueModifier[];
  onChange: (mods: ValueModifier[]) => void;
  disabled: boolean;
  label: string;
}) {
  const {
    targetType,
    resourceKeys,
    basicInfoNumKeys,
    abilityKeys,
    experienceKeys,
    traitCategories,
    traitList,
    itemList,
    outfitTypes,
    clothingSlots,
    variableList,
    biVarList,
    worldVarList,
  } = useEditorContext();

  const add = () => onChange([...modifiers, { type: EF.ABILITY, key: abilityKeys[0]?.key ?? "", per: 1000, bonus: 5 }]);
  const remove = (idx: number) => onChange(modifiers.filter((_, i) => i !== idx));
  const update = (idx: number, mod: ValueModifier) => {
    const next = [...modifiers];
    next[idx] = mod;
    onChange(next);
  };

  return (
    <div className={s.wrapper}>
      <div className={s.header}>
        <span className={s.headerLabel}>{label}</span>
        {!disabled && (
          <button className={btnClass("add", "sm")} onClick={add}>
            [+]
          </button>
        )}
      </div>
      {modifiers.map((mod, idx) => (
        <div
          key={idx}
          className={clsx(s.row, sh.listRow, idx % 2 === 0 ? sh.listRowOdd : sh.listRowEven)}
        >
          <select
            className={clsx(sh.input, s.w80)}
            value={mod.type}
            onChange={(e) => {
              const t = e.target.value as ValueModifier["type"];
              const base = { bonus: mod.bonus, bonusMode: mod.bonusMode, modTarget: mod.modTarget };
              if (t === EF.RESOURCE) update(idx, { type: t, key: resourceKeys[0]?.key ?? "", per: 100, ...base });
              else if (t === EF.BASIC_INFO)
                update(idx, { type: t, key: basicInfoNumKeys[0]?.key ?? "", per: 100, ...base });
              else if (t === EF.ABILITY) update(idx, { type: t, key: abilityKeys[0]?.key ?? "", per: 1000, ...base });
              else if (t === EF.EXPERIENCE) update(idx, { type: t, key: experienceKeys[0]?.key ?? "", per: 1, ...base });
              else if (t === EF.TRAIT) update(idx, { type: t, key: traitCategories[0]?.key ?? "", value: "", ...base });
              else if (t === EF.HAS_ITEM) update(idx, { type: t, itemId: itemList[0]?.id ?? "", ...base });
              else if (t === EF.OUTFIT) update(idx, { type: t, outfitId: outfitTypes[0]?.id ?? "default", ...base });
              else if (t === EF.CLOTHING) update(idx, { type: t, slot: clothingSlots[0] ?? "", ...base });
              else if (t === EF.VARIABLE) update(idx, { type: t, varId: variableList[0]?.id ?? "", per: 1, ...base });
              else if (t === EF.WORLD_VAR) update(idx, { type: t, key: worldVarList[0]?.id ?? "", per: 1, ...base });
              else update(idx, { type: t, source: CondTarget.TARGET, per: 100, ...base });
            }}
            disabled={disabled}
          >
            <option disabled style={{ fontWeight: "bold" }}>
              {t("modGroup.numeric")}
            </option>
            <option value={EF.RESOURCE}>{t("cond.resource")}</option>
            <option value={EF.BASIC_INFO}>{t("cond.basicInfo")}</option>
            <option value={EF.ABILITY}>{t("cond.ability")}</option>
            <option value={EF.EXPERIENCE}>{t("cond.experience")}</option>
            {targetType === TargetType.NPC && <option value={EF.FAVORABILITY}>{t("cond.favorability")}</option>}
            <option value={EF.VARIABLE}>{t("cond.variable")}</option>
            <option disabled style={{ fontWeight: "bold" }}>
              {t("modGroup.state")}
            </option>
            <option value={EF.TRAIT}>{t("cond.trait")}</option>
            <option value={EF.HAS_ITEM}>{t("cond.hasItem")}</option>
            <option value={EF.OUTFIT}>{t("cond.outfit")}</option>
            <option value={EF.CLOTHING}>{t("cond.clothing")}</option>
            <option disabled style={{ fontWeight: "bold" }}>
              {t("modGroup.global")}
            </option>
            <option value={EF.WORLD_VAR}>{t("cond.worldVar")}</option>
          </select>

          {![EF.FAVORABILITY, EF.WORLD_VAR].includes(mod.type) &&
            !(mod.type === EF.VARIABLE && (biVarList ?? []).some((v) => v.id === mod.varId)) && (
              <select
                className={clsx(sh.input, s.wAuto, s.fs11)}
                value={mod.modTarget ?? CondTarget.SELF}
                onChange={(e) => update(idx, { ...mod, modTarget: e.target.value })}
                disabled={disabled || targetType !== TargetType.NPC}
              >
                <option value={CondTarget.SELF}>{t("target.self")}</option>
                {targetType === TargetType.NPC && <option value={CondTarget.TARGET}>{t("target.target")}</option>}
              </select>
            )}

          {mod.type === EF.RESOURCE && (
            <>
              <select
                className={sh.input}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {resourceKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span className={s.perSpan}>{t("label.per")}</span>
              <input
                type="number"
                className={clsx(sh.input, s.w55)}
                value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === EF.BASIC_INFO && (
            <>
              <select
                className={sh.input}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {basicInfoNumKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span className={s.perSpan}>{t("label.per")}</span>
              <input
                type="number"
                className={clsx(sh.input, s.w55)}
                value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === EF.ABILITY && (
            <>
              <select
                className={sh.input}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {abilityKeys.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span className={s.perSpan}>{t("label.per")}</span>
              <input
                type="number"
                className={clsx(sh.input, s.w55)}
                value={mod.per ?? 1000}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === EF.EXPERIENCE && (
            <>
              <select
                className={sh.input}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {experienceKeys.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span className={s.perSpan}>{t("label.per")}</span>
              <input
                type="number"
                className={clsx(sh.input, s.w55)}
                value={mod.per ?? 1}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === EF.TRAIT && (
            <>
              <select
                className={sh.input}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                {traitCategories
                  .filter((c) => c.key !== EF.ABILITY && c.key !== EF.EXPERIENCE)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
              </select>
              <select
                className={sh.input}
                value={mod.value ?? ""}
                onChange={(e) => update(idx, { ...mod, value: e.target.value })}
                disabled={disabled}
              >
                <option value="">{t("opt.anyValue")}</option>
                {traitList
                  .filter((t) => t.category === mod.key)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </>
          )}

          {mod.type === EF.HAS_ITEM && (
            <select
              className={sh.input}
              value={mod.itemId ?? ""}
              onChange={(e) => update(idx, { ...mod, itemId: e.target.value })}
              disabled={disabled}
            >
              <option value="">{t("opt.selectItem")}</option>
              {itemList.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          )}

          {mod.type === EF.OUTFIT && (
            <select
              className={sh.input}
              value={mod.outfitId ?? ""}
              onChange={(e) => update(idx, { ...mod, outfitId: e.target.value })}
              disabled={disabled}
            >
              {outfitTypes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {mod.type === EF.CLOTHING && (
            <select
              className={sh.input}
              value={mod.slot ?? ""}
              onChange={(e) => update(idx, { ...mod, slot: e.target.value })}
              disabled={disabled}
            >
              <option value="">{t("opt.selectSlot")}</option>
              {clothingSlots.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          )}

          {mod.type === EF.FAVORABILITY && (
            <>
              <select
                className={sh.input}
                value={mod.source ?? CondTarget.TARGET}
                onChange={(e) => update(idx, { ...mod, source: e.target.value })}
                disabled={disabled}
              >
                <option value={CondTarget.TARGET}>{t("target.targetToSelf")}</option>
                <option value={CondTarget.SELF}>{t("target.selfToTarget")}</option>
              </select>
              <span className={s.perSpan}>{t("label.per")}</span>
              <input
                type="number"
                className={clsx(sh.input, s.w55)}
                value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          {mod.type === EF.VARIABLE &&
            (() => {
              const isBiVar = (biVarList ?? []).some((v) => v.id === mod.varId);
              return (
                <>
                  {isBiVar && targetType === TargetType.NPC && (
                    <select
                      className={clsx(sh.input, s.wAuto, s.fs11)}
                      value={mod.modTarget ?? CondTarget.SELF}
                      onChange={(e) => update(idx, { ...mod, modTarget: e.target.value })}
                      disabled={disabled}
                    >
                      <option value={CondTarget.SELF}>{t("target.selfToTarget")}</option>
                      <option value={CondTarget.TARGET}>{t("target.targetToSelf")}</option>
                    </select>
                  )}
                  <select
                    className={sh.input}
                    value={mod.varId ?? ""}
                    onChange={(e) => update(idx, { ...mod, varId: e.target.value })}
                    disabled={disabled}
                  >
                    <option value="">{t("opt.selectVar")}</option>
                    {variableList.length > 0 && <option disabled>{t("modGroup.uni")}</option>}
                    {variableList.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                    {targetType === TargetType.NPC && (biVarList ?? []).length > 0 && <option disabled>{t("modGroup.bi")}</option>}
                    {targetType === TargetType.NPC &&
                      (biVarList ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                  <span className={s.perSpan}>{t("label.per")}</span>
                  <input
                    type="number"
                    className={clsx(sh.input, s.w55)}
                    value={mod.per ?? 1}
                    onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                    min={1}
                    disabled={disabled}
                  />
                </>
              );
            })()}

          {mod.type === EF.WORLD_VAR && (
            <>
              <select
                className={sh.input}
                value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })}
                disabled={disabled}
              >
                <option value="">{t("opt.selectWorldVar")}</option>
                {worldVarList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <span className={s.perSpan}>{t("label.per")}</span>
              <input
                type="number"
                className={clsx(sh.input, s.w55)}
                value={mod.per ?? 1}
                onChange={(e) => update(idx, { ...mod, per: Math.max(1, Number(e.target.value)) })}
                min={1}
                disabled={disabled}
              />
            </>
          )}

          <select
            className={clsx(sh.input, s.wAuto, s.fs11)}
            value={mod.bonusMode ?? BonusMode.ADD}
            onChange={(e) => update(idx, { ...mod, bonusMode: e.target.value as "add" | "multiply" })}
            disabled={disabled}
          >
            <option value={BonusMode.ADD}>+</option>
            <option value={BonusMode.MULTIPLY}>x%</option>
          </select>
          <input
            type="number"
            className={clsx(sh.input, s.w60)}
            value={mod.bonus}
            onChange={(e) => update(idx, { ...mod, bonus: Number(e.target.value) })}
            disabled={disabled}
          />
          {!disabled && (
            <button className={btnClass("del", "sm")} onClick={() => remove(idx)}>
              x
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
