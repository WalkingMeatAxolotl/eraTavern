import { useState, useEffect, useCallback } from "react";
import T from "../../theme";
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
import { ConditionItemEditor, inputStyle, addBtnStyle, delBtnStyle, SLOT_LABELS } from "../shared/ConditionEditor";

function toLocalId(nsId: string): string {
  const dot = nsId.indexOf(".");
  return dot >= 0 ? nsId.slice(dot + 1) : nsId;
}

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

const rowBg = (idx: number) => (idx % 2 === 0 ? T.bg1 : T.bg2);

const EFFECT_TYPES: { value: ActionEffect["type"]; label: string }[] = [
  { value: "resource", label: "资源" },
  { value: "ability", label: "能力(经验值)" },
  { value: "experience", label: "经历记录" },
  { value: "basicInfo", label: "基本属性" },
  { value: "favorability", label: "好感度" },
  { value: "trait", label: "特质" },
  { value: "item", label: "物品" },
  { value: "clothing", label: "服装" },
  { value: "position", label: "位置" },
  { value: "worldVar", label: "世界变量" },
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
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>加载中...</div>;
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
      triggerMode: "on_change",
      targetScope: "each_character",
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
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== 世界变量 ==</span>
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
            [+ 添加变量]
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
            <span style={{ color: T.textDim, fontSize: "11px" }}>默认: {v.default}</span>
          </button>
        ))}
        {filteredWVs.length === 0 && (
          <div style={{ color: T.textDim, padding: "4px 0", fontSize: "11px" }}>暂无世界变量</div>
        )}
      </div>

      {/* == 全局事件 == */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== 全局事件 ==</span>
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
            [+ 新建事件]
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {filteredEvents.map((evt) => {
          const modeLabel =
            evt.triggerMode === "on_change" ? "变化触发" : evt.triggerMode === "while" ? "持续触发" : "一次性";
          const scopeLabel = evt.targetScope === "each_character" ? "每个角色" : "无目标";
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
              {evt.enabled === false && <span style={{ color: T.danger, fontSize: "11px" }}>[禁用]</span>}
            </button>
          );
        })}
        {filteredEvents.length === 0 && (
          <div style={{ color: T.textDim, padding: "4px 0", fontSize: "11px" }}>暂无全局事件</div>
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
    if (!confirm("确定删除此世界变量？")) return;
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
          == {isNew ? "新建世界变量" : `编辑: ${variable.name || variable.id}`} ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>
            [返回]
          </button>
          {!isNew && (
            <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>
              [删除]
            </button>
          )}
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            {saving ? "保存中..." : "[确定]"}
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
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>名称</label>
          <input style={{ ...inputStyle, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>说明</label>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选"
          />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>类型</label>
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
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>默认值</label>
          <input
            style={{ ...inputStyle, width: "80px" }}
            type="number"
            value={defaultVal}
            onChange={(e) => setDefaultVal(Number(e.target.value))}
          />
          {type === "boolean" && <span style={{ color: T.textDim, fontSize: "11px" }}>0 = false, 1 = true</span>}
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
      if (triggerMode === "while") data.cooldown = cooldown;
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
    if (!confirm("确定删除此事件？")) return;
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
  const addEffect = () => setEffects([...effects, { type: "resource", op: "add" } as ActionEffect]);
  const updateEffect = (idx: number, eff: ActionEffect) => {
    const next = [...effects];
    next[idx] = eff;
    setEffects(next);
  };
  const removeEffect = (idx: number) => setEffects(effects.filter((_, i) => i !== idx));

  const outfitTypes = [
    { id: "default", name: "默认服装" },
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
    targetType: targetScope === "each_character" ? "npc" : "none",
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
          == {isNew ? "新建事件" : `编辑: ${event.name || event.id}`} ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>
            [返回]
          </button>
          {!isNew && (
            <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>
              [删除]
            </button>
          )}
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            {saving ? "保存中..." : "[确定]"}
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
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>名称</label>
          <input style={{ ...inputStyle, flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>说明</label>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选"
          />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>触发模式</label>
          <select
            style={inputStyle}
            value={triggerMode}
            onChange={(e) => setTriggerMode(e.target.value as EventDefinition["triggerMode"])}
          >
            <option value="on_change">on_change (变化触发)</option>
            <option value="while">while (持续触发)</option>
            <option value="once">once (一次性)</option>
          </select>
          {triggerMode === "while" && (
            <>
              <label style={{ color: T.textSub, fontSize: "11px" }}>冷却(分钟)</label>
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
            <div style={{ ...helpP, marginBottom: "2px" }}>控制事件在条件满足时何时触发。</div>
            <div style={helpSub}>on_change — 变化触发</div>
            <div style={helpP}>
              条件从 <span style={helpEm}>不满足 → 满足</span>{" "}
              的瞬间触发一次。条件持续满足期间不会重复触发，必须先变回不满足、再次满足时才会再次触发。
            </div>
            <div style={helpDim}>适合"进入某状态时"的事件。例：好感度首次达到 50 时触发特殊对话。</div>
            <div style={helpSub}>while — 持续触发</div>
            <div style={helpP}>每次检查时只要条件满足就触发，受冷却时间（分钟）限制避免过于频繁。</div>
            <div style={helpDim}>适合持续性效果。例：天气为雨天时，每 10 分钟所有人心情 -1。</div>
            <div style={helpSub}>once — 一次性</div>
            <div style={helpP}>
              条件满足时触发 <span style={helpEm}>一次</span> 后永久标记为已完成，之后不会再触发。
            </div>
            <div style={helpDim}>适合一次性剧情事件。例：第一次击败 Boss 后解锁新区域。</div>
            <div style={helpSub}>on_change vs once 的区别</div>
            <div style={helpP}>
              <span style={helpEm}>on_change</span> 在条件恢复不满足后可以再次触发（多次），
              <span style={helpEm}>once</span> 触发后永远不再触发（仅一次）。
            </div>
          </HelpPanel>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>目标范围</label>
          <select
            style={inputStyle}
            value={targetScope}
            onChange={(e) => setTargetScope(e.target.value as EventDefinition["targetScope"])}
          >
            <option value="each_character">each_character (每个角色)</option>
            <option value="none">none (无目标)</option>
          </select>
          <HelpButton show={showScopeHelp} onToggle={() => setShowScopeHelp((v) => !v)} />
        </div>
        {showScopeHelp && (
          <HelpPanel>
            <div style={{ ...helpP, marginBottom: "2px" }}>控制事件对谁评估和执行效果。</div>
            <div style={helpSub}>each_character — 每个角色</div>
            <div style={helpP}>
              对每个角色 <span style={helpEm}>分别</span> 评估条件、分别执行效果。效果中的{" "}
              <span style={helpEm}>self</span> 指当前被评估的角色。
            </div>
            <div style={helpDim}>例：任何角色 HP 低于 10 时自动获得特质"濒死"——每个角色独立判断。</div>
            <div style={helpSub}>none — 无目标</div>
            <div style={helpP}>
              无角色上下文，仅在玩家行动后评估一次。条件只能使用 <span style={helpEm}>世界变量</span>、
              <span style={helpEm}>时间</span> 等全局条件，效果只能修改 <span style={helpEm}>世界变量</span>。
            </div>
            <div style={helpDim}>例：当世界变量 tavern_open = 1 时，设置 customers_arriving = 1。</div>
          </HelpPanel>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>启用</label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </div>
      </div>

      {/* Conditions */}
      <div style={sectionStyle("cond")}>
        <div style={sectionTitleStyle("cond")}>
          <span style={{ color: SEC.cond.color, fontSize: "12px", fontWeight: "bold" }}>条件 (AND)</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={addCondition} style={addBtnStyle}>
              [+ 条件]
            </button>
            <button onClick={addOrGroup} style={addBtnStyle}>
              [+ OR]
            </button>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          {conditions.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>无条件（始终满足）</div>}
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
          <span style={{ color: SEC.eff.color, fontSize: "12px", fontWeight: "bold" }}>效果</span>
          <button onClick={addEffect} style={addBtnStyle}>
            [+ 效果]
          </button>
        </div>
        <div style={{ padding: "0 8px" }}>
          {effects.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>无效果</div>}
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
            <span style={{ color: SEC.tpl.color, fontSize: "12px", fontWeight: "bold" }}>输出模板</span>
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
            placeholder="例: {{self.name}} 踩到了陷阱！"
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
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: "add" })}
      >
        {EFFECT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Resource / Ability / BasicInfo */}
      {(effect.type === "resource" || effect.type === "ability" || effect.type === "basicInfo") && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
          >
            <option value="">选择</option>
            {(effect.type === "resource"
              ? ctx.resourceKeys
              : effect.type === "ability"
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
            <option value="add">增加</option>
            <option value="set">设为</option>
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
      {effect.type === "favorability" && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value="add">增加</option>
            <option value="set">设为</option>
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
      {effect.type === "trait" && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value="add">添加</option>
            <option value="remove">移除</option>
          </select>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
          >
            <option value="">分类</option>
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
            <option value="">特质</option>
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
      {effect.type === "item" && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.op}
            onChange={(e) => update({ op: e.target.value })}
          >
            <option value="add">给予</option>
            <option value="remove">移除</option>
          </select>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value })}
          >
            <option value="">选择物品</option>
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
      {effect.type === "clothing" && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })}
          >
            <option value="">槽位</option>
            {ctx.clothingSlots.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.state ?? "worn"}
            onChange={(e) => update({ state: e.target.value })}
          >
            <option value="worn">穿着</option>
            <option value="halfWorn">半穿</option>
            <option value="off">脱下</option>
            <option value="empty">无衣物</option>
          </select>
        </>
      )}

      {/* Position */}
      {effect.type === "position" && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.mapId ?? ""}
            onChange={(e) => update({ mapId: e.target.value })}
          >
            <option value="">选择地图</option>
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
              <option value="">选择格子</option>
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
      {effect.type === "experience" && (
        <>
          <input
            style={{ ...inputStyle, width: "80px", fontSize: "11px" }}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
            placeholder="经验key"
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
      {effect.type === "worldVar" && (
        <>
          <select
            style={{ ...inputStyle, fontSize: "11px" }}
            value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })}
          >
            <option value="">选择世界变量</option>
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
            <option value="set">设为</option>
            <option value="add">增加</option>
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

  const isNone = targetScope === "none";

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
        可用变量 {isNone ? "(目标范围为 none，无角色上下文，self/target 变量不可用)" : "(self = 当前评估的角色)"}
      </div>

      {row("time", "当前游戏时间")}
      {row("weather", "当前天气")}
      {row("effects", "效果摘要")}

      {!isNone && (
        <>
          {row("self", "当前角色名称 (= self.name)")}
          {row("location", "当前角色所在地点")}

          <div style={cat}>资源 (self.resource.X)</div>
          {resourceKeys.map((r) => row(`self.resource.${r.key}`, r.label))}

          <div style={cat}>能力 (self.ability.X = 等级, self.abilityExp.X = 经验值)</div>
          {abilityKeys.map((a) => row(`self.ability.${a.key}`, `${a.label} 等级`))}

          <div style={cat}>基本属性 (self.basicInfo.X)</div>
          {basicInfoNumKeys.map((b) => row(`self.basicInfo.${b.key}`, b.label))}

          <div style={cat}>服装 (self.clothing.X)</div>
          {clothingSlots.map((sl) => row(`self.clothing.${sl}`, `${sl} 槽位衣物名`))}

          <div style={cat}>特质 (self.trait.X)</div>
          {traitCategories.map((t) => row(`self.trait.${t.key}`, `${t.label} 值`))}
        </>
      )}
    </div>
  );
}
