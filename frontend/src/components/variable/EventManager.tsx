import { useState, useEffect, useCallback } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { EF, EffType, EffectOp, ClothingState, TriggerMode, EventScope, TargetType } from "../../constants";
import { HelpButton, HelpPanel, helpSub, helpP, helpEm, helpDim } from "../shared/HelpToggle";
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
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { EditorProvider, useEditorContext } from "../shared/EditorContext";
import type { EditorContextValue, KeyLabel } from "../shared/EditorContext";
import { ConditionItemEditor, SLOT_LABELS } from "../shared/ConditionEditor";
import { inputStyle, addBtnStyle, delBtnStyle, rowBg } from "../shared/styles";
import { toLocalId } from "../shared/idUtils";

// ── Styles ──────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  padding: "3px 10px",
  backgroundColor: T.bg2,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "11px",
  color: T.text,
};

const SEC = {
  cond: { color: "#c78dff", bg: "#c78dff0a" },
  eff: { color: "#e94560", bg: "#e945600a" },
  tpl: { color: "#7ecf7e", bg: "#7ecf7e0a" },
};

const sectionStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  marginBottom: "12px",
  padding: "0 0 8px 0",
  borderLeft: `3px solid ${SEC[sec].color}`,
  backgroundColor: SEC[sec].bg,
  borderRadius: "0 4px 4px 0",
});

const sectionTitleStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  padding: "5px 10px",
  marginBottom: "8px",
  backgroundColor: `${SEC[sec].color}15`,
  borderBottom: `1px solid ${SEC[sec].color}25`,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

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

const hoverStyles = `
  .em-item:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .em-action-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
`;

// ── Main ────────────────────────────────────────────────

