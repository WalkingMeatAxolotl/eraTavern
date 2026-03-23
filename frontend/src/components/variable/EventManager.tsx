import { useState, useCallback } from "react";
import clsx from "clsx";
import T from "../../theme";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { EF, EffType, EffectOp, ClothingState, TriggerMode, EventScope, TargetType } from "../../constants";
import { HelpButton, HelpPanel, helpStyles } from "../shared/HelpToggle";
import type {
  EventDefinition,
  WorldVariableDefinition,
  GameDefinitions,
  ActionCondition,
  ConditionItem,
  ActionEffect,
} from "../../types/game";
import {
  fetchEventDefs,
  createEventDef,
  saveEventDef,
  deleteEventDef,
  fetchWorldVariableDefs,
  createWorldVariableDef,
  saveWorldVariableDef,
  deleteWorldVariableDef,
  fetchDefinitions,
} from "../../api/client";
import { RawJsonView } from "../shared/RawJsonEditor";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { EditorProvider, useEditorContext } from "../shared/EditorContext";
import type { EditorContextValue, KeyLabel } from "../shared/EditorContext";
import { ConditionItemEditor } from "../shared/ConditionEditor";
import { btnClass } from "../shared/buttons";
import { toLocalId } from "../shared/idUtils";
import CloneButton from "../shared/CloneDialog";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import sh from "../shared/shared.module.css";
import s from "./EventManager.module.css";

// ── Styles ──────────────────────────────────────────────

const EFFECT_TYPES: { value: ActionEffect["type"]; label: string }[] = [
  { value: EffType.RESOURCE, label: t("eff.resource") },
  { value: EffType.ABILITY, label: t("eff.ability") },
  { value: EffType.EXPERIENCE, label: t("eff.experience") },
  { value: EffType.BASIC_INFO, label: t("eff.basicInfo") },
  { value: EffType.FAVORABILITY, label: t("eff.favorability") },
  { value: EffType.TRAIT, label: t("eff.trait") },
  { value: EffType.ITEM, label: t("eff.item") },
  { value: EffType.CLOTHING, label: t("eff.clothing") },
  { value: EffType.POSITION, label: t("eff.position") },
  { value: EffType.WORLD_VAR, label: t("eff.worldVar") },
];

// ── Main ────────────────────────────────────────────────

