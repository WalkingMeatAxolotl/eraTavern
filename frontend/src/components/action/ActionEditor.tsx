import { useState, useEffect } from "react";
import clsx from "clsx";
import type {
  ActionDefinition,
  ConditionItem,
  ActionOutcome,
  ValueModifier,
  GameDefinitions,
  OutputTemplateEntry,
} from "../../types/game";
import { createActionDef, saveActionDef, deleteActionDef, fetchLLMPresets } from "../../api/client";
import { RawJsonPanel } from "../shared/RawJsonEditor";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { TargetType } from "../../constants";
import { EditorProvider } from "../shared/EditorContext";
import type { EditorContextValue } from "../shared/EditorContext";
import { ConditionItemEditor } from "../shared/ConditionEditor";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import { ModifierListEditor } from "./ModifierEditor";
import { OutcomeEditor } from "./OutcomeEditor";
import { TemplateListEditor, TemplateVarHelp } from "./TemplateEditor";
import CloneButton from "../shared/CloneDialog";
import s from "./ActionEditor.module.css";

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface Props {
  action: ActionDefinition;
  isNew: boolean;
  definitions: GameDefinitions;
  onBack: () => void;
  addonCrud?: AddonCrud;
  addonIds?: string[];
}

// Color-coded sections for visual distinction
const SEC = {
  basic: "var(--sec-blue)",
  weight: "var(--sec-orange)",
  cond: "var(--sec-purple)",
  outcome: "var(--sec-red)",
  template: "var(--sec-green)",
};

const secVars = (sec: keyof typeof SEC) =>
  ({ "--sec-color": SEC[sec] }) as React.CSSProperties;