export default function EventManager({
  selectedAddon,
  onEditingChange,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [events, setEvents] = useState<EventDefinition[]>([]);
  const [worldVars, setWorldVars] = useState<WorldVariableDefinition[]>([]);
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"event" | "worldVar">("event");
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    onEditingChange?.(editingId !== null);
  }, [editingId, onEditingChange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [evtList, wvList, defs] = await Promise.all([fetchEventDefs(), fetchWorldVariableDefs(), fetchDefinitions()]);
    setEvents(evtList);
    setWorldVars(wvList);
    setDefinitions(defs);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditEvent = (id: string) => {
    setEditingType("event");
    setIsNew(false);
    setEditingId(id);
  };
  const handleNewEvent = () => {
    setEditingType("event");
    setIsNew(true);
    setEditingId("__new__");
  };
  const handleEditWV = (id: string) => {
    setEditingType("worldVar");
    setIsNew(false);
    setEditingId(id);
  };
  const handleNewWV = () => {
    setEditingType("worldVar");
    setIsNew(true);
    setEditingId("__new__");
  };
  const handleBack = () => {
    setEditingId(null);
    setIsNew(false);
    loadData();
  };

  const readOnly = selectedAddon === null;
  const filteredEvents = selectedAddon ? events.filter((e) => e.source === selectedAddon) : events;
  const filteredWVs = selectedAddon ? worldVars.filter((v) => v.source === selectedAddon) : worldVars;

  if (loading) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
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
      return <WorldVarEditor variable={isNew ? blank : (existing ?? blank)} isNew={isNew} onBack={handleBack} />;
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
      />
    );
  }

  // ── List view ──
  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <style>{hoverStyles}</style>

      {/* == 世界变量 == */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.worldVars")} ==</span>
        {!readOnly && (
          <button
            className="em-action-btn"
            onClick={handleNewWV}
            style={{
              padding: "4px 12px",
              backgroundColor: T.bg2,
              color: T.successDim,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            [{t("btn.addVar")}]
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "16px" }}>
        {filteredWVs.map((v) => (
          <button
            key={v.id}
            className="em-item"
            onClick={() => handleEditWV(v.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              padding: "5px 12px",
              backgroundColor: T.bg1,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "12px",
              textAlign: "left",
            }}
          >
            <span style={{ color: T.text }}>{v.name || v.id}</span>
            <span style={{ color: T.textDim, fontSize: "11px" }}>{v.type}</span>
            <span style={{ color: T.textDim, fontSize: "11px" }}>{t("event.default", { value: String(v.default) })}</span>
          </button>
        ))}
        {filteredWVs.length === 0 && (
          <div style={{ color: T.textDim, padding: "4px 0", fontSize: "11px" }}>{t("empty.worldVars")}</div>
        )}
      </div>

      {/* == 全局事件 == */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.globalEvents")} ==</span>
        {!readOnly && (
          <button
            className="em-action-btn"
            onClick={handleNewEvent}
            style={{
              padding: "4px 12px",
              backgroundColor: T.bg2,
              color: T.successDim,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            [{t("btn.newEvent")}]
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {filteredEvents.map((evt) => {
          const modeLabel =
            evt.triggerMode === TriggerMode.ON_CHANGE ? t("event.onChangeShort") : evt.triggerMode === TriggerMode.WHILE ? t("event.whileShort") : t("event.onceShort");
          const scopeLabel = evt.targetScope === EventScope.EACH_CHARACTER ? t("event.eachCharShort") : t("event.noTargetShort");
          return (
            <button
              key={evt.id}
              className="em-item"
              onClick={() => handleEditEvent(evt.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "5px 12px",
                backgroundColor: T.bg1,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
                textAlign: "left",
              }}
            >
              <span style={{ color: T.text }}>{evt.name || evt.id}</span>
              <span style={{ color: "#c78dff", fontSize: "11px" }}>{modeLabel}</span>
              <span style={{ color: T.textDim, fontSize: "11px" }}>{scopeLabel}</span>
              {evt.enabled === false && <span style={{ color: T.danger, fontSize: "11px" }}>[{t("event.disabled")}]</span>}
            </button>
          );
        })}
        {filteredEvents.length === 0 && (
          <div style={{ color: T.textDim, padding: "4px 0", fontSize: "11px" }}>{t("empty.globalEvents")}</div>
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
}: {
  variable: WorldVariableDefinition;
  isNew: boolean;
  onBack: () => void;
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
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newWorldVar") : t("editor.editNamed", { name: variable.name || variable.id })} ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>
            [{t("btn.return")}]
          </button>
          {!isNew && (
            <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>
              [{t("btn.delete")}]
            </button>
          )}
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            {saving ? t("status.saving") : `[${t("btn.confirm")}]`}
          </button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>ID</label>
          <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>{t("field.name")}</label>
          <input style={{ ...inputStyle, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>{t("field.note")}</label>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("ui.optional")}
          />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>{t("field.type")}</label>
          <select
            style={{ ...inputStyle }}
            value={type}
            onChange={(e) => setType(e.target.value as "number" | "boolean")}
          >
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>{t("field.defaultValue")}</label>
          <input
            style={{ ...inputStyle, width: "80px" }}
            type="number"
            value={defaultVal}
            onChange={(e) => setDefaultVal(Number(e.target.value))}
          />
          {type === "boolean" && <span style={{ color: T.textDim, fontSize: "11px" }}>{t("event.boolHelp")}</span>}
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
}: {
  event: EventDefinition;
  isNew: boolean;
  definitions: GameDefinitions | null;
  worldVars: WorldVariableDefinition[];
  onBack: () => void;
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
  const traitCategories = definitions?.template.traits?.map((t) => ({ key: t.key, label: t.label })) ?? [];
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
    ...(definitions?.outfitTypes ?? []).map((t) => ({ id: t.id, name: t.name })),
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
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newEvent") : t("editor.editNamed", { name: event.name || event.id })} ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>
            [{t("btn.return")}]
          </button>
          {!isNew && (
            <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>
              [{t("btn.delete")}]
            </button>
          )}
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            {saving ? t("status.saving") : `[${t("btn.confirm")}]`}
          </button>
        </div>
      </div>

      {/* Basic fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>ID</label>
          <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>{t("field.name")}</label>
          <input style={{ ...inputStyle, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>{t("field.note")}</label>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("ui.optional")}
          />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>{t("field.triggerMode")}</label>
          <select
            style={inputStyle}
            value={triggerMode}
            onChange={(e) => setTriggerMode(e.target.value as EventDefinition["triggerMode"])}
          >
            <option value={TriggerMode.ON_CHANGE}>{t("event.modeOnChange")}</option>
            <option value={TriggerMode.WHILE}>{t("event.modeWhile")}</option>
            <option value={TriggerMode.ONCE}>{t("event.modeOnce")}</option>
          </select>
          {triggerMode === TriggerMode.WHILE && (
            <>
              <label style={{ color: T.textSub, fontSize: "11px" }}>{t("field.cooldown")}</label>
              <input
                style={{ ...inputStyle, width: "60px" }}
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
            <div style={{ ...helpP, marginBottom: "2px" }}>{t("help.triggerIntro")}</div>
            <div style={helpSub}>{t("help.onChangeTitle")}</div>
            <div style={helpP}>
              {t("help.onChangeDesc", { em1: t("help.onChangeEm") })}
            </div>
            <div style={helpDim}>{t("help.onChangeExample")}</div>
            <div style={helpSub}>{t("help.whileTitle")}</div>
            <div style={helpP}>{t("help.whileDesc")}</div>
            <div style={helpDim}>{t("help.whileExample")}</div>
            <div style={helpSub}>{t("help.onceTitle")}</div>
            <div style={helpP}>
              {t("help.onceDesc", { em1: t("help.onceEm") })}
            </div>
            <div style={helpDim}>{t("help.onceExample")}</div>
            <div style={helpSub}>{t("help.onChangeVsOnceTitle")}</div>
            <div style={helpP}>
              {t("help.onChangeVsOnceDesc", { em1: "on_change", em2: "once" })}
            </div>
          </HelpPanel>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>{t("field.targetScope")}</label>
          <select
            style={inputStyle}
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
            <div style={{ ...helpP, marginBottom: "2px" }}>{t("help.scopeIntro")}</div>
            <div style={helpSub}>{t("help.eachCharTitle")}</div>
            <div style={helpP}>
              {t("help.eachCharDesc", { em1: t("help.eachCharEm1"), em2: t("help.eachCharEm2") })}
            </div>
            <div style={helpDim}>{t("help.eachCharExample")}</div>
            <div style={helpSub}>{t("help.noneTitle")}</div>
            <div style={helpP}>
              {t("help.noneDesc", { em1: t("help.noneEm1"), em2: t("help.noneEm2"), em3: t("help.noneEm3") })}
            </div>
            <div style={helpDim}>{t("help.noneExample")}</div>
          </HelpPanel>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>{t("field.enabled")}</label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>
      </div>

      {/* Conditions */}
      <div style={sectionStyle("cond")}>
        <div style={sectionTitleStyle("cond")}>
          <span style={{ color: SEC.cond.color, fontSize: "12px", fontWeight: "bold" }}>{t("section.conditionsAnd")}</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={addCondition} style={addBtnStyle}>
              [{t("btn.addCondition")}]
            </button>
            <button onClick={addOrGroup} style={addBtnStyle}>
              [{t("btn.addOr")}]
            </button>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          {conditions.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>{t("empty.noCondMatch")}</div>}
          {conditions.map((item, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: rowBg(idx),
                padding: "3px 4px",
                borderRadius: "2px",
                borderBottom: idx < conditions.length - 1 ? `1px solid ${T.borderDim}` : "none",
              }}
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
      <div style={sectionStyle("eff")}>
        <div style={sectionTitleStyle("eff")}>
          <span style={{ color: SEC.eff.color, fontSize: "12px", fontWeight: "bold" }}>{t("section.effects")}</span>
          <button onClick={addEffect} style={addBtnStyle}>
            [{t("btn.addEffect")}]
          </button>
        </div>
        <div style={{ padding: "0 8px" }}>
          {effects.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>{t("empty.noEffects")}</div>}
          {effects.map((eff, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: rowBg(idx),
                padding: "3px 4px",
                borderRadius: "2px",
                borderBottom: idx < effects.length - 1 ? `1px solid ${T.borderDim}` : "none",
              }}
            >
              <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                <EffectFieldEditor effect={eff} onChange={(e) => updateEffect(idx, e)} />
                <button onClick={() => removeEffect(idx)} style={delBtnStyle}>
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Output template */}
      <div style={sectionStyle("tpl")}>
        <div style={sectionTitleStyle("tpl")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: SEC.tpl.color, fontSize: "12px", fontWeight: "bold" }}>{t("section.outputTpl")}</span>
            <button
              onClick={() => setShowVarHelp((v) => !v)}
              style={{ ...btnBase, color: showVarHelp ? T.danger : T.textSub, fontSize: "11px" }}
            >
              [?]
            </button>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
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
        style={{ ...inputStyle, fontSize: "11px" }}
        value={effect.type}
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: EffectOp.ADD })}
      >
        {EFFECT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Resource / Ability / BasicInfo */}
      {(effect.type === EF.RESOURCE || effect.type === EF.ABILITY || effect.type === EF.BASIC_INFO) && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
          </select>
          <input
            style={{ ...inputStyle, width: "60px", fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
          </select>
          <input
            style={{ ...inputStyle, width: "60px", fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.add")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.remove")}</option>
          </select>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.traitId ?? ""}
            onChange={(e) => update({ traitId: e.target.value })}
          >
            <option value="">{t("opt.selectTrait")}</option>
            {ctx.traitList
              .filter((t) => !effect.key || t.category === effect.key)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </>
      )}

      {/* Item */}
      {effect.type === EF.ITEM && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.ADD}>{t("effOp.give")}</option>
            <option value={EffectOp.REMOVE}>{t("effOp.remove")}</option>
          </select>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
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
            style={{ ...inputStyle, width: "40px", fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })}
          >
            <option value="">{t("opt.slot")}</option>
            {ctx.clothingSlots.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
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
              style={{ ...inputStyle, fontSize: "11px" }}
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
            style={{ ...inputStyle, width: "80px", fontSize: "11px" }}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            placeholder={t("ph.expKey")}
          />
          <input
            style={{ ...inputStyle, width: "40px", fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
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
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value={EffectOp.SET}>{t("effOp.setTo")}</option>
            <option value={EffectOp.ADD}>{t("effOp.increase")}</option>
          </select>
          <input
            style={{ ...inputStyle, width: "60px", fontSize: "11px" }}
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
  const s: React.CSSProperties = { color: "#0ff", fontSize: "11px" };
  const d: React.CSSProperties = { color: T.textSub, fontSize: "11px" };
  const cat: React.CSSProperties = {
    color: "#e9a045",
    fontSize: "11px",
    fontWeight: "bold",
    marginTop: "6px",
    marginBottom: "2px",
  };
  const row = (v: string, desc: string) => (
    <div key={v} style={{ display: "flex", gap: "8px", marginBottom: "1px" }}>
      <span style={{ ...s, minWidth: "220px" }}>{`{{${v}}}`}</span>
      <span style={d}>{desc}</span>
    </div>
  );

  const isNone = targetScope === EventScope.NONE;

  return (
    <div
      style={{
        marginTop: "6px",
        padding: "8px",
        backgroundColor: T.bg3,
        border: `1px solid ${T.border}`,
        borderRadius: "3px",
        maxHeight: "300px",
        overflowY: "auto",
      }}
    >
      <div style={{ color: T.accent, fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>
        {isNone ? t("help.availVarsNone") : t("help.availVarsSelf")}
      </div>

      {row("time", t("help.varTime"))}
      {row("weather", t("help.varWeather"))}
      {row("effects", t("help.varEffects"))}

      {!isNone && (
        <>
          {row("self", t("help.varSelf"))}
          {row("location", t("help.varLocation"))}

          <div style={cat}>{t("help.catResource")}</div>
          {resourceKeys.map((r) => row(`self.resource.${r.key}`, r.label))}

          <div style={cat}>{t("help.catAbility")}</div>
          {abilityKeys.map((a) => row(`self.ability.${a.key}`, t("help.abilityLevel", { label: a.label })))}

          <div style={cat}>{t("help.catBasicInfo")}</div>
          {basicInfoNumKeys.map((b) => row(`self.basicInfo.${b.key}`, b.label))}

          <div style={cat}>{t("help.catClothing")}</div>
          {clothingSlots.map((sl) => row(`self.clothing.${sl}`, t("help.slotClothing", { slot: sl })))}

          <div style={cat}>{t("help.catTrait")}</div>
          {traitCategories.map((tc) => row(`self.trait.${tc.key}`, t("help.traitValue", { label: tc.label })))}
        </>
      )}
    </div>
  );
}