export default function EventManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [events, setEvents] = useState<EventDefinition[]>([]);
  const [worldVars, setWorldVars] = useState<WorldVariableDefinition[]>([]);
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [editingType, setEditingType] = useState<"event" | "worldVar">("event");

  const loadFn = useCallback(async () => {
    const [evtList, wvList, defs] = await Promise.all([fetchEventDefs(), fetchWorldVariableDefs(), fetchDefinitions()]);
    setEvents(evtList);
    setWorldVars(wvList);
    setDefinitions(defs);
  }, []);

  const { editingId, isNew, loading, showJson, setShowJson, handleEdit, handleNew, handleBack } = useManagerState({
    onEditingChange,
    loadFn,
  });

  const handleEditEvent = (id: string) => {
    setEditingType("event");
    handleEdit(id);
  };
  const handleNewEvent = () => {
    setEditingType("event");
    handleNew();
  };
  const handleEditWV = (id: string) => {
    setEditingType("worldVar");
    handleEdit(id);
  };
  const handleNewWV = () => {
    setEditingType("worldVar");
    handleNew();
  };

  const readOnly = isReadOnly(selectedAddon);
  const filteredEvents = selectedAddon ? events.filter((e) => e.source === selectedAddon) : events;
  const filteredWVs = selectedAddon ? worldVars.filter((v) => v.source === selectedAddon) : worldVars;

  if (showJson && selectedAddon) {
    return <RawJsonView addonId={selectedAddon} filename="events.json" onClose={() => setShowJson(false)} />;
  }

  if (loading) {
    return <div className={s.loading}>{t("status.loading")}</div>;
  }

  // ── Editor view ──
  if (editingId !== null) {
    if (editingType === "worldVar") {
      const existing = worldVars.find((v) => v.id === editingId);
      const blank: WorldVariableDefinition = {
        id: "",
        name: "",
        description: "",
        type: "number",
        default: 0,
        source: selectedAddon ?? "",
      };
      return <WorldVarEditor variable={isNew ? blank : (existing ?? blank)} isNew={isNew} onBack={handleBack} addonIds={addonIds} />;
    }
    const existing = events.find((e) => e.id === editingId);
    const blank: EventDefinition = {
      id: "",
      name: "",
      description: "",
      triggerMode: TriggerMode.ON_CHANGE,
      targetScope: EventScope.EACH_CHARACTER,
      conditions: [],
      effects: [],
      outputTemplate: "",
      source: selectedAddon ?? "",
    };
    return (
      <EventEditor
        event={isNew ? blank : (existing ?? blank)}
        isNew={isNew}
        definitions={definitions}
        worldVars={worldVars}
        onBack={handleBack}
        addonIds={addonIds}
      />
    );
  }

  // ── List view ──
  return (
    <div className={s.wrapper}>

      {/* == 世界变量 == */}
      <div className={s.header}>
        <span className={sh.editorTitle}>== {t("header.worldVars")} ==</span>
        {!readOnly && (
          <div className={s.btnRow}>
            <button onClick={() => setShowJson(true)} className={btnClass("neutral", "md")}>
              [JSON]
            </button>
            <button onClick={handleNewWV} className={btnClass("create", "md")}>
              [{t("btn.addVar")}]
            </button>
          </div>
        )}
      </div>
      <div className={clsx(s.listColumn, s.worldVarSection)}>
        {filteredWVs.map((v) => (
          <button
            key={v.id}
            className={s.listItem}
            onClick={() => handleEditWV(v.id)}
          >
            <span style={{ color: T.text }}>{v.name || v.id}</span>
            <span className={sh.textDim}>{v.type}</span>
            <span className={sh.textDim}>{t("event.default", { value: String(v.default) })}</span>
          </button>
        ))}
        {filteredWVs.length === 0 && (
          <div className={s.emptyMsg}>{t("empty.worldVars")}</div>
        )}
      </div>

      {/* == 全局事件 == */}
      <div className={s.header}>
        <span className={sh.editorTitle}>== {t("header.globalEvents")} ==</span>
        {!readOnly && (
          <div className={s.btnRow}>
            <button onClick={() => setShowJson(true)} className={btnClass("neutral", "md")}>
              [JSON]
            </button>
            <button onClick={handleNewEvent} className={btnClass("create", "md")}>
              [{t("btn.newEvent")}]
            </button>
          </div>
        )}
      </div>
      <div className={s.listColumn}>
        {filteredEvents.map((evt) => {
          const modeLabel =
            evt.triggerMode === TriggerMode.ON_CHANGE ? t("event.onChangeShort") : evt.triggerMode === TriggerMode.WHILE ? t("event.whileShort") : t("event.onceShort");
          const scopeLabel = evt.targetScope === EventScope.EACH_CHARACTER ? t("event.eachCharShort") : t("event.noTargetShort");
          return (
            <button
              key={evt.id}
              className={s.listItem}
              onClick={() => handleEditEvent(evt.id)}
            >
              <span style={{ color: T.text }}>{evt.name || evt.id}</span>
              <span className={s.modeLabel}>{modeLabel}</span>
              <span className={sh.textDim}>{scopeLabel}</span>
              {evt.enabled === false && <span style={{ color: T.danger, fontSize: "11px" }}>[{t("event.disabled")}]</span>}
            </button>
          );
        })}
        {filteredEvents.length === 0 && (
          <div className={s.emptyMsg}>{t("empty.globalEvents")}</div>
        )}
      </div>

    </div>
  );
}

