import { useState, useEffect, useCallback } from "react";
import T from "../theme";
import type {
  EventDefinition, WorldVariableDefinition, GameDefinitions,
  ActionCondition, ConditionItem, ActionEffect,
} from "../types/game";
import {
  fetchEventDefs, createEventDef, saveEventDef, deleteEventDef,
  fetchWorldVariableDefs, createWorldVariableDef, saveWorldVariableDef, deleteWorldVariableDef,
  fetchDefinitions,
} from "../api/client";

// ── Styles ──────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "4px 8px", backgroundColor: T.bg3, color: T.text,
  border: `1px solid ${T.borderLight}`, borderRadius: "3px", fontSize: "12px",
  outline: "none",
};

const btnBase: React.CSSProperties = {
  padding: "3px 10px", backgroundColor: T.bg2, border: `1px solid ${T.border}`,
  borderRadius: "3px", cursor: "pointer", fontSize: "11px", color: T.text,
};

const addBtnStyle: React.CSSProperties = {
  padding: "2px 8px", backgroundColor: "#0a1a0a", color: T.successDim,
  border: "1px solid #2a4a2a", borderRadius: "3px", cursor: "pointer", fontSize: "11px",
};

const delBtnStyle: React.CSSProperties = {
  padding: "2px 8px", backgroundColor: "#1a0808", color: T.danger,
  border: "1px solid #3a2a2a", borderRadius: "3px", cursor: "pointer", fontSize: "11px",
};

const SEC = {
  cond: { color: "#c78dff", bg: "#c78dff0a" },
  eff: { color: "#e94560", bg: "#e945600a" },
  tpl: { color: "#7ecf7e", bg: "#7ecf7e0a" },
};

const sectionStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  marginBottom: "12px", padding: "0 0 8px 0",
  borderLeft: `3px solid ${SEC[sec].color}`, backgroundColor: SEC[sec].bg,
  borderRadius: "0 4px 4px 0",
});

const sectionTitleStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  padding: "5px 10px", marginBottom: "8px",
  backgroundColor: `${SEC[sec].color}15`, borderBottom: `1px solid ${SEC[sec].color}25`,
  display: "flex", justifyContent: "space-between", alignItems: "center",
});

const rowBg = (idx: number) => idx % 2 === 0 ? T.bg1 : T.bg2;

const CONDITION_TYPES: { value: ActionCondition["type"]; label: string }[] = [
  { value: "location", label: "地点" },
  { value: "npcPresent", label: "NPC在场" },
  { value: "resource", label: "资源" },
  { value: "ability", label: "能力" },
  { value: "trait", label: "持有特质" },
  { value: "noTrait", label: "无特质" },
  { value: "favorability", label: "好感度" },
  { value: "hasItem", label: "持有物品" },
  { value: "clothing", label: "服装状态" },
  { value: "time", label: "时间" },
  { value: "basicInfo", label: "基本属性" },
  { value: "variable", label: "派生变量" },
  { value: "worldVar", label: "世界变量" },
];

const EFFECT_TYPES: { value: ActionEffect["type"]; label: string }[] = [
  { value: "resource", label: "资源" },
  { value: "ability", label: "能力" },
  { value: "experience", label: "经验" },
  { value: "basicInfo", label: "基本属性" },
  { value: "favorability", label: "好感度" },
  { value: "trait", label: "特质" },
  { value: "item", label: "物品" },
  { value: "clothing", label: "服装" },
  { value: "position", label: "位置" },
  { value: "worldVar", label: "世界变量" },
];

const OPS = [">=", "<=", ">", "<", "==", "!="];

const hoverStyles = `
  .em-item:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .em-action-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
`;

// ── Helpers ─────────────────────────────────────────────

function isAndGroup(item: ConditionItem): item is { and: ConditionItem[] } {
  return "and" in item && !("type" in item);
}
function isOrGroup(item: ConditionItem): item is { or: ConditionItem[] } {
  return "or" in item && !("type" in item);
}

// ── Main ────────────────────────────────────────────────

