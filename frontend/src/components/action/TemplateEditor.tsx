/**
 * Template editors — output template list, conditions, and variable help panel.
 *
 * Extracted from ActionEditor.tsx.
 */
import clsx from "clsx";
import type { OutputTemplateEntry, ConditionItem } from "../../types/game";
import { useEditorContext } from "../shared/EditorContext";
import { ConditionItemEditor } from "../shared/ConditionEditor";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./TemplateEditor.module.css";
import { t } from "../../i18n/ui";

export function TemplateListEditor({
  templates,
  onChange,
  disabled,
}: {
  templates: OutputTemplateEntry[];
  onChange: (tpls: OutputTemplateEntry[]) => void;
  disabled: boolean;
}) {
  const add = () => onChange([...templates, { text: "" }]);
  const remove = (idx: number) => onChange(templates.filter((_, i) => i !== idx));
  const update = (idx: number, entry: OutputTemplateEntry) => {
    const next = [...templates];
    next[idx] = entry;
    onChange(next);
  };

  // Single template: simple textarea (no conditions/weight UI needed)
  if (templates.length <= 1) {
    return (
      <div>
        <div className={s.addRow}>
          {!disabled && templates.length === 0 && (
            <button className={btnClass("add", "sm")} onClick={add}>
              [{t("btn.addTemplate")}]
            </button>
          )}
          {templates.length === 1 && !disabled && (
            <button className={btnClass("add", "sm")} onClick={add}>
              [{t("btn.addBranch")}]
            </button>
          )}
        </div>
        {templates.length === 1 && (
          <div className={s.singleRow}>
            <textarea
              className={s.textarea}
              value={templates[0].text}
              onChange={(e) => update(0, { ...templates[0], text: e.target.value })}
              disabled={disabled}
              placeholder="{{player}} ..."
            />
            {!disabled && (
              <button className={btnClass("del", "sm")} onClick={() => remove(0)}>
                x
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Multiple templates: show conditions + weight for each
  return (
    <div>
      <div className={clsx(s.addRow, s.addRowMulti)}>
        {!disabled && (
          <button className={btnClass("add", "sm")} onClick={add}>
            [{t("btn.addBranch")}]
          </button>
        )}
        <span className={s.randomHelp}>{t("tpl.randomHelp")}</span>
      </div>
      {templates.map((entry, idx) => (
        <div key={idx} className={clsx(s.entryCard, sh.listRow, idx % 2 === 0 ? sh.listRowOdd : sh.listRowEven)}>
          <div className={s.entryHeader}>
            <span className={s.entryIndex}>#{idx + 1}</span>
            <span className={s.weightLabel}>{t("label.weight")}</span>
            <input
              type="number"
              min={0}
              className={clsx(sh.input, s.w50)}
              value={entry.weight ?? 1}
              onChange={(e) => update(idx, { ...entry, weight: Math.max(0, Number(e.target.value)) })}
              disabled={disabled}
            />
            {!disabled && (
              <button className={clsx(btnClass("del", "sm"), s.headerMlAuto)} onClick={() => remove(idx)}>
                x
              </button>
            )}
          </div>
          <textarea
            className={s.textareaFull}
            value={entry.text}
            onChange={(e) => update(idx, { ...entry, text: e.target.value })}
            disabled={disabled}
            placeholder="{{player}} ..."
          />
          {/* Conditions */}
          <TemplateConditionsEditor
            conditions={entry.conditions ?? []}
            onChange={(conds) => update(idx, { ...entry, conditions: conds.length > 0 ? conds : undefined })}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

export function TemplateConditionsEditor({
  conditions,
  onChange,
  disabled,
}: {
  conditions: ConditionItem[];
  onChange: (conds: ConditionItem[]) => void;
  disabled: boolean;
}) {
  const addCond = () => onChange([...conditions, { type: "location" }]);
  const removeCond = (idx: number) => {
    const next = conditions.filter((_, i) => i !== idx);
    onChange(next);
  };
  const updateCond = (idx: number, item: ConditionItem) => {
    const next = [...conditions];
    next[idx] = item;
    onChange(next);
  };

  return (
    <div className={s.conditionsWrap}>
      <div className={s.condHeader}>
        <span className={s.condLabel}>{t("outcome.condLabel")}</span>
        {!disabled && (
          <button className={btnClass("add", "sm")} onClick={addCond}>
            [+]
          </button>
        )}
        {conditions.length === 0 && <span className={s.condEmpty}>{t("empty.noCondSelect")}</span>}
      </div>
      {conditions.map((item, idx) => (
        <div key={idx} className={s.condItem}>
          <ConditionItemEditor
            item={item}
            onChange={(newItem) => updateCond(idx, newItem)}
            onRemove={() => removeCond(idx)}
            disabled={disabled}
            depth={0}
          />
        </div>
      ))}
    </div>
  );
}

export function TemplateVarHelp() {
  const { resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots } = useEditorContext();

  const row = (v: string, desc: string) => (
    <div key={v} className={s.helpRow}>
      <span className={s.helpVar}>{`{{${v}}}`}</span>
      <span className={s.helpDesc}>{desc}</span>
    </div>
  );

  return (
    <div className={s.helpPanel}>
      <div className={s.helpTitle}>{t("tpl.varHelp")}</div>
      {row("player", t("tpl.var.player"))}
      {row("target", t("tpl.var.target"))}
      {row("outcome", t("tpl.var.outcome"))}
      {row("outcomeGrade", t("tpl.var.outcomeGrade"))}
      {row("effects", t("tpl.var.effects"))}
      {row("time", t("tpl.var.time"))}
      {row("weather", t("tpl.var.weather"))}
      {row("location", t("tpl.var.location"))}

      <div className={s.helpCatTitle}>{t("tpl.cat.resource")}</div>
      {resourceKeys.map((r) => row(`self.resource.${r.key}`, r.label))}

      <div className={s.helpCatTitle}>{t("tpl.cat.ability")}</div>
      {abilityKeys.map((a) => row(`self.ability.${a.key}`, t("tpl.abilityLevel", { label: a.label })))}

      <div className={s.helpCatTitle}>{t("tpl.cat.basicInfo")}</div>
      {basicInfoNumKeys.map((b) => row(`self.basicInfo.${b.key}`, b.label))}

      <div className={s.helpCatTitle}>{t("tpl.cat.clothing")}</div>
      {clothingSlots.map((sl) => row(`self.clothing.${sl}`, t("tpl.slotClothing", { slot: sl })))}

      <div className={s.helpCatTitle}>{t("tpl.cat.trait")}</div>
      {traitCategories.map((tc) => row(`self.trait.${tc.key}`, t("tpl.traitValue", { label: tc.label })))}
    </div>
  );
}