// ── World Variable Editor ─────────────────────────────

function WorldVarEditor({
  variable,
  isNew,
  onBack,
  addonIds,
}: {
  variable: WorldVariableDefinition;
  isNew: boolean;
  onBack: () => void;
  addonIds?: string[];
}) {
  const addonPrefix = variable.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(variable.id));
  const [name, setName] = useState(variable.name);
  const [description, setDescription] = useState(variable.description ?? "");
  const [type, setType] = useState<"number" | "boolean">(variable.type);
  const [defaultVal, setDefaultVal] = useState(variable.default);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const data: any = { id, name, description: description || undefined, type, default: defaultVal };
      if (isNew) {
        data.source = variable.source;
        const res = await createWorldVariableDef(data);
        if (!res.success) {
          alert(res.message);
          return;
        }
      } else {
        const res = await saveWorldVariableDef(variable.id, data);
        if (!res.success) {
          alert(res.message);
          return;
        }
      }
      onBack();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteWorldVar"))) return;
    const res = await deleteWorldVariableDef(variable.id);
    if (!res.success) {
      alert(res.message);
      return;
    }
    onBack();
  };

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header} style={{ marginBottom: "12px" }}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newWorldVar") : t("editor.editNamed", { name: variable.name || variable.id })} ==
        </span>
        <div className={s.btnRow}>
          <button onClick={onBack} className={btnClass("neutral")}>
            [{t("btn.return")}]
          </button>
          {!isNew && addonIds && (
            <CloneButton
              addonIds={addonIds}
              defaultAddon={variable.source || ""}
              getData={() => ({ name, description: description || undefined, type, default: defaultVal })}
              createFn={(d) => createWorldVariableDef(d)}
              onSuccess={onBack}
              className={btnClass("neutral")}
            />
          )}
          {!isNew && (
            <button onClick={handleDelete} className={btnClass("danger")}>
              [{t("btn.delete")}]
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className={btnClass("create")}>
            {saving ? t("status.saving") : `[${t("btn.confirm")}]`}
          </button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel50}>ID</label>
          <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew} />
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel50}>{t("field.name")}</label>
          <input className={clsx(sh.input, sh.flex1)} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel50}>{t("field.note")}</label>
          <input
            className={clsx(sh.input, sh.flex1)}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("ui.optional")}
          />
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel50}>{t("field.type")}</label>
          <select
            className={sh.input}
            value={type}
            onChange={(e) => setType(e.target.value as "number" | "boolean")}
          >
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel50}>{t("field.defaultValue")}</label>
          <input
            className={clsx(sh.input, sh.w80)}
            type="number"
            value={defaultVal}
            onChange={(e) => setDefaultVal(Number(e.target.value))}
          />
          {type === "boolean" && <span className={sh.textDim}>{t("event.boolHelp")}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Event Editor ──────────────────────────────────────

function EventEditor({
  event,
  isNew,
  definitions,
  worldVars,
  onBack,
  addonIds,
}: {
  event: EventDefinition;
  isNew: boolean;
  definitions: GameDefinitions | null;
  worldVars: WorldVariableDefinition[];
  onBack: () => void;
  addonIds?: string[];
}) {
  const addonPrefix = event.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(event.id));
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [triggerMode, setTriggerMode] = useState(event.triggerMode);
  const [cooldown, setCooldown] = useState(event.cooldown ?? 10);
  const [enabled, setEnabled] = useState(event.enabled !== false);
  const [targetScope, setTargetScope] = useState(event.targetScope);
  const [conditions, setConditions] = useState<ConditionItem[]>(event.conditions ?? []);
  const [effects, setEffects] = useState<ActionEffect[]>(event.effects ?? []);
  const [outputTemplate, setOutputTemplate] = useState(event.outputTemplate ?? "");
  const [saving, setSaving] = useState(false);
  const [showVarHelp, setShowVarHelp] = useState(false);
  const [showTriggerHelp, setShowTriggerHelp] = useState(false);
  const [showScopeHelp, setShowScopeHelp] = useState(false);

  // Derived lists from definitions
  const resourceKeys = definitions?.template.resources.map((r) => ({ key: r.key, label: r.label })) ?? [];
  const abilityKeys = definitions?.template.abilities?.map((a) => ({ key: a.key, label: a.label })) ?? [];
  const experienceKeys = (definitions?.template.experiences ?? []).map((e: { key: string; label: string }) => ({
    key: e.key,
    label: e.label,
  }));
  const basicInfoNumKeys =
    definitions?.template.basicInfo.filter((f) => f.type === "number").map((f) => ({ key: f.key, label: f.label })) ??
    [];
  const traitCategories = definitions?.template.traits?.map((tc) => ({ key: tc.key, label: tc.label })) ?? [];
  const clothingSlots = definitions?.template.clothingSlots ?? [];
  const mapList = definitions ? Object.values(definitions.maps) : [];
  const traitList = definitions ? Object.values(definitions.traitDefs) : [];
  const itemList = definitions ? Object.values(definitions.itemDefs) : [];
  const npcList = definitions ? Object.values(definitions.characters).filter((c) => !c.isPlayer) : [];
  const allVarDefs = definitions ? Object.values(definitions.variableDefs) : [];
  const variableList = allVarDefs.filter((v) => !v.isBidirectional).map((v) => ({ id: v.id, name: v.name || v.id }));
  const biVarList = allVarDefs.filter((v) => v.isBidirectional).map((v) => ({ id: v.id, name: v.name || v.id }));
  const worldVarList = worldVars.map((v) => ({ id: v.id, name: v.name || v.id }));
  const clothingList = definitions ? Object.values(definitions.clothingDefs) : [];
  const actionList = definitions
    ? Object.values(definitions.actionDefs).map((a) => ({ id: a.id, name: a.name || a.id }))
    : [];
  const categoryList = definitions
    ? [...new Set(Object.values(definitions.actionDefs).map((a) => a.category).filter(Boolean))]
    : [];

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const data: any = {
        id,
        name,
        description: description || undefined,
        triggerMode,
        targetScope,
        conditions,
        effects,
        outputTemplate: outputTemplate || undefined,
        enabled,
      };
      if (triggerMode === TriggerMode.WHILE) data.cooldown = cooldown;
      if (isNew) {
        data.source = event.source;
        const res = await createEventDef(data);
        if (!res.success) {
          alert(res.message);
          return;
        }
      } else {
        const res = await saveEventDef(event.id, data);
        if (!res.success) {
          alert(res.message);
          return;
        }
      }
      onBack();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteEvent"))) return;
    const res = await deleteEventDef(event.id);
    if (!res.success) {
      alert(res.message);
      return;
    }
    onBack();
  };

  // Condition CRUD
  const addCondition = () => setConditions([...conditions, { type: "location" } as ActionCondition]);
  const addOrGroup = () => setConditions([...conditions, { or: [{ type: "location" } as ActionCondition] }]);
  const updateCondition = (idx: number, item: ConditionItem) => {
    const next = [...conditions];
    next[idx] = item;
    setConditions(next);
  };
  const removeCondition = (idx: number) => setConditions(conditions.filter((_, i) => i !== idx));

  // Effect CRUD
  const addEffect = () => setEffects([...effects, { type: EF.RESOURCE, op: EffectOp.ADD } as ActionEffect]);
  const updateEffect = (idx: number, eff: ActionEffect) => {
    const next = [...effects];
    next[idx] = eff;
    setEffects(next);
  };
  const removeEffect = (idx: number) => setEffects(effects.filter((_, i) => i !== idx));

  const outfitTypes = [
    { id: "default", name: t("label.defaultOutfit") },
    ...(definitions?.outfitTypes ?? []).map((ot) => ({ id: ot.id, name: ot.name })),
  ];

  const emptyDefs: GameDefinitions = {
    template: { id: "", name: "", basicInfo: [], resources: [], clothingSlots: [], traits: [], abilities: [], experiences: [] },
    clothingDefs: {},
    outfitTypes: [],
    itemDefs: {},
    traitDefs: {},
    traitGroups: {},
    actionDefs: {},
    variableDefs: {},
    eventDefs: {},
    lorebookDefs: {},
    worldVariableDefs: {},
    maps: {},
    characters: {},
  };

  const editorCtx: EditorContextValue = {
    definitions: definitions ?? emptyDefs,
    targetType: targetScope === EventScope.EACH_CHARACTER ? TargetType.NPC : TargetType.NONE,
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

  return (
    <EditorProvider value={editorCtx}>
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header} style={{ marginBottom: "12px" }}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newEvent") : t("editor.editNamed", { name: event.name || event.id })} ==
        </span>
        <div className={s.btnRow}>
          <button onClick={onBack} className={btnClass("neutral")}>
            [{t("btn.return")}]
          </button>
          {!isNew && addonIds && (
            <CloneButton
              addonIds={addonIds}
              defaultAddon={event.source || ""}
              getData={() => {
                const d: Record<string, unknown> = { name, description: description || undefined, triggerMode, targetScope, conditions, effects, outputTemplate: outputTemplate || undefined, enabled };
                if (triggerMode === TriggerMode.WHILE) d.cooldown = cooldown;
                return d;
              }}
              createFn={(d) => createEventDef(d)}
              onSuccess={onBack}
              className={btnClass("neutral")}
            />
          )}
          {!isNew && (
            <button onClick={handleDelete} className={btnClass("danger")}>
              [{t("btn.delete")}]
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className={btnClass("create")}>
            {saving ? t("status.saving") : `[${t("btn.confirm")}]`}
          </button>
        </div>
      </div>

      {/* Basic fields */}
      <div className={s.fieldsColumn}>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>ID</label>
          <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew} />
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>{t("field.name")}</label>
          <input className={clsx(sh.input, sh.flex1)} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>{t("field.note")}</label>
          <input
            className={clsx(sh.input, sh.flex1)}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("ui.optional")}
          />
        </div>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>{t("field.triggerMode")}</label>
          <select
            className={sh.input}
            value={triggerMode}
            onChange={(e) => setTriggerMode(e.target.value as EventDefinition["triggerMode"])}
          >
            <option value={TriggerMode.ON_CHANGE}>{t("event.modeOnChange")}</option>
            <option value={TriggerMode.WHILE}>{t("event.modeWhile")}</option>
            <option value={TriggerMode.ONCE}>{t("event.modeOnce")}</option>
          </select>
          {triggerMode === TriggerMode.WHILE && (
            <>
              <label className={sh.textSub}>{t("field.cooldown")}</label>
              <input
                className={clsx(sh.input, sh.w60)}
                type="number"
                step={5}
                value={cooldown}
                onChange={(e) => setCooldown(Math.max(5, Math.ceil(Number(e.target.value) / 5) * 5))}
              />
            </>
          )}
          <HelpButton show={showTriggerHelp} onToggle={() => setShowTriggerHelp((v) => !v)} />
        </div>
        {showTriggerHelp && (
          <HelpPanel>
            <div className={helpStyles.helpP} style={{ marginBottom: "2px" }}>{t("help.triggerIntro")}</div>
            <div className={helpStyles.helpSub}>{t("help.onChangeTitle")}</div>
            <div className={helpStyles.helpP}>
              {t("help.onChangeDesc", { em1: t("help.onChangeEm") })}
            </div>
            <div className={helpStyles.helpDim}>{t("help.onChangeExample")}</div>
            <div className={helpStyles.helpSub}>{t("help.whileTitle")}</div>
            <div className={helpStyles.helpP}>{t("help.whileDesc")}</div>
            <div className={helpStyles.helpDim}>{t("help.whileExample")}</div>
            <div className={helpStyles.helpSub}>{t("help.onceTitle")}</div>
            <div className={helpStyles.helpP}>
              {t("help.onceDesc", { em1: t("help.onceEm") })}
            </div>
            <div className={helpStyles.helpDim}>{t("help.onceExample")}</div>
            <div className={helpStyles.helpSub}>{t("help.onChangeVsOnceTitle")}</div>
            <div className={helpStyles.helpP}>
              {t("help.onChangeVsOnceDesc", { em1: "on_change", em2: "once" })}
            </div>
          </HelpPanel>
        )}
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>{t("field.targetScope")}</label>
          <select
            className={sh.input}
            value={targetScope}
            onChange={(e) => setTargetScope(e.target.value as EventDefinition["targetScope"])}
          >
            <option value={EventScope.EACH_CHARACTER}>{t("event.scopeEach")}</option>
            <option value={EventScope.NONE}>{t("event.scopeNone")}</option>
          </select>
          <HelpButton show={showScopeHelp} onToggle={() => setShowScopeHelp((v) => !v)} />
        </div>
        {showScopeHelp && (
          <HelpPanel>
            <div className={helpStyles.helpP} style={{ marginBottom: "2px" }}>{t("help.scopeIntro")}</div>
            <div className={helpStyles.helpSub}>{t("help.eachCharTitle")}</div>
            <div className={helpStyles.helpP}>
              {t("help.eachCharDesc", { em1: t("help.eachCharEm1"), em2: t("help.eachCharEm2") })}
            </div>
            <div className={helpStyles.helpDim}>{t("help.eachCharExample")}</div>
            <div className={helpStyles.helpSub}>{t("help.noneTitle")}</div>
            <div className={helpStyles.helpP}>
              {t("help.noneDesc", { em1: t("help.noneEm1"), em2: t("help.noneEm2"), em3: t("help.noneEm3") })}
            </div>
            <div className={helpStyles.helpDim}>{t("help.noneExample")}</div>
          </HelpPanel>
        )}
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>{t("field.enabled")}</label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>
      </div>

      {/* Conditions */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-purple)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.conditionsAnd")}</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={addCondition} className={btnClass("add", "sm")}>
              [{t("btn.addCondition")}]
            </button>
            <button onClick={addOrGroup} className={btnClass("add", "sm")}>
              [{t("btn.addOr")}]
            </button>
          </div>
        </div>
        <div className={s.sectionContent}>
          {conditions.length === 0 && <div className={sh.textDim} style={{ fontSize: "12px" }}>{t("empty.noCondMatch")}</div>}
          {conditions.map((item, idx) => (
            <div
              key={idx}
              className={idx % 2 === 0 ? s.condRowOdd : s.condRowEven}
            >
              <ConditionItemEditor
                item={item}
                onChange={(newItem) => updateCondition(idx, newItem)}
                onRemove={() => removeCondition(idx)}
                disabled={false}
                depth={0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-red)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.effects")}</span>
          <button onClick={addEffect} className={btnClass("add", "sm")}>
            [{t("btn.addEffect")}]
          </button>
        </div>
        <div className={s.sectionContent}>
          {effects.length === 0 && <div className={sh.textDim} style={{ fontSize: "12px" }}>{t("empty.noEffects")}</div>}
          {effects.map((eff, idx) => (
            <div
              key={idx}
              className={idx % 2 === 0 ? s.condRowOdd : s.condRowEven}
            >
              <div className={s.effectRow}>
                <EffectFieldEditor effect={eff} onChange={(e) => updateEffect(idx, e)} />
                <button onClick={() => removeEffect(idx)} className={btnClass("del", "sm")}>
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Output template */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-green)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className={s.sectionTitleText}>{t("section.outputTpl")}</span>
            <button
              onClick={() => setShowVarHelp((v) => !v)}
              className={btnClass(showVarHelp ? "danger" : "neutral", "sm")}
            >
              [?]
            </button>
          </div>
        </div>
        <div className={s.sectionContent}>
          <input
            className={sh.input}
            style={{ width: "100%", boxSizing: "border-box" }}
            value={outputTemplate}
            onChange={(e) => setOutputTemplate(e.target.value)}
            placeholder={t("ph.outputExample")}
          />
          {showVarHelp && (
            <EventTemplateVarHelp
              resourceKeys={resourceKeys}
              abilityKeys={abilityKeys}
              basicInfoNumKeys={basicInfoNumKeys}
              traitCategories={traitCategories}
              clothingSlots={clothingSlots}
              targetScope={targetScope}
            />
          )}
        </div>
      </div>
    </div>
    </EditorProvider>
  );
}

function EffectFieldEditor({
  effect,
  onChange,
}: {
  effect: ActionEffect;
  onChange: (e: ActionEffect) => void;
}) {
  const ctx = useEditorContext();
  const update = (patch: Partial<ActionEffect>) => onChange({ ...effect, ...patch });

  return (
    <>
      <select
        className={clsx(sh.input, sh.fs11)}
        value={effect.type}
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: EffectOp.ADD })}
      >
        {EFFECT_TYPES.map((et) => (
          <option key={et.value} value={et.value}>
            {et.label}
          </option>
        ))}
      </select>

      {/* Resource / Ability / BasicInfo */}
      {(effect.type === EF.RESOURCE || effect.type === EF.ABILITY || effect.type === EF.BASIC_INFO) && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
          >
            <option value="">{t("opt.select")}</option>
            {(effect.type === EF.RESOURCE
              ? ctx.resourceKeys
              : effect.type === EF.ABILITY
                ? ctx.abilityKeys
                : ctx.basicInfoNumKeys
            ).map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
          </select>
          <input
            className={clsx(sh.input, sh.w60, sh.fs11)}
            type="number"
            value={typeof effect.value === "number" ? effect.value : 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
          />
        </>
      )}

      {/* Favorability */}
      {effect.type === EF.FAVORABILITY && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
          </select>
          <input
            className={clsx(sh.input, sh.w60, sh.fs11)}
            type="number"
            value={typeof effect.value === "number" ? effect.value : 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
          />
        </>
      )}

      {/* Trait */}
      {effect.type === EF.TRAIT && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.add")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.remove")}</option>
          </select>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
          >
            <option value="">{t("opt.category")}</option>
            {ctx.traitCategories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.traitId ?? ""}
            onChange={(e) => update({ traitId: e.target.value })}
          >
            <option value="">{t("opt.selectTrait")}</option>
            {ctx.traitList
              .filter((tr) => !effect.key || tr.category === effect.key)
              .map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
          </select>
        </>
      )}

      {/* Item */}
      {effect.type === EF.ITEM && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.give")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.remove")}</option>
          </select>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value })}
          >
            <option value="">{t("opt.selectItem")}</option>
            {ctx.itemList.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            className={clsx(sh.input, sh.fs11)}
            style={{ width: "40px" }}
            type="number"
            value={effect.amount ?? 1}
            onChange={(e) => update({ amount: Number(e.target.value) })}
          />
        </>
      )}

      {/* Clothing */}
      {effect.type === EF.CLOTHING && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })}
          >
            <option value="">{t("opt.slot")}</option>
            {ctx.clothingSlots.map((sl) => (
              <option key={sl} value={sl}>
                {SLOT_LABELS[sl] ?? sl}
              </option>
            ))}
          </select>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.state ?? ClothingState.WORN}
            onChange={(e) => update({ state: e.target.value })}
          >
            <option value={ClothingState.WORN}>{t("clothingState.worn")}</option>
            <option value={ClothingState.HALF_WORN}>{t("clothingState.halfWorn")}</option>
            <option value={ClothingState.OFF}>{t("clothingState.off")}</option>
            <option value={ClothingState.EMPTY}>{t("clothingState.empty")}</option>
          </select>
        </>
      )}

      {/* Position */}
      {effect.type === EffType.POSITION && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.mapId ?? ""}
            onChange={(e) => update({ mapId: e.target.value })}
          >
            <option value="">{t("opt.selectMap")}</option>
            {ctx.mapList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {effect.mapId && (
            <select
              className={clsx(sh.input, sh.fs11)}
              value={effect.cellId ?? ""}
              onChange={(e) => update({ cellId: Number(e.target.value) })}
            >
              <option value="">{t("opt.selectCell")}</option>
              {(ctx.mapList.find((m) => m.id === effect.mapId)?.cells ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || `#${c.id}`}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      {/* Experience */}
      {effect.type === EF.EXPERIENCE && (
        <>
          <input
            className={clsx(sh.input, sh.w80, sh.fs11)}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            placeholder={t("ph.expKey")}
          />
          <input
            className={clsx(sh.input, sh.fs11)}
            style={{ width: "40px" }}
            type="number"
            value={typeof effect.value === "number" ? effect.value : 1}
            onChange={(e) => update({ value: Number(e.target.value) })}
          />
        </>
      )}

      {/* WorldVar */}
      {effect.type === EF.WORLD_VAR && (
        <>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
          >
            <option value="">{t("opt.selectWorldVar")}</option>
            {ctx.worldVarList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            className={clsx(sh.input, sh.fs11)}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
          </select>
          <input
            className={clsx(sh.input, sh.w60, sh.fs11)}
            type="number"
            value={typeof effect.value === "number" ? effect.value : 0}
            onChange={(e) => update({ value: Number(e.target.value) })}
          />
        </>
      )}
    </>
  );
}

// (Help panels moved to HelpToggle component)

// ─── Event template variable help panel ───

function EventTemplateVarHelp({
  resourceKeys,
  abilityKeys,
  basicInfoNumKeys,
  traitCategories,
  clothingSlots,
  targetScope,
}: {
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  targetScope: string;
}) {
  const row = (v: string, desc: string) => (
    <div key={v} className={s.tplVarRow}>
      <span className={s.tplVarName}>{`{{${v}}}`}</span>
      <span className={s.tplVarDesc}>{desc}</span>
    </div>
  );

  const isNone = targetScope === EventScope.NONE;

  return (
    <div className={s.tplHelpBox}>
      <div className={s.tplHelpTitle}>
        {isNone ? t("help.availVarsNone") : t("help.availVarsSelf")}
      </div>

      {row("time", t("help.varTime"))}
      {row("weather", t("help.varWeather"))}
      {row("effects", t("help.varEffects"))}

      {!isNone && (
        <>
          {row("self", t("help.varSelf"))}
          {row("location", t("help.varLocation"))}

          <div className={s.tplCategory}>{t("help.catResource")}</div>
          {resourceKeys.map((r) => row(`self.resource.${r.key}`, r.label))}

          <div className={s.tplCategory}>{t("help.catAbility")}</div>
          {abilityKeys.map((a) => row(`self.ability.${a.key}`, t("help.abilityLevel", { label: a.label })))}

          <div className={s.tplCategory}>{t("help.catBasicInfo")}</div>
          {basicInfoNumKeys.map((b) => row(`self.basicInfo.${b.key}`, b.label))}

          <div className={s.tplCategory}>{t("help.catClothing")}</div>
          {clothingSlots.map((sl) => row(`self.clothing.${sl}`, t("help.slotClothing", { slot: sl })))}

          <div className={s.tplCategory}>{t("help.catTrait")}</div>
          {traitCategories.map((tc) => row(`self.trait.${tc.key}`, t("help.traitValue", { label: tc.label })))}
        </>
      )}
    </div>
  );
}