export default function EventManager({ selectedAddon, onEditingChange }: {
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

  useEffect(() => { onEditingChange?.(editingId !== null); }, [editingId, onEditingChange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [evtList, wvList, defs] = await Promise.all([
      fetchEventDefs(), fetchWorldVariableDefs(), fetchDefinitions(),
    ]);
    setEvents(evtList);
    setWorldVars(wvList);
    setDefinitions(defs);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEditEvent = (id: string) => { setEditingType("event"); setIsNew(false); setEditingId(id); };
  const handleNewEvent = () => { setEditingType("event"); setIsNew(true); setEditingId("__new__"); };
  const handleEditWV = (id: string) => { setEditingType("worldVar"); setIsNew(false); setEditingId(id); };
  const handleNewWV = () => { setEditingType("worldVar"); setIsNew(true); setEditingId("__new__"); };
  const handleBack = () => { setEditingId(null); setIsNew(false); loadData(); };

  const readOnly = selectedAddon === null;
  const filteredEvents = selectedAddon ? events.filter(e => e.source === selectedAddon) : events;
  const filteredWVs = selectedAddon ? worldVars.filter(v => v.source === selectedAddon) : worldVars;

  if (loading) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>加载中...</div>;
  }

  // ── Editor view ──
  if (editingId !== null) {
    if (editingType === "worldVar") {
      const existing = worldVars.find(v => v.id === editingId);
      const blank: WorldVariableDefinition = {
        id: "", name: "", description: "", type: "number", default: 0,
        source: selectedAddon ?? "",
      };
      return <WorldVarEditor variable={isNew ? blank : (existing ?? blank)} isNew={isNew} onBack={handleBack} />;
    }
    const existing = events.find(e => e.id === editingId);
    const blank: EventDefinition = {
      id: "", name: "", description: "", triggerMode: "on_change",
      targetScope: "each_character", conditions: [], effects: [],
      outputTemplate: "", source: selectedAddon ?? "",
    };
    return (
      <EventEditor
        event={isNew ? blank : (existing ?? blank)}
        isNew={isNew} definitions={definitions}
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
          <button className="em-action-btn" onClick={handleNewWV} style={{
            padding: "4px 12px", backgroundColor: T.bg2, color: T.successDim,
            border: `1px solid ${T.border}`, borderRadius: "3px", cursor: "pointer", fontSize: "13px",
          }}>[+ 添加变量]</button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "16px" }}>
        {filteredWVs.map(v => (
          <button key={v.id} className="em-item" onClick={() => handleEditWV(v.id)} style={{
            display: "flex", alignItems: "center", gap: "8px", width: "100%",
            padding: "5px 12px", backgroundColor: T.bg1, border: `1px solid ${T.border}`,
            borderRadius: "3px", cursor: "pointer", fontSize: "12px", textAlign: "left",
          }}>
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
          <button className="em-action-btn" onClick={handleNewEvent} style={{
            padding: "4px 12px", backgroundColor: T.bg2, color: T.successDim,
            border: `1px solid ${T.border}`, borderRadius: "3px", cursor: "pointer", fontSize: "13px",
          }}>[+ 新建事件]</button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {filteredEvents.map(evt => {
          const modeLabel = evt.triggerMode === "on_change" ? "变化触发" : evt.triggerMode === "while" ? "持续触发" : "一次性";
          const scopeLabel = evt.targetScope === "each_character" ? "每个角色" : "无目标";
          return (
            <button key={evt.id} className="em-item" onClick={() => handleEditEvent(evt.id)} style={{
              display: "flex", alignItems: "center", gap: "8px", width: "100%",
              padding: "5px 12px", backgroundColor: T.bg1, border: `1px solid ${T.border}`,
              borderRadius: "3px", cursor: "pointer", fontSize: "12px", textAlign: "left",
            }}>
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

function WorldVarEditor({ variable, isNew, onBack }: {
  variable: WorldVariableDefinition;
  isNew: boolean;
  onBack: () => void;
}) {
  const [id, setId] = useState(variable.id);
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
        if (!res.success) { alert(res.message); return; }
      } else {
        const res = await saveWorldVariableDef(variable.id, data);
        if (!res.success) { alert(res.message); return; }
      }
      onBack();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("确定删除此世界变量？")) return;
    const res = await deleteWorldVariableDef(variable.id);
    if (!res.success) { alert(res.message); return; }
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
          <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>[返回]</button>
          {!isNew && <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>[删除]</button>}
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            {saving ? "保存中..." : "[确定]"}
          </button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>ID</label>
          <input style={{ ...inputStyle, flex: 1 }} value={id}
            onChange={e => setId(e.target.value)} disabled={!isNew} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>名称</label>
          <input style={{ ...inputStyle, flex: 1 }} value={name}
            onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>说明</label>
          <input style={{ ...inputStyle, flex: 1 }} value={description}
            onChange={e => setDescription(e.target.value)} placeholder="可选" />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>类型</label>
          <select style={{ ...inputStyle }} value={type}
            onChange={e => setType(e.target.value as "number" | "boolean")}>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "50px" }}>默认值</label>
          <input style={{ ...inputStyle, width: "80px" }} type="number" value={defaultVal}
            onChange={e => setDefaultVal(Number(e.target.value))} />
          {type === "boolean" && (
            <span style={{ color: T.textDim, fontSize: "11px" }}>0 = false, 1 = true</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Event Editor ──────────────────────────────────────

function EventEditor({ event, isNew, definitions, worldVars, onBack }: {
  event: EventDefinition;
  isNew: boolean;
  definitions: GameDefinitions | null;
  worldVars: WorldVariableDefinition[];
  onBack: () => void;
}) {
  const [id, setId] = useState(event.id);
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
  const [showTriggerHelp, setShowTriggerHelp] = useState(false);
  const [showScopeHelp, setShowScopeHelp] = useState(false);
  const [showVarHelp, setShowVarHelp] = useState(false);

  // Derived lists from definitions
  const resourceKeys = definitions?.template.resources.map(r => ({ key: r.key, label: r.label })) ?? [];
  const abilityKeys = definitions?.template.abilities?.map(a => ({ key: a.key, label: a.label })) ?? [];
  const basicInfoNumKeys = definitions?.template.basicInfo
    .filter(f => f.type === "number").map(f => ({ key: f.key, label: f.label })) ?? [];
  const traitCategories = definitions?.template.traits?.map(t => ({ key: t.key, label: t.label })) ?? [];
  const clothingSlots = definitions?.template.clothingSlots ?? [];
  const mapList = definitions ? Object.values(definitions.maps) : [];
  const traitList = definitions ? Object.values(definitions.traitDefs) : [];
  const itemList = definitions ? Object.values(definitions.itemDefs) : [];
  const npcList = definitions
    ? Object.values(definitions.characters).filter(c => !c.isPlayer)
    : [];
  const variableList = definitions ? Object.values(definitions.variableDefs) : [];
  const wvList = worldVars;

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const data: any = {
        id, name, description: description || undefined,
        triggerMode, targetScope, conditions, effects,
        outputTemplate: outputTemplate || undefined,
        enabled,
      };
      if (triggerMode === "while") data.cooldown = cooldown;
      if (isNew) {
        data.source = event.source;
        const res = await createEventDef(data);
        if (!res.success) { alert(res.message); return; }
      } else {
        const res = await saveEventDef(event.id, data);
        if (!res.success) { alert(res.message); return; }
      }
      onBack();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("确定删除此事件？")) return;
    const res = await deleteEventDef(event.id);
    if (!res.success) { alert(res.message); return; }
    onBack();
  };

  // Condition CRUD
  const addCondition = () => setConditions([...conditions, { type: "location" } as ActionCondition]);
  const addOrGroup = () => setConditions([...conditions, { or: [{ type: "location" } as ActionCondition] }]);
  const updateCondition = (idx: number, item: ConditionItem) => {
    const next = [...conditions]; next[idx] = item; setConditions(next);
  };
  const removeCondition = (idx: number) => setConditions(conditions.filter((_, i) => i !== idx));

  // Effect CRUD
  const addEffect = () => setEffects([...effects, { type: "resource", op: "add" } as ActionEffect]);
  const updateEffect = (idx: number, eff: ActionEffect) => {
    const next = [...effects]; next[idx] = eff; setEffects(next);
  };
  const removeEffect = (idx: number) => setEffects(effects.filter((_, i) => i !== idx));

  const condCtx = { resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, mapList, traitList, itemList, npcList, variableList, wvList, clothingSlots };

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建事件" : `编辑: ${event.name || event.id}`} ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={onBack} style={{ ...btnBase, color: T.textSub }}>[返回]</button>
          {!isNew && <button onClick={handleDelete} style={{ ...btnBase, color: T.danger }}>[删除]</button>}
          <button onClick={handleSave} disabled={saving} style={{ ...btnBase, color: T.successDim }}>
            {saving ? "保存中..." : "[确定]"}
          </button>
        </div>
      </div>

      {/* Basic fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>ID</label>
          <input style={{ ...inputStyle, flex: 1 }} value={id}
            onChange={e => setId(e.target.value)} disabled={!isNew} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>名称</label>
          <input style={{ ...inputStyle, flex: 1 }} value={name}
            onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>说明</label>
          <input style={{ ...inputStyle, flex: 1 }} value={description}
            onChange={e => setDescription(e.target.value)} placeholder="可选" />
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>触发模式</label>
          <select style={inputStyle} value={triggerMode}
            onChange={e => setTriggerMode(e.target.value as EventDefinition["triggerMode"])}>
            <option value="on_change">on_change (变化触发)</option>
            <option value="while">while (持续触发)</option>
            <option value="once">once (一次性)</option>
          </select>
          {triggerMode === "while" && (
            <>
              <label style={{ color: T.textSub, fontSize: "11px" }}>冷却(分钟)</label>
              <input style={{ ...inputStyle, width: "60px" }} type="number" value={cooldown}
                onChange={e => setCooldown(Number(e.target.value))} />
            </>
          )}
          <button onClick={() => setShowTriggerHelp(v => !v)}
            style={{ ...btnBase, color: showTriggerHelp ? T.danger : T.textSub, fontSize: "11px" }}>[?]</button>
        </div>
        {showTriggerHelp && <TriggerModeHelp />}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>目标范围</label>
          <select style={inputStyle} value={targetScope}
            onChange={e => setTargetScope(e.target.value as EventDefinition["targetScope"])}>
            <option value="each_character">each_character (每个角色)</option>
            <option value="none">none (无目标)</option>
          </select>
          <button onClick={() => setShowScopeHelp(v => !v)}
            style={{ ...btnBase, color: showScopeHelp ? T.danger : T.textSub, fontSize: "11px" }}>[?]</button>
        </div>
        {showScopeHelp && <TargetScopeHelp />}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: T.textSub, fontSize: "11px", width: "60px" }}>启用</label>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        </div>
      </div>

      {/* Conditions */}
      <div style={sectionStyle("cond")}>
        <div style={sectionTitleStyle("cond")}>
          <span style={{ color: SEC.cond.color, fontSize: "12px", fontWeight: "bold" }}>
            条件 (AND)
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={addCondition} style={addBtnStyle}>[+ 条件]</button>
            <button onClick={addOrGroup} style={addBtnStyle}>[+ OR]</button>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          {conditions.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>无条件（始终满足）</div>}
          {conditions.map((item, idx) => (
            <div key={idx} style={{ backgroundColor: rowBg(idx), padding: "3px 4px", borderRadius: "2px",
              borderBottom: idx < conditions.length - 1 ? `1px solid ${T.borderDim}` : "none" }}>
              <ConditionItemEditor
                item={item}
                onChange={newItem => updateCondition(idx, newItem)}
                onRemove={() => removeCondition(idx)}
                ctx={condCtx}
                depth={0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div style={sectionStyle("eff")}>
        <div style={sectionTitleStyle("eff")}>
          <span style={{ color: SEC.eff.color, fontSize: "12px", fontWeight: "bold" }}>
            效果
          </span>
          <button onClick={addEffect} style={addBtnStyle}>[+ 效果]</button>
        </div>
        <div style={{ padding: "0 8px" }}>
          {effects.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>无效果</div>}
          {effects.map((eff, idx) => (
            <div key={idx} style={{ backgroundColor: rowBg(idx), padding: "3px 4px", borderRadius: "2px",
              borderBottom: idx < effects.length - 1 ? `1px solid ${T.borderDim}` : "none" }}>
              <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                <EffectFieldEditor
                  effect={eff}
                  onChange={e => updateEffect(idx, e)}
                  ctx={condCtx}
                />
                <button onClick={() => removeEffect(idx)} style={delBtnStyle}>x</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Output template */}
      <div style={sectionStyle("tpl")}>
        <div style={sectionTitleStyle("tpl")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: SEC.tpl.color, fontSize: "12px", fontWeight: "bold" }}>
              输出模板
            </span>
            <button onClick={() => setShowVarHelp(v => !v)}
              style={{ ...btnBase, color: showVarHelp ? T.danger : T.textSub, fontSize: "11px" }}>[?]</button>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={outputTemplate}
            onChange={e => setOutputTemplate(e.target.value)}
            placeholder="例: {{self.name}} 踩到了陷阱！" />
          {showVarHelp && (
            <EventTemplateVarHelp
              resourceKeys={resourceKeys} abilityKeys={abilityKeys}
              basicInfoNumKeys={basicInfoNumKeys} traitCategories={traitCategories}
              clothingSlots={clothingSlots} targetScope={targetScope} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Condition Item Editor (recursive) ─────────────────

type CondCtx = {
  resourceKeys: { key: string; label: string }[];
  abilityKeys: { key: string; label: string }[];
  basicInfoNumKeys: { key: string; label: string }[];
  traitCategories: { key: string; label: string }[];
  mapList: { id: string; name: string; cells: { id: number; name?: string }[] }[];
  traitList: { id: string; name: string; category: string }[];
  itemList: { id: string; name: string }[];
  npcList: { id: string; name: string }[];
  variableList: { id: string; name: string }[];
  wvList: { id: string; name: string }[];
  clothingSlots: string[];
};

function ConditionItemEditor({ item, onChange, onRemove, ctx, depth }: {
  item: ConditionItem;
  onChange: (item: ConditionItem) => void;
  onRemove: () => void;
  ctx: CondCtx;
  depth: number;
}) {
  if (depth > 6) return null;

  if (isAndGroup(item)) {
    return (
      <ConditionGroupEditor
        label="AND" items={item.and}
        onChange={items => onChange({ and: items })}
        onRemove={onRemove} ctx={ctx} depth={depth}
      />
    );
  }
  if (isOrGroup(item)) {
    return (
      <ConditionGroupEditor
        label="OR" items={(item as { or: ConditionItem[] }).or}
        onChange={items => onChange({ or: items })}
        onRemove={onRemove} ctx={ctx} depth={depth}
      />
    );
  }

  // Leaf condition
  const cond = item as ActionCondition;
  return <ConditionLeafEditor condition={cond} onChange={c => onChange(c)} onRemove={onRemove} ctx={ctx} />;
}

function ConditionGroupEditor({ label, items, onChange, onRemove, ctx, depth }: {
  label: string;
  items: ConditionItem[];
  onChange: (items: ConditionItem[]) => void;
  onRemove: () => void;
  ctx: CondCtx;
  depth: number;
}) {
  const addChild = () => onChange([...items, { type: "location" } as ActionCondition]);
  const updateChild = (idx: number, item: ConditionItem) => {
    const next = [...items]; next[idx] = item; onChange(next);
  };
  const removeChild = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const color = label === "AND" ? "#6ec6ff" : "#e9a045";
  return (
    <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: "8px", marginLeft: "4px" }}>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
        <span style={{ color, fontSize: "11px", fontWeight: "bold" }}>{label}</span>
        <button onClick={addChild} style={addBtnStyle}>[+]</button>
        <button onClick={onRemove} style={delBtnStyle}>x</button>
      </div>
      {items.map((child, idx) => (
        <div key={idx} style={{ marginBottom: "2px" }}>
          <ConditionItemEditor
            item={child}
            onChange={c => updateChild(idx, c)}
            onRemove={() => removeChild(idx)}
            ctx={ctx} depth={depth + 1}
          />
        </div>
      ))}
    </div>
  );
}

function ConditionLeafEditor({ condition, onChange, onRemove, ctx }: {
  condition: ActionCondition;
  onChange: (c: ActionCondition) => void;
  onRemove: () => void;
  ctx: CondCtx;
}) {
  const update = (patch: Partial<ActionCondition>) => onChange({ ...condition, ...patch });

  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
      <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.type}
        onChange={e => onChange({ type: e.target.value as ActionCondition["type"] })}>
        {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {/* Location */}
      {condition.type === "location" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.mapId ?? ""}
            onChange={e => update({ mapId: e.target.value || undefined })}>
            <option value="">选择地图</option>
            {ctx.mapList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "80px", fontSize: "11px" }}
            value={(condition.cellIds ?? []).join(",")}
            onChange={e => update({ cellIds: e.target.value ? e.target.value.split(",").map(Number) : undefined })}
            placeholder="格子ID(逗号)" />
        </>
      )}

      {/* NPC present */}
      {condition.type === "npcPresent" && (
        <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.npcId ?? ""}
          onChange={e => update({ npcId: e.target.value || undefined })}>
          <option value="">任意NPC</option>
          {ctx.npcList.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      )}

      {/* Resource / Ability / BasicInfo */}
      {(condition.type === "resource" || condition.type === "ability" || condition.type === "basicInfo") && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.key ?? ""}
            onChange={e => update({ key: e.target.value })}>
            <option value="">选择</option>
            {(condition.type === "resource" ? ctx.resourceKeys
              : condition.type === "ability" ? ctx.abilityKeys
              : ctx.basicInfoNumKeys
            ).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select style={{ ...inputStyle, width: "50px", fontSize: "11px" }} value={condition.op ?? ">="}
            onChange={e => update({ op: e.target.value })}>
            {OPS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={condition.value ?? 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      {/* Trait / NoTrait */}
      {(condition.type === "trait" || condition.type === "noTrait") && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.key ?? ""}
            onChange={e => update({ key: e.target.value })}>
            <option value="">分类</option>
            {ctx.traitCategories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.traitId ?? ""}
            onChange={e => update({ traitId: e.target.value })}>
            <option value="">特质</option>
            {ctx.traitList.filter(t => !condition.key || t.category === condition.key)
              .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </>
      )}

      {/* Favorability */}
      {condition.type === "favorability" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.targetId ?? ""}
            onChange={e => update({ targetId: e.target.value })}>
            <option value="">目标</option>
            <option value="{{player}}">玩家</option>
            {ctx.npcList.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select style={{ ...inputStyle, width: "50px", fontSize: "11px" }} value={condition.op ?? ">="}
            onChange={e => update({ op: e.target.value })}>
            {OPS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={condition.value ?? 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      {/* Has item */}
      {condition.type === "hasItem" && (
        <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.itemId ?? ""}
          onChange={e => update({ itemId: e.target.value })}>
          <option value="">选择物品</option>
          {ctx.itemList.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      )}

      {/* Clothing */}
      {condition.type === "clothing" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.slot ?? ""}
            onChange={e => update({ slot: e.target.value })}>
            <option value="">槽位</option>
            {ctx.clothingSlots.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.state ?? "worn"}
            onChange={e => update({ state: e.target.value })}>
            <option value="worn">穿着</option>
            <option value="halfWorn">半穿</option>
            <option value="empty">空</option>
          </select>
        </>
      )}

      {/* Time */}
      {condition.type === "time" && (
        <>
          <input style={{ ...inputStyle, width: "40px", fontSize: "11px" }} type="number"
            value={condition.hourMin ?? ""} placeholder="起"
            onChange={e => update({ hourMin: e.target.value ? Number(e.target.value) : undefined })} />
          <span style={{ color: T.textDim, fontSize: "11px" }}>~</span>
          <input style={{ ...inputStyle, width: "40px", fontSize: "11px" }} type="number"
            value={condition.hourMax ?? ""} placeholder="止"
            onChange={e => update({ hourMax: e.target.value ? Number(e.target.value) : undefined })} />
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.season ?? ""}
            onChange={e => update({ season: e.target.value || undefined })}>
            <option value="">任意季节</option>
            <option value="春">春</option>
            <option value="夏">夏</option>
            <option value="秋">秋</option>
            <option value="冬">冬</option>
          </select>
        </>
      )}

      {/* Variable */}
      {condition.type === "variable" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.varId ?? ""}
            onChange={e => update({ varId: e.target.value })}>
            <option value="">选择变量</option>
            {ctx.variableList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select style={{ ...inputStyle, width: "50px", fontSize: "11px" }} value={condition.op ?? ">="}
            onChange={e => update({ op: e.target.value })}>
            {OPS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={condition.value ?? 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      {/* WorldVar */}
      {condition.type === "worldVar" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={condition.key ?? ""}
            onChange={e => update({ key: e.target.value })}>
            <option value="">选择世界变量</option>
            {ctx.wvList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select style={{ ...inputStyle, width: "50px", fontSize: "11px" }} value={condition.op ?? "=="}
            onChange={e => update({ op: e.target.value })}>
            {OPS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={condition.value ?? 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      <button onClick={onRemove} style={delBtnStyle}>x</button>
    </div>
  );
}

// ── Effect Editor ─────────────────────────────────────

function EffectFieldEditor({ effect, onChange, ctx }: {
  effect: ActionEffect;
  onChange: (e: ActionEffect) => void;
  ctx: CondCtx;
}) {
  const update = (patch: Partial<ActionEffect>) => onChange({ ...effect, ...patch });

  return (
    <>
      <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.type}
        onChange={e => onChange({ type: e.target.value as ActionEffect["type"], op: "add" })}>
        {EFFECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {/* Resource / Ability / BasicInfo */}
      {(effect.type === "resource" || effect.type === "ability" || effect.type === "basicInfo") && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.key ?? ""}
            onChange={e => update({ key: e.target.value })}>
            <option value="">选择</option>
            {(effect.type === "resource" ? ctx.resourceKeys
              : effect.type === "ability" ? ctx.abilityKeys
              : ctx.basicInfoNumKeys
            ).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.op}
            onChange={e => update({ op: e.target.value })}>
            <option value="add">增加</option>
            <option value="set">设为</option>
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={typeof effect.value === "number" ? effect.value : 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      {/* Favorability */}
      {effect.type === "favorability" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.op}
            onChange={e => update({ op: e.target.value })}>
            <option value="add">增加</option>
            <option value="set">设为</option>
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={typeof effect.value === "number" ? effect.value : 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      {/* Trait */}
      {effect.type === "trait" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.op}
            onChange={e => update({ op: e.target.value })}>
            <option value="addTrait">添加</option>
            <option value="removeTrait">移除</option>
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.key ?? ""}
            onChange={e => update({ key: e.target.value })}>
            <option value="">分类</option>
            {ctx.traitCategories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.traitId ?? ""}
            onChange={e => update({ traitId: e.target.value })}>
            <option value="">特质</option>
            {ctx.traitList.filter(t => !effect.key || t.category === effect.key)
              .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </>
      )}

      {/* Item */}
      {effect.type === "item" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.op}
            onChange={e => update({ op: e.target.value })}>
            <option value="addItem">给予</option>
            <option value="removeItem">移除</option>
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.itemId ?? ""}
            onChange={e => update({ itemId: e.target.value })}>
            <option value="">选择物品</option>
            {ctx.itemList.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "40px", fontSize: "11px" }} type="number"
            value={effect.amount ?? 1}
            onChange={e => update({ amount: Number(e.target.value) })} />
        </>
      )}

      {/* Clothing */}
      {effect.type === "clothing" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.slot ?? ""}
            onChange={e => update({ slot: e.target.value })}>
            <option value="">槽位</option>
            {ctx.clothingSlots.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.state ?? "worn"}
            onChange={e => update({ state: e.target.value })}>
            <option value="worn">穿上</option>
            <option value="halfWorn">半穿</option>
            <option value="empty">脱下</option>
          </select>
        </>
      )}

      {/* Position */}
      {effect.type === "position" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.mapId ?? ""}
            onChange={e => update({ mapId: e.target.value })}>
            <option value="">选择地图</option>
            {ctx.mapList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {effect.mapId && (
            <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.cellId ?? ""}
              onChange={e => update({ cellId: Number(e.target.value) })}>
              <option value="">选择格子</option>
              {(ctx.mapList.find(m => m.id === effect.mapId)?.cells ?? [])
                .map(c => <option key={c.id} value={c.id}>{c.name || `#${c.id}`}</option>)}
            </select>
          )}
        </>
      )}

      {/* Experience */}
      {effect.type === "experience" && (
        <>
          <input style={{ ...inputStyle, width: "80px", fontSize: "11px" }}
            value={effect.key ?? ""}
            onChange={e => update({ key: e.target.value })}
            placeholder="经验key" />
          <input style={{ ...inputStyle, width: "40px", fontSize: "11px" }} type="number"
            value={typeof effect.value === "number" ? effect.value : 1}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}

      {/* WorldVar */}
      {effect.type === "worldVar" && (
        <>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.key ?? ""}
            onChange={e => update({ key: e.target.value })}>
            <option value="">选择世界变量</option>
            {ctx.wvList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select style={{ ...inputStyle, fontSize: "11px" }} value={effect.op}
            onChange={e => update({ op: e.target.value })}>
            <option value="set">设为</option>
            <option value="add">增加</option>
          </select>
          <input style={{ ...inputStyle, width: "60px", fontSize: "11px" }} type="number"
            value={typeof effect.value === "number" ? effect.value : 0}
            onChange={e => update({ value: Number(e.target.value) })} />
        </>
      )}
    </>
  );
}

// ─── Event help panel ───

const helpBox: React.CSSProperties = { margin: "4px 0 4px 68px", padding: "8px 12px", backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "3px" };
const helpSub: React.CSSProperties = { color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" };
const helpP: React.CSSProperties = { color: T.textSub, fontSize: "11px", lineHeight: "1.6", margin: "2px 0" };
const helpEm: React.CSSProperties = { color: "#0ff", fontSize: "11px" };
const helpDim: React.CSSProperties = { color: T.textDim, fontSize: "11px", fontStyle: "italic" };

function TriggerModeHelp() {
  return (
    <div style={helpBox}>
      <div style={{ ...helpP, marginBottom: "2px" }}>控制事件在条件满足时何时触发。</div>

      <div style={helpSub}>on_change — 变化触发</div>
      <div style={helpP}>
        条件从 <span style={helpEm}>不满足 → 满足</span> 的瞬间触发一次。
        条件持续满足期间不会重复触发，必须先变回不满足、再次满足时才会再次触发。
      </div>
      <div style={helpDim}>适合"进入某状态时"的事件。例：好感度首次达到 50 时触发特殊对话。金币从 99→100 触发，100→120 不触发，降回 80 后再回到 100 会再次触发。</div>

      <div style={helpSub}>while — 持续触发</div>
      <div style={helpP}>
        每次检查时只要条件满足就触发，受冷却时间（分钟）限制避免过于频繁。
      </div>
      <div style={helpDim}>适合持续性效果。例：天气为雨天时，每 10 分钟所有人心情 -1。</div>

      <div style={helpSub}>once — 一次性</div>
      <div style={helpP}>
        条件满足时触发 <span style={helpEm}>一次</span> 后永久标记为已完成，之后即使条件反复变化也不会再触发。
      </div>
      <div style={helpDim}>适合一次性剧情事件。例：第一次击败 Boss 后解锁新区域——无论之后状态如何变化，都不会重复触发。</div>

      <div style={helpSub}>on_change vs once 的区别</div>
      <div style={helpP}>
        两者都是"变化时触发一次"，区别在于：<span style={helpEm}>on_change</span> 在条件恢复不满足后可以再次触发（多次），
        而 <span style={helpEm}>once</span> 触发后永远不再触发（仅一次）。
      </div>
    </div>
  );
}

function TargetScopeHelp() {
  return (
    <div style={helpBox}>
      <div style={{ ...helpP, marginBottom: "2px" }}>控制事件对谁评估和执行效果。</div>

      <div style={helpSub}>each_character — 每个角色</div>
      <div style={helpP}>
        对每个角色 <span style={helpEm}>分别</span> 评估条件、分别执行效果。
        玩家行动后对玩家评估，每个 NPC 的行动回合对该 NPC 评估。
        效果中的 <span style={helpEm}>self</span> 指当前被评估的角色。
      </div>
      <div style={helpDim}>例：任何角色 HP 低于 10 时自动获得特质"濒死"——每个角色独立判断。若配合 once 模式，则每个角色各触发一次。</div>

      <div style={helpSub}>none — 无目标</div>
      <div style={helpP}>
        无角色上下文，仅在玩家行动后评估一次。
        条件只能使用 <span style={helpEm}>世界变量</span>、<span style={helpEm}>时间</span> 等全局条件，
        效果只能修改 <span style={helpEm}>世界变量</span>。
      </div>
      <div style={helpDim}>例：当世界变量 tavern_open = 1 时，设置 customers_arriving = 1。</div>
    </div>
  );
}

// ─── Event template variable help panel ───

type KeyLabel = { key: string; label: string };

function EventTemplateVarHelp({ resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots, targetScope }: {
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  targetScope: string;
}) {
  const s: React.CSSProperties = { color: "#0ff", fontSize: "11px" };
  const d: React.CSSProperties = { color: T.textSub, fontSize: "11px" };
  const cat: React.CSSProperties = { color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" };
  const row = (v: string, desc: string) => (
    <div key={v} style={{ display: "flex", gap: "8px", marginBottom: "1px" }}>
      <span style={{ ...s, minWidth: "220px" }}>{`{{${v}}}`}</span>
      <span style={d}>{desc}</span>
    </div>
  );

  const isNone = targetScope === "none";

  return (
    <div style={{ marginTop: "6px", padding: "8px", backgroundColor: T.bg3, border: `1px solid ${T.border}`, borderRadius: "3px", maxHeight: "300px", overflowY: "auto" }}>
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
          {resourceKeys.map(r => row(`self.resource.${r.key}`, r.label))}

          <div style={cat}>能力 (self.ability.X = 等级, self.abilityExp.X = 经验值)</div>
          {abilityKeys.map(a => row(`self.ability.${a.key}`, `${a.label} 等级`))}

          <div style={cat}>基本属性 (self.basicInfo.X)</div>
          {basicInfoNumKeys.map(b => row(`self.basicInfo.${b.key}`, b.label))}

          <div style={cat}>服装 (self.clothing.X)</div>
          {clothingSlots.map(sl => row(`self.clothing.${sl}`, `${sl} 槽位衣物名`))}

          <div style={cat}>特质 (self.trait.X)</div>
          {traitCategories.map(t => row(`self.trait.${t.key}`, `${t.label} 值`))}
        </>
      )}
    </div>
  );
}
