import clsx from "clsx";
import type { GameDefinitions, TraitEffect } from "../../types/game";
import { t } from "../../i18n/ui";
import { EffectDirection, MagnitudeType } from "../../constants";
import sh from "./shared.module.css";
import s from "./TraitEffectListEditor.module.css";

// ---------------------------------------------------------------------------
// Target options builder (resource.max / ability.exp / basicInfo.value)
// ---------------------------------------------------------------------------

export type TargetOptionGroup = { label: string; options: { value: string; label: string }[] };

export function buildTargetOptions(defs: GameDefinitions): TargetOptionGroup[] {
  const groups: TargetOptionGroup[] = [];
  if (defs.template.resources.length > 0) {
    groups.push({
      label: t("trait.groupResource"),
      options: defs.template.resources.map((r) => ({ value: r.key, label: `${r.label}${t("trait.maxValueSuffix")}` })),
    });
  }
  if (defs.template.abilities.length > 0) {
    groups.push({
      label: t("trait.groupAbility"),
      options: defs.template.abilities.map((a) => ({ value: a.key, label: a.label })),
    });
  }
  const numberFields = defs.template.basicInfo.filter((f) => f.type === "number");
  if (numberFields.length > 0) {
    groups.push({
      label: t("trait.groupBasicInfo"),
      options: numberFields.map((f) => ({ value: f.key, label: f.label })),
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// TraitEffectListEditor — shared by ClothingEditor and TraitEditor
// ---------------------------------------------------------------------------

interface Props {
  effects: TraitEffect[];
  onChange: (effects: TraitEffect[]) => void;
  definitions: GameDefinitions;
  disabled?: boolean;
}

export default function TraitEffectListEditor({ effects, onChange, definitions, disabled }: Props) {
  const targetGroups = buildTargetOptions(definitions);
  const allTargets = targetGroups.flatMap((g) => g.options);

  const updateEffect = (idx: number, patch: Partial<TraitEffect>) => {
    onChange(effects.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const removeEffect = (idx: number) => {
    onChange(effects.filter((_, i) => i !== idx));
  };
  const addEffect = () => {
    const firstTarget = allTargets[0]?.value ?? "";
    onChange([...effects, { target: firstTarget, effect: EffectDirection.INCREASE, magnitudeType: MagnitudeType.FIXED, value: 0 }]);
  };

  const pctHint = (value: number, direction: string) => {
    const sign = direction === EffectDirection.INCREASE ? "+" : "-";
    return `${sign}${value}%`;
  };

  return (
    <div className={s.effectList}>
      {effects.map((eff, idx) => (
        <div key={idx} className={s.effectRow}>
          <select
            className={clsx(sh.input, sh.flex1)}
            value={eff.target}
            onChange={(e) => updateEffect(idx, { target: e.target.value })}
            disabled={disabled}
          >
            {targetGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className={clsx(sh.input, sh.w70)}
            value={eff.effect}
            onChange={(e) => updateEffect(idx, { effect: e.target.value as "increase" | "decrease" })}
            disabled={disabled}
          >
            <option value={EffectDirection.INCREASE}>{t("trait.increase")}</option>
            <option value={EffectDirection.DECREASE}>{t("trait.decrease")}</option>
          </select>
          <select
            className={clsx(sh.input, sh.w70)}
            value={eff.magnitudeType}
            onChange={(e) => updateEffect(idx, { magnitudeType: e.target.value as "fixed" | "percentage" })}
            disabled={disabled}
          >
            <option value={MagnitudeType.FIXED}>{t("trait.fixedValue")}</option>
            <option value={MagnitudeType.PERCENTAGE}>{t("trait.percentage")}</option>
          </select>
          <input
            type="number"
            className={clsx(sh.input, sh.w60)}
            value={eff.value}
            onChange={(e) => updateEffect(idx, { value: Number(e.target.value) })}
            disabled={disabled}
          />
          {eff.magnitudeType === MagnitudeType.PERCENTAGE && (
            <span className={s.pctHint}>
              {pctHint(eff.value, eff.effect)}
            </span>
          )}
          {!disabled && (
            <button className={s.deleteBtn} onClick={() => removeEffect(idx)}>
              x
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button className={s.addEffectBtn} onClick={addEffect}>
          [{t("btn.addEffect")}]
        </button>
      )}
    </div>
  );
}