export default function ActionEditor({ action, isNew, definitions, onBack, addonCrud, addonIds }: Props) {
  const addonPrefix = action.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(action.id));
  const [name, setName] = useState(action.name);
  const [category, setCategory] = useState(action.category);
  const [targetType, setTargetType] = useState(action.targetType);
  const [triggerLLM, setTriggerLLM] = useState(action.triggerLLM);
  const [llmPreset, setLlmPreset] = useState(action.llmPreset || "");
  const [llmPresetList, setLlmPresetList] = useState<{ id: string; name: string }[]>([]);
  const [timeCost, setTimeCost] = useState(action.timeCost);
  const [npcWeight, setNpcWeight] = useState(action.npcWeight ?? 0);
  const [npcWeightModifiers, setNpcWeightModifiers] = useState<ValueModifier[]>(
    JSON.parse(JSON.stringify(action.npcWeightModifiers ?? [])),
  );
  const [conditions, setConditions] = useState<ConditionItem[]>(JSON.parse(JSON.stringify(action.conditions)));
  const [outcomes, setOutcomes] = useState<ActionOutcome[]>(JSON.parse(JSON.stringify(action.outcomes)));
  const [outputTemplates, setOutputTemplates] = useState<OutputTemplateEntry[]>(
    action.outputTemplates ?? (action.outputTemplate ? [{ text: action.outputTemplate }] : []),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showVarHelp, setShowVarHelp] = useState(false);

  useEffect(() => {
    fetchLLMPresets()
      .then(setLlmPresetList)
      .catch(() => {});
  }, []);

  const isReadOnly = false; // all addon entities are editable
  const [jsonMode, setJsonMode] = useState(false);

  const { template, maps, traitDefs, itemDefs, clothingDefs, characters } = definitions;
  const resourceKeys = template.resources.map((r) => ({ key: r.key, label: r.label }));
  const abilityKeys = template.abilities.map((a) => ({ key: a.key, label: a.label }));
  const experienceKeys = (template.experiences ?? []).map((e: { key: string; label: string }) => ({
    key: e.key,
    label: e.label,
  }));
  const basicInfoNumKeys = template.basicInfo
    .filter((b) => b.type === "number")
    .map((b) => ({ key: b.key, label: b.label }));
  const traitCategories = template.traits.map((t) => ({ key: t.key, label: t.label }));
  const clothingSlots = template.clothingSlots;
  const mapList = Object.values(maps);
  const traitList = Object.values(traitDefs);
  const itemList = Object.values(itemDefs);
  const clothingList = Object.values(clothingDefs);
  const outfitTypes = [
    { id: "default", name: t("label.defaultOutfit") },
    ...(definitions.outfitTypes ?? []).map((t) => ({ id: t.id, name: t.name })),
  ];
  const npcList = Object.values(characters ?? {}).filter((c) => !c.isPlayer);
  const allVarDefs = Object.values(definitions.variableDefs ?? {});
  const variableList = allVarDefs.filter((v) => !v.isBidirectional).map((v) => ({ id: v.id, name: v.name || v.id }));
  const biVarList = allVarDefs.filter((v) => v.isBidirectional).map((v) => ({ id: v.id, name: v.name || v.id }));
  const worldVarList = Object.values(definitions.worldVariableDefs ?? {}).map((v) => ({
    id: v.id,
    name: v.name || v.id,
  }));
  const actionList = Object.values(definitions.actionDefs).map((a) => ({ id: a.id, name: a.name || a.id }));
  const categoryList = [
    ...new Set(
      Object.values(definitions.actionDefs)
        .map((a) => a.category)
        .filter(Boolean),
    ),
  ];

  // --- Condition helpers ---
  const addCondition = () => {
    setConditions([...conditions, { type: "location" }]);
  };
  const addOrGroup = () => {
    setConditions([...conditions, { or: [{ type: "location" }] }]);
  };
  const addAndGroup = () => {
    setConditions([...conditions, { and: [{ type: "location" }] }]);
  };
  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };
  const updateCondition = (idx: number, item: ConditionItem) => {
    const next = [...conditions];
    next[idx] = item;
    setConditions(next);
  };

  // --- Outcome helpers ---
  const addOutcome = () => {
    setOutcomes([...outcomes, { grade: "success", label: t("outcome.defaultLabel"), weight: 100, effects: [] }]);
  };
  const removeOutcome = (idx: number) => {
    setOutcomes(outcomes.filter((_, i) => i !== idx));
  };
  const updateOutcome = (idx: number, outcome: ActionOutcome) => {
    const next = [...outcomes];
    next[idx] = outcome;
    setOutcomes(next);
  };

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage(t("val.idNameRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = {
        id,
        name,
        category,
        targetType,
        triggerLLM,
        llmPreset: llmPreset || undefined,
        timeCost,
        npcWeight,
        npcWeightModifiers,
        conditions,
        costs: [],
        outcomes,
        outputTemplates: outputTemplates.length > 0 ? outputTemplates : undefined,
        source: action.source,
      };
      if (addonCrud) {
        if (isNew) {
          await addonCrud.create(data);
        } else {
          await addonCrud.save(action.id, data);
        }
        return;
      }
      const result = isNew ? await createActionDef(data) : await saveActionDef(action.id, data);
      setMessage(result.success ? t("status.saved") : result.message);
      if (result.success && isNew) {
        setTimeout(onBack, 500);
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteAction", { name: name || id }))) return;
    setSaving(true);
    try {
      if (addonCrud) {
        await addonCrud.delete(action.id);
        onBack();
        return;
      }
      const result = await deleteActionDef(action.id);
      if (result.success) onBack();
      else setMessage(result.message);
    } catch (e) {
      setMessage(t("msg.deleteFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const editorCtx: EditorContextValue = {
    definitions,
    targetType,
    resourceKeys,
    abilityKeys,
    experienceKeys,
    basicInfoNumKeys,
    traitCategories,
    clothingSlots,
    mapList,
    traitList,
    itemList,
    npcList,
    outfitTypes,
    variableList,
    biVarList,
    worldVarList,
    clothingList,
    actionList,
    categoryList,
  };

  const buildData = (): Record<string, unknown> => ({
    id,
    name,
    category,
    targetType,
    triggerLLM,
    llmPreset: llmPreset || undefined,
    timeCost,
    npcWeight,
    npcWeightModifiers,
    conditions,
    costs: [],
    outcomes,
    outputTemplates: outputTemplates.length > 0 ? outputTemplates : undefined,
  });

  if (jsonMode) {
    return (
      <RawJsonPanel
        data={buildData()}
        onSave={async (data) => {
          const result = isNew
            ? await createActionDef({ ...data, source: action.source } as never)
            : await saveActionDef(action.id, { ...data, source: action.source } as never);
          if (result.success && isNew) setTimeout(onBack, 500);
          return result;
        }}
        onToggle={() => setJsonMode(false)}
      />
    );
  }

  return (
    <EditorProvider value={editorCtx}>
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.title}>
          == {isNew ? t("editor.newAction") : t("editor.editAction")} ==
        </span>
        {action.source && <span className={s.source}>{t("field.source")}: {action.source}</span>}
      </div>

      {/* Basic info */}
      <div className={s.section} style={secVars("basic")}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>
            {t("section.basicInfo")}
          </span>
        </div>
        <div className={clsx(s.sectionContent, s.fieldColGap)}>
          <div className={s.fieldRow}>
            <div className={s.fieldCol}>
              <div className={sh.label}>ID</div>
              <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew || isReadOnly} />
            </div>
            <div className={s.fieldCol}>
              <div className={sh.label}>{t("field.name")}</div>
              <input
                className={clsx(sh.input, s.inputFull)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className={s.fieldCol}>
              <div className={sh.label}>{t("field.category")}</div>
              <select
                className={clsx(sh.input, s.inputFull)}
                value={categoryList.includes(category) ? category : "__custom__"}
                onChange={(e) => {
                  if (e.target.value !== "__custom__") setCategory(e.target.value);
                }}
                disabled={isReadOnly}
              >
                {categoryList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom__">{t("ui.custom")}</option>
              </select>
              {!categoryList.includes(category) && (
                <input
                  className={clsx(sh.input, s.inputFull)}
                  style={{ marginTop: "2px" }}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isReadOnly}
                  placeholder={t("ui.customInput")}
                />
              )}
            </div>
          </div>
          <div className={s.fieldRowAlignEnd}>
            <div>
              <div className={sh.label}>{t("field.targetType")}</div>
              <select
                className={sh.input}
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as ActionDefinition["targetType"])}
                disabled={isReadOnly}
              >
                <option value={TargetType.NONE}>{t("ui.noTarget")}</option>
                <option value={TargetType.NPC}>{t("ui.npc")}</option>
              </select>
            </div>
            <div>
              <div className={sh.label}>{t("field.timeCost")}</div>
              <input
                className={clsx(sh.input, s.inputTimeCost)}
                type="number"
                step={5}
                min={0}
                value={timeCost}
                onChange={(e) => setTimeCost(Math.max(0, Math.round(Number(e.target.value) / 5) * 5))}
                disabled={isReadOnly}
              />
            </div>
            <label
              className={clsx(s.checkboxLabel, isReadOnly && s.readOnly)}
            >
              <input
                type="checkbox"
                checked={triggerLLM}
                onChange={(e) => setTriggerLLM(e.target.checked)}
                disabled={isReadOnly}
              />
              <span className={s.checkboxText}>{t("field.triggerLlm")}</span>
            </label>
            {triggerLLM && (
              <div>
                <div className={sh.label}>{t("field.llmPreset")}</div>
                <select
                  className={clsx(sh.input, s.inputLlmPreset)}
                  value={llmPreset}
                  onChange={(e) => setLlmPreset(e.target.value)}
                  disabled={isReadOnly}
                >
                  <option value="">{t("ui.followDefault")}</option>
                  {llmPresetList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* NPC Weight */}
      <div className={s.section} style={secVars("weight")}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>
            {t("field.npcWeight")}
          </span>
        </div>
        <div className={s.sectionContent}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div>
              <div className={sh.label}>{t("field.baseWeight")}</div>
              <input
                className={clsx(sh.input, s.inputTimeCost)}
                type="number"
                min={0}
                value={npcWeight}
                onChange={(e) => setNpcWeight(Math.max(0, Number(e.target.value)))}
                disabled={isReadOnly}
              />
              <div className={s.hint}>{t("npc.zeroWeight")}</div>
            </div>
            <div className={s.modifierPanel}>
              <ModifierListEditor
                modifiers={npcWeightModifiers}
                onChange={setNpcWeightModifiers}
                disabled={isReadOnly}
                label={t("outcome.weightMod")}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div className={s.section} style={secVars("cond")}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>
            {t("section.showConditionsAnd")}
          </span>
          {!isReadOnly && (
            <div className={s.btnGroup}>
              <button className={btnClass("add", "sm")} onClick={addCondition}>
                [{t("btn.addCondition")}]
              </button>
              <button className={btnClass("add", "sm")} onClick={addOrGroup}>
                [{t("btn.addOr")}]
              </button>
              <button className={btnClass("add", "sm")} onClick={addAndGroup}>
                [{t("btn.addAnd")}]
              </button>
            </div>
          )}
        </div>
        <div className={s.sectionContent}>
          {conditions.length === 0 && <div className={s.emptyMsg}>{t("empty.noCondShow")}</div>}
          {conditions.map((item, idx) => (
            <div key={idx} className={clsx(sh.listRow, idx % 2 === 0 ? sh.listRowOdd : sh.listRowEven)}>
              <ConditionItemEditor
                item={item}
                onChange={(newItem) => updateCondition(idx, newItem)}
                onRemove={() => removeCondition(idx)}
                disabled={isReadOnly}
                depth={0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Outcomes */}
      <div className={s.section} style={secVars("outcome")}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>
            {t("section.outcomes")}
          </span>
          {!isReadOnly && (
            <button className={btnClass("add", "sm")} onClick={addOutcome}>
              [{t("btn.addOutcome")}]
            </button>
          )}
        </div>
        <div className={s.sectionContent}>
          {outcomes.length === 0 && <div className={s.emptyMsg}>{t("outcome.noOutcomes")}</div>}
          {outcomes.map((outcome, idx) => (
            <OutcomeEditor
              key={idx}
              outcome={outcome}
              onChange={(o) => updateOutcome(idx, o)}
              onRemove={() => removeOutcome(idx)}
              disabled={isReadOnly}
            />
          ))}
        </div>
      </div>

      {/* Output templates */}
      <div className={s.section} style={secVars("template")}>
        <div className={s.sectionTitle}>
          <div className={s.tplTitleRow}>
            <span className={s.sectionTitleText}>
              {t("npc.outputTpl")}
            </span>
            <button
              className={btnClass(showVarHelp ? "danger" : "neutral", "sm")}
              onClick={() => setShowVarHelp((v) => !v)}
            >
              [?]
            </button>
          </div>
        </div>
        <div className={s.sectionContent}>
          <TemplateListEditor
            templates={outputTemplates}
            onChange={setOutputTemplates}
            disabled={isReadOnly}
          />
          {showVarHelp && (
            <TemplateVarHelp />
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className={s.actionBar}>
        {!isReadOnly && (
          <button
            className={btnClass("create")}
            onClick={handleSave}
            disabled={saving}
          >
            [{t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={action.source || ""}
            getData={() => buildData()}
            createFn={(d) => createActionDef(d)}
            onSuccess={onBack}
          />
        )}
        {!isReadOnly && !isNew && (
          <button
            className={btnClass("danger")}
            onClick={handleDelete}
            disabled={saving}
          >
            [{t("btn.delete")}]
          </button>
        )}
        <button
          className={btnClass("neutral")}
          onClick={onBack}
        >
          [{t("btn.back")}]
        </button>
        <button
          className={btnClass("neutral")}
          onClick={() => setJsonMode(true)}
        >
          [JSON]
        </button>
        {message && (
          <span className={s.statusMsg} style={{ color: message === t("status.saved") ? T.success : T.danger }}>{message}</span>
        )}
      </div>
    </div>
    </EditorProvider>
  );
}

// END OF FILE — sub-editors extracted to ModifierEditor, EffectEditor, OutcomeEditor, TemplateEditor
