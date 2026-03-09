import { useState } from "react";
import type {
  ActionDefinition, ActionCondition, ConditionItem,
  ActionCost, ActionOutcome, ActionEffect,
  ValueModifier, GameDefinitions,
} from "../types/game";
import { createActionDef, saveActionDef, deleteActionDef } from "../api/client";

interface Props {
  action: ActionDefinition;
  isNew: boolean;
  definitions: GameDefinitions;
  onBack: () => void;
}

const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: "#0a0a1a",
  color: "#ddd",
  border: "1px solid #333",
  borderRadius: "3px",
  fontFamily: "monospace",
  fontSize: "12px",
};

const labelStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "11px",
  marginBottom: "2px",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "12px",
  padding: "8px",
  backgroundColor: "#0a0a1a",
  border: "1px solid #333",
  borderRadius: "3px",
};

const smallBtnStyle = (color: string): React.CSSProperties => ({
  padding: "2px 8px",
  backgroundColor: "#16213e",
  color,
  border: "1px solid #333",
  borderRadius: "3px",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "11px",
});

// Condition type labels
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
];

const COST_TYPES: { value: ActionCost["type"]; label: string }[] = [
  { value: "resource", label: "资源" },
  { value: "basicInfo", label: "基本属性" },
  { value: "item", label: "物品" },
];

const EFFECT_TYPES: { value: ActionEffect["type"]; label: string }[] = [
  { value: "resource", label: "资源" },
  { value: "ability", label: "能力" },
  { value: "basicInfo", label: "基本属性" },
  { value: "favorability", label: "好感度" },
  { value: "trait", label: "特质" },
  { value: "item", label: "物品" },
  { value: "clothing", label: "服装" },
  { value: "position", label: "位置" },
];

const OPS = [">=", "<=", ">", "<", "==", "!="];

function isAndGroup(item: ConditionItem): item is { and: ConditionItem[] } {
  return "and" in item && !("type" in item);
}
function isOrGroup(item: ConditionItem): item is { or: ConditionItem[] } {
  return "or" in item && !("type" in item);
}
function isNotGroup(item: ConditionItem): item is { not: ConditionItem } {
  return "not" in item && !("type" in item);
}

const MAX_UI_DEPTH = 4;

export default function ActionEditor({ action, isNew, definitions, onBack }: Props) {
  const [id, setId] = useState(action.id);
  const [name, setName] = useState(action.name);
  const [category, setCategory] = useState(action.category);
  const [targetType, setTargetType] = useState(action.targetType);
  const [triggerLLM, setTriggerLLM] = useState(action.triggerLLM);
  const [timeCost, setTimeCost] = useState(action.timeCost);
  const [npcWeight, setNpcWeight] = useState(action.npcWeight ?? 0);
  const [npcWeightModifiers, setNpcWeightModifiers] = useState<ValueModifier[]>(
    JSON.parse(JSON.stringify(action.npcWeightModifiers ?? []))
  );
  const [conditions, setConditions] = useState<ConditionItem[]>(JSON.parse(JSON.stringify(action.conditions)));
  const [outcomes, setOutcomes] = useState<ActionOutcome[]>(JSON.parse(JSON.stringify(action.outcomes)));
  const [outputTemplate, setOutputTemplate] = useState(action.outputTemplate ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showVarHelp, setShowVarHelp] = useState(false);

  const isBuiltin = action.source === "builtin";

  const { template, maps, traitDefs, itemDefs, clothingDefs, characters } = definitions;
  const resourceKeys = template.resources.map((r) => ({ key: r.key, label: r.label }));
  const abilityKeys = template.abilities.map((a) => ({ key: a.key, label: a.label }));
  const basicInfoNumKeys = template.basicInfo.filter((b) => b.type === "number").map((b) => ({ key: b.key, label: b.label }));
  const traitCategories = template.traits.map((t) => ({ key: t.key, label: t.label }));
  const clothingSlots = template.clothingSlots;
  const mapList = Object.values(maps);
  const traitList = Object.values(traitDefs);
  const itemList = Object.values(itemDefs);
  const npcList = Object.values(characters ?? {}).filter((c) => !c.isPlayer);
  const categoryList = [...new Set(Object.values(definitions.actionDefs).map((a) => a.category).filter(Boolean))];

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
    setOutcomes([...outcomes, { grade: "success", label: "成功", weight: 100, effects: [], outputTemplate: "" }]);
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
      setMessage("ID 和名称不能为空");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = {
        id, name, category, targetType, triggerLLM, timeCost,
        npcWeight, npcWeightModifiers,
        conditions, costs: [], outcomes, outputTemplate,
      };
      const result = isNew
        ? await createActionDef(data)
        : await saveActionDef(id, data);
      setMessage(result.success ? "已保存" : result.message);
      if (result.success && isNew) {
        setTimeout(onBack, 500);
      }
    } catch (e) {
      setMessage(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除行动「${name || id}」吗？`)) return;
    setSaving(true);
    try {
      const result = await deleteActionDef(id);
      if (result.success) onBack();
      else setMessage(result.message);
    } catch (e) {
      setMessage(`删除失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: "monospace", fontSize: "13px", color: "#ddd", padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: "#e94560", fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建行动" : "编辑行动"} ==
        </span>
        {isBuiltin && <span style={{ color: "#e89a19", fontSize: "12px" }}>内置行动不可编辑</span>}
      </div>

      {/* Basic info */}
      <div style={{ ...sectionStyle, display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ color: "#e94560", fontSize: "12px", fontWeight: "bold" }}>基本信息</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={id} onChange={(e) => setId(e.target.value)} disabled={!isNew || isBuiltin} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>名称</div>
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={name} onChange={(e) => setName(e.target.value)} disabled={isBuiltin} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>分类</div>
            <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={categoryList.includes(category) ? category : "__custom__"}
              onChange={(e) => { if (e.target.value !== "__custom__") setCategory(e.target.value); }}
              disabled={isBuiltin}>
              {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">自定义...</option>
            </select>
            {!categoryList.includes(category) && (
              <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: "2px" }}
                value={category} onChange={(e) => setCategory(e.target.value)} disabled={isBuiltin}
                placeholder="输入新分类" />
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
          <div>
            <div style={labelStyle}>目标类型</div>
            <select style={inputStyle} value={targetType}
              onChange={(e) => setTargetType(e.target.value as ActionDefinition["targetType"])} disabled={isBuiltin}>
              <option value="none">无目标</option>
              <option value="npc">NPC</option>
              <option value="self">自身</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>时间消耗(分)</div>
            <input type="number" step={5} min={0} style={{ ...inputStyle, width: "80px" }}
              value={timeCost} onChange={(e) => setTimeCost(Math.max(0, Math.round(Number(e.target.value) / 5) * 5))} disabled={isBuiltin} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: isBuiltin ? "default" : "pointer", paddingBottom: "4px" }}>
            <input type="checkbox" checked={triggerLLM} onChange={(e) => setTriggerLLM(e.target.checked)} disabled={isBuiltin} />
            <span style={{ fontSize: "12px" }}>触发LLM</span>
          </label>
        </div>
        {/* NPC Weight */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div>
            <div style={labelStyle}>NPC基础权重</div>
            <input type="number" style={{ ...inputStyle, width: "80px" }}
              value={npcWeight} onChange={(e) => setNpcWeight(Number(e.target.value))} disabled={isBuiltin} />
            <div style={{ color: "#666", fontSize: "10px", marginTop: "2px" }}>0=NPC不会执行</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>NPC权重修正</div>
            <ModifierListEditor
              modifiers={npcWeightModifiers}
              onChange={setNpcWeightModifiers}
              disabled={isBuiltin}
              abilityKeys={abilityKeys}
              traitCategories={traitCategories}
              traitList={traitList}
              label="权重修正"
            />
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ color: "#e94560", fontSize: "12px", fontWeight: "bold" }}>显示条件 (AND)</span>
          {!isBuiltin && (
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={addCondition} style={smallBtnStyle("#0f0")}>[+ 条件]</button>
              <button onClick={addOrGroup} style={smallBtnStyle("#0f0")}>[+ OR]</button>
              <button onClick={addAndGroup} style={smallBtnStyle("#0f0")}>[+ AND]</button>
            </div>
          )}
        </div>
        {conditions.length === 0 && <div style={{ color: "#666", fontSize: "12px" }}>无条件（始终显示）</div>}
        {conditions.map((item, idx) => (
          <div key={idx} style={{ marginBottom: "4px" }}>
            <ConditionItemEditor
              item={item}
              onChange={(newItem) => updateCondition(idx, newItem)}
              onRemove={() => removeCondition(idx)}
              disabled={isBuiltin}
              depth={0}
              ctx={{
                definitions, resourceKeys, abilityKeys, basicInfoNumKeys,
                traitCategories, clothingSlots, mapList, traitList, itemList, npcList,
              }}
            />
          </div>
        ))}
      </div>

      {/* Outcomes */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ color: "#e94560", fontSize: "12px", fontWeight: "bold" }}>结果分级</span>
          {!isBuiltin && <button onClick={addOutcome} style={smallBtnStyle("#0f0")}>[+ 结果]</button>}
        </div>
        {outcomes.length === 0 && <div style={{ color: "#666", fontSize: "12px" }}>无结果（固定成功）</div>}
        {outcomes.map((outcome, idx) => (
          <OutcomeEditor key={idx} outcome={outcome} onChange={(o) => updateOutcome(idx, o)}
            onRemove={() => removeOutcome(idx)} disabled={isBuiltin} definitions={definitions}
            resourceKeys={resourceKeys} abilityKeys={abilityKeys} basicInfoNumKeys={basicInfoNumKeys}
            traitCategories={traitCategories} clothingSlots={clothingSlots} mapList={mapList} traitList={traitList} itemList={itemList} npcList={npcList} />
        ))}
      </div>

      {/* Output template */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <span style={{ color: "#e94560", fontSize: "12px", fontWeight: "bold" }}>行为模板</span>
          <button onClick={() => setShowVarHelp((v) => !v)}
            style={{ ...smallBtnStyle(showVarHelp ? "#e94560" : "#888"), fontSize: "11px" }}>
            [?]
          </button>
        </div>
        <textarea style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: "36px", resize: "vertical" }}
          value={outputTemplate} onChange={(e) => setOutputTemplate(e.target.value)} disabled={isBuiltin}
          placeholder="{{player}} 向 {{target}} 搭话。" />
        {showVarHelp && (
          <TemplateVarHelp
            resourceKeys={resourceKeys} abilityKeys={abilityKeys}
            basicInfoNumKeys={basicInfoNumKeys} traitCategories={traitCategories}
            clothingSlots={clothingSlots}
          />
        )}
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {!isBuiltin && (
          <button onClick={handleSave} disabled={saving}
            style={{ ...smallBtnStyle("#0f0"), padding: "5px 16px", fontSize: "13px", cursor: saving ? "not-allowed" : "pointer" }}>
            [保存]
          </button>
        )}
        {!isBuiltin && !isNew && (
          <button onClick={handleDelete} disabled={saving}
            style={{ ...smallBtnStyle("#e94560"), padding: "5px 16px", fontSize: "13px", cursor: saving ? "not-allowed" : "pointer" }}>
            [删除]
          </button>
        )}
        <button onClick={onBack}
          style={{ ...smallBtnStyle("#888"), padding: "5px 16px", fontSize: "13px" }}>
          [返回列表]
        </button>
        {message && <span style={{ color: message === "已保存" ? "#0f0" : "#e94560", fontSize: "12px" }}>{message}</span>}
      </div>
    </div>
  );
}

// =====================
// Sub-editors
// =====================

interface KeyLabel { key: string; label: string }
interface MapInfo { id: string; name: string; cells: { id: number; name?: string }[] }
interface TraitInfo { id: string; name: string; category: string }
interface ItemInfo { id: string; name: string }

interface ConditionCtx {
  definitions: GameDefinitions;
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  mapList: MapInfo[];
  traitList: TraitInfo[];
  itemList: ItemInfo[];
  npcList: { id: string; name: string }[];
}

// ─── Recursive condition item editor ───

function ConditionItemEditor({
  item, onChange, onRemove, disabled, depth, ctx,
}: {
  item: ConditionItem;
  onChange: (item: ConditionItem) => void;
  onRemove: () => void;
  disabled: boolean;
  depth: number;
  ctx: ConditionCtx;
}) {
  if (isAndGroup(item)) {
    return (
      <ConditionGroupEditor
        type="and" items={item.and}
        onChange={(items) => onChange({ and: items })}
        onRemove={onRemove} disabled={disabled} depth={depth} ctx={ctx}
        onToggleNot={() => onChange({ not: item })}
      />
    );
  }
  if (isOrGroup(item)) {
    return (
      <ConditionGroupEditor
        type="or" items={item.or}
        onChange={(items) => onChange({ or: items })}
        onRemove={onRemove} disabled={disabled} depth={depth} ctx={ctx}
        onToggleNot={() => onChange({ not: item })}
      />
    );
  }
  // NOT wrapping a group → render the group with NOT indicator
  if (isNotGroup(item) && !("type" in item.not)) {
    const inner = item.not;
    const groupType = isOrGroup(inner) ? "or" : "and";
    const groupItems = isOrGroup(inner) ? inner.or : (inner as { and: ConditionItem[] }).and;
    return (
      <ConditionGroupEditor
        type={groupType} items={groupItems}
        onChange={(items) => onChange({ not: groupType === "or" ? { or: items } : { and: items } })}
        onRemove={onRemove} disabled={disabled} depth={depth} ctx={ctx}
        isNot onToggleNot={() => onChange(inner)}
      />
    );
  }
  // Leaf condition or NOT(leaf) — render inline with NOT toggle
  const isNot = isNotGroup(item);
  const leaf = isNot ? (item as { not: ConditionItem }).not as ActionCondition : item as ActionCondition;
  const toggleNot = () => {
    if (isNot) onChange(leaf);          // unwrap NOT
    else onChange({ not: item });       // wrap with NOT
  };
  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {!disabled ? (
        <button
          onClick={toggleNot}
          style={{
            ...smallBtnStyle(isNot ? "#e9a045" : "#666"),
            minWidth: "28px", textAlign: "center", padding: "1px 4px",
            fontWeight: isNot ? "bold" : "normal",
          }}
          title={isNot ? "点击取消 NOT" : "点击切换为 NOT"}
        >
          {isNot ? "NOT" : "AND"}
        </button>
      ) : (
        <span style={{ color: isNot ? "#e9a045" : "#666", fontSize: "11px", minWidth: "28px", fontWeight: isNot ? "bold" : "normal" }}>
          {isNot ? "NOT" : "AND"}
        </span>
      )}
      <ConditionLeafEditor condition={leaf} onChange={(c) => isNot ? onChange({ not: c }) : onChange(c)} disabled={disabled} ctx={ctx} />
      {!disabled && <button onClick={onRemove} style={smallBtnStyle("#e94560")}>x</button>}
    </div>
  );
}

function ConditionGroupEditor({
  type, items, onChange, onRemove, disabled, depth, ctx, isNot, onToggleNot,
}: {
  type: "and" | "or";
  items: ConditionItem[];
  onChange: (items: ConditionItem[]) => void;
  onRemove: () => void;
  disabled: boolean;
  depth: number;
  ctx: ConditionCtx;
  isNot?: boolean;
  onToggleNot?: () => void;
}) {
  const label = (isNot ? "NOT " : "") + (type === "and" ? "AND 组" : "OR 组");
  const labelColor = isNot ? "#e9a045" : type === "and" ? "#6ec6ff" : "#e9a045";
  const borderColor = ["#444", "#555", "#666"][depth % 3];

  const addLeaf = () => onChange([...items, { type: "location" }]);
  const addOr = () => onChange([...items, { or: [{ type: "location" }] }]);
  const addAnd = () => onChange([...items, { and: [{ type: "location" }] }]);
  const removeChild = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    if (next.length === 0) onRemove();
    else onChange(next);
  };
  const updateChild = (idx: number, child: ConditionItem) => {
    const next = [...items];
    next[idx] = child;
    onChange(next);
  };

  return (
    <div style={{
      border: `1px dashed ${borderColor}`, borderRadius: "3px",
      padding: "4px 6px", marginLeft: depth > 0 ? "16px" : "28px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {!disabled && onToggleNot && (
            <button onClick={onToggleNot}
              style={{ ...smallBtnStyle(isNot ? "#e9a045" : "#666"), fontSize: "10px", padding: "1px 4px" }}
              title={isNot ? "取消 NOT" : "添加 NOT"}>
              {isNot ? "NOT" : "NOT"}
            </button>
          )}
          <span style={{ color: labelColor, fontSize: "11px", fontWeight: "bold" }}>{label}</span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {!disabled && depth + 1 < MAX_UI_DEPTH && (
            <>
              <button onClick={addLeaf} style={smallBtnStyle("#0f0")}>[+条件]</button>
              <button onClick={addOr} style={smallBtnStyle("#0f0")}>[+OR]</button>
              <button onClick={addAnd} style={smallBtnStyle("#0f0")}>[+AND]</button>
            </>
          )}
          {!disabled && depth + 1 >= MAX_UI_DEPTH && (
            <button onClick={addLeaf} style={smallBtnStyle("#0f0")}>[+条件]</button>
          )}
          {!disabled && <button onClick={onRemove} style={smallBtnStyle("#e94560")}>x</button>}
        </div>
      </div>
      {items.map((child, idx) => (
        <div key={idx} style={{ marginBottom: "2px" }}>
          <ConditionItemEditor
            item={child}
            onChange={(c) => updateChild(idx, c)}
            onRemove={() => removeChild(idx)}
            disabled={disabled} depth={depth + 1} ctx={ctx}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Leaf condition editor (single ActionCondition) ───

function ConditionLeafEditor({
  condition, onChange, disabled, ctx,
}: {
  condition: ActionCondition;
  onChange: (c: ConditionItem) => void;
  disabled: boolean;
  ctx: ConditionCtx;
}) {
  const { resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots, mapList, traitList, itemList, npcList } = ctx;
  const update = (patch: Partial<ActionCondition>) => onChange({ ...condition, ...patch });

  const cellOptions = condition.mapId
    ? mapList.find((m) => m.id === condition.mapId)?.cells ?? []
    : [];

  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
      <select style={{ ...inputStyle, width: "auto" }} value={condition.type}
        onChange={(e) => onChange({ type: e.target.value as ActionCondition["type"] })} disabled={disabled}>
        {CONDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {!["location", "npcPresent", "time"].includes(condition.type) && (
        <select style={{ ...inputStyle, width: "auto", fontSize: "10px" }} value={condition.condTarget ?? "self"}
          onChange={(e) => update({ condTarget: e.target.value as "self" | "target" })} disabled={disabled}>
          <option value="self">自身</option>
          <option value="target">目标</option>
        </select>
      )}

      {condition.type === "location" && (
        <>
          <select style={inputStyle} value={condition.mapId ?? ""}
            onChange={(e) => update({ mapId: e.target.value, cellIds: [] })} disabled={disabled}>
            <option value="">选择地图</option>
            {mapList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {condition.mapId && (
            <select style={inputStyle} multiple value={(condition.cellIds ?? []).map(String)}
              onChange={(e) => update({ cellIds: Array.from(e.target.selectedOptions, (o) => Number(o.value)) })}
              disabled={disabled} title="Ctrl+点击多选">
              {cellOptions.map((c) => <option key={c.id} value={c.id}>{c.name ?? `#${c.id}`}</option>)}
            </select>
          )}
        </>
      )}

      {condition.type === "npcPresent" && (
        <select style={inputStyle} value={condition.npcId ?? ""}
          onChange={(e) => update({ npcId: e.target.value || undefined })} disabled={disabled}>
          <option value="">任意NPC</option>
          {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      )}

      {(condition.type === "resource" || condition.type === "ability" || condition.type === "basicInfo") && (
        <>
          <select style={inputStyle} value={condition.key ?? ""}
            onChange={(e) => update({ key: e.target.value })} disabled={disabled}>
            <option value="">选择</option>
            {(condition.type === "resource" ? resourceKeys : condition.type === "ability" ? abilityKeys : basicInfoNumKeys)
              .map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select style={inputStyle} value={condition.op ?? ">="} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input type="number" style={{ ...inputStyle, width: "70px" }} value={condition.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
        </>
      )}

      {(condition.type === "trait" || condition.type === "noTrait") && (
        <>
          <select style={inputStyle} value={condition.key ?? ""}
            onChange={(e) => update({ key: e.target.value })} disabled={disabled}>
            <option value="">分类</option>
            {traitCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select style={inputStyle} value={condition.traitId ?? ""}
            onChange={(e) => update({ traitId: e.target.value })} disabled={disabled}>
            <option value="">选择特质</option>
            {traitList.filter((t) => !condition.key || t.category === condition.key)
              .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </>
      )}

      {condition.type === "favorability" && (
        <>
          <select style={inputStyle} value={condition.targetId ?? ""}
            onChange={(e) => update({ targetId: e.target.value })} disabled={disabled}>
            <option value="">选择</option>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标</option>
            <option value="{{player}}">Player</option>
          </select>
          <select style={inputStyle} value={condition.op ?? ">="} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input type="number" style={{ ...inputStyle, width: "70px" }} value={condition.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
        </>
      )}

      {condition.type === "hasItem" && (
        <>
          <select style={inputStyle} value={condition.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value || undefined })} disabled={disabled}>
            <option value="">任意物品</option>
            {itemList.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input style={{ ...inputStyle, width: "80px" }} value={condition.tag ?? ""}
            onChange={(e) => update({ tag: e.target.value || undefined })} disabled={disabled}
            placeholder="标签筛选" />
        </>
      )}

      {condition.type === "clothing" && (
        <>
          <select style={inputStyle} value={condition.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })} disabled={disabled}>
            <option value="">选择槽位</option>
            {clothingSlots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={inputStyle} value={condition.state ?? "worn"}
            onChange={(e) => update({ state: e.target.value })} disabled={disabled}>
            <option value="worn">穿着</option>
            <option value="halfWorn">半穿</option>
            <option value="none">脱下</option>
            <option value="empty">无衣物</option>
          </select>
        </>
      )}

      {condition.type === "time" && (
        <>
          <input type="number" style={{ ...inputStyle, width: "50px" }} value={condition.hourMin ?? ""}
            onChange={(e) => update({ hourMin: e.target.value ? Number(e.target.value) : undefined })} disabled={disabled}
            placeholder="时起" min={0} max={23} />
          <span style={{ color: "#666" }}>~</span>
          <input type="number" style={{ ...inputStyle, width: "50px" }} value={condition.hourMax ?? ""}
            onChange={(e) => update({ hourMax: e.target.value ? Number(e.target.value) : undefined })} disabled={disabled}
            placeholder="时止" min={0} max={23} />
          <input style={{ ...inputStyle, width: "50px" }} value={condition.season ?? ""}
            onChange={(e) => update({ season: e.target.value || undefined })} disabled={disabled}
            placeholder="季节" />
        </>
      )}
    </div>
  );
}


interface CostEditorProps {
  cost: ActionCost;
  onChange: (c: ActionCost) => void;
  disabled: boolean;
  resourceKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  itemList: ItemInfo[];
}

function CostEditor({ cost, onChange, disabled, resourceKeys, basicInfoNumKeys, itemList }: CostEditorProps) {
  const update = (patch: Partial<ActionCost>) => onChange({ ...cost, ...patch });

  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      <select style={inputStyle} value={cost.type}
        onChange={(e) => onChange({ type: e.target.value as ActionCost["type"], amount: cost.amount })} disabled={disabled}>
        {COST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {(cost.type === "resource" || cost.type === "basicInfo") && (
        <select style={inputStyle} value={cost.key ?? ""}
          onChange={(e) => update({ key: e.target.value })} disabled={disabled}>
          <option value="">选择</option>
          {(cost.type === "resource" ? resourceKeys : basicInfoNumKeys)
            .map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      )}
      {cost.type === "item" && (
        <select style={inputStyle} value={cost.itemId ?? ""}
          onChange={(e) => update({ itemId: e.target.value })} disabled={disabled}>
          <option value="">选择物品</option>
          {itemList.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      )}
      <input type="number" style={{ ...inputStyle, width: "70px" }} value={cost.amount}
        onChange={(e) => update({ amount: Math.max(0, Number(e.target.value)) })} disabled={disabled} />
    </div>
  );
}

// ─── Reusable modifier list (for weight modifiers and value modifiers) ───

function ModifierListEditor({ modifiers, onChange, disabled, abilityKeys, traitCategories, traitList, label }: {
  modifiers: ValueModifier[];
  onChange: (mods: ValueModifier[]) => void;
  disabled: boolean;
  abilityKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  traitList: TraitInfo[];
  label: string;
}) {
  const add = () => onChange([...modifiers, { type: "ability", key: abilityKeys[0]?.key ?? "", per: 1000, bonus: 5 }]);
  const remove = (idx: number) => onChange(modifiers.filter((_, i) => i !== idx));
  const update = (idx: number, mod: ValueModifier) => {
    const next = [...modifiers];
    next[idx] = mod;
    onChange(next);
  };

  return (
    <div style={{ marginBottom: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#888", fontSize: "10px" }}>{label}</span>
        {!disabled && <button onClick={add} style={smallBtnStyle("#888")}>[+]</button>}
      </div>
      {modifiers.map((mod, idx) => (
        <div key={idx} style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "2px", flexWrap: "wrap" }}>
          <select style={{ ...inputStyle, width: "70px" }} value={mod.type}
            onChange={(e) => {
              const t = e.target.value as ValueModifier["type"];
              if (t === "ability") update(idx, { type: t, key: abilityKeys[0]?.key ?? "", per: 1000, bonus: mod.bonus });
              else if (t === "trait") update(idx, { type: t, key: traitCategories[0]?.key ?? "", value: "", bonus: mod.bonus });
              else update(idx, { type: t, source: "target", per: 100, bonus: mod.bonus });
            }} disabled={disabled}>
            <option value="ability">能力</option>
            <option value="trait">特质</option>
            <option value="favorability">好感度</option>
          </select>

          {mod.type === "ability" && (
            <>
              <select style={inputStyle} value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })} disabled={disabled}>
                {abilityKeys.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <span style={{ color: "#888", fontSize: "10px" }}>每</span>
              <input type="number" style={{ ...inputStyle, width: "55px" }} value={mod.per ?? 1000}
                onChange={(e) => update(idx, { ...mod, per: Number(e.target.value) })} disabled={disabled} />
            </>
          )}

          {mod.type === "trait" && (
            <>
              <select style={inputStyle} value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })} disabled={disabled}>
                {traitCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select style={inputStyle} value={mod.value ?? ""}
                onChange={(e) => update(idx, { ...mod, value: e.target.value })} disabled={disabled}>
                <option value="">任意值</option>
                {traitList.filter((t) => t.category === mod.key).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </>
          )}

          {mod.type === "favorability" && (
            <>
              <select style={inputStyle} value={mod.source ?? "target"}
                onChange={(e) => update(idx, { ...mod, source: e.target.value })} disabled={disabled}>
                <option value="target">目标→自身</option>
                <option value="self">自身→目标</option>
              </select>
              <span style={{ color: "#888", fontSize: "10px" }}>每</span>
              <input type="number" style={{ ...inputStyle, width: "55px" }} value={mod.per ?? 100}
                onChange={(e) => update(idx, { ...mod, per: Number(e.target.value) })} disabled={disabled} />
            </>
          )}

          <span style={{ color: "#888", fontSize: "10px" }}>+</span>
          <input type="number" style={{ ...inputStyle, width: "40px" }} value={mod.bonus}
            onChange={(e) => update(idx, { ...mod, bonus: Number(e.target.value) })} disabled={disabled} />
          {!disabled && <button onClick={() => remove(idx)} style={smallBtnStyle("#e94560")}>x</button>}
        </div>
      ))}
    </div>
  );
}

// ─── OutcomeEditor ───

interface OutcomeEditorProps {
  outcome: ActionOutcome;
  onChange: (o: ActionOutcome) => void;
  onRemove: () => void;
  disabled: boolean;
  definitions: GameDefinitions;
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  mapList: MapInfo[];
  traitList: TraitInfo[];
  itemList: ItemInfo[];
  npcList: { id: string; name: string }[];
}

function OutcomeEditor({ outcome, onChange, onRemove, disabled, resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots, mapList, traitList, itemList, npcList }: OutcomeEditorProps) {
  const update = (patch: Partial<ActionOutcome>) => onChange({ ...outcome, ...patch });

  const addEffect = () => {
    update({ effects: [...outcome.effects, { type: "resource", key: resourceKeys[0]?.key, op: "add", value: 0 }] });
  };
  const removeEffect = (idx: number) => {
    update({ effects: outcome.effects.filter((_, i) => i !== idx) });
  };
  const updateEffect = (idx: number, eff: ActionEffect) => {
    const next = [...outcome.effects];
    next[idx] = eff;
    update({ effects: next });
  };

  return (
    <div style={{ border: "1px solid #333", borderRadius: "3px", padding: "6px", marginBottom: "6px", backgroundColor: "#111122" }}>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
        <input style={{ ...inputStyle, width: "80px" }} value={outcome.grade}
          onChange={(e) => update({ grade: e.target.value })} disabled={disabled} placeholder="grade" />
        <input style={{ ...inputStyle, width: "60px" }} value={outcome.label}
          onChange={(e) => update({ label: e.target.value })} disabled={disabled} placeholder="标签" />
        <span style={{ color: "#888", fontSize: "11px" }}>权重:</span>
        <input type="number" style={{ ...inputStyle, width: "50px" }} value={outcome.weight}
          onChange={(e) => update({ weight: Math.max(0, Number(e.target.value)) })} disabled={disabled} />
        {!disabled && <button onClick={onRemove} style={{ ...smallBtnStyle("#e94560"), marginLeft: "auto" }}>x</button>}
      </div>

      {/* Weight modifiers */}
      <ModifierListEditor
        modifiers={outcome.weightModifiers ?? []}
        onChange={(mods) => update({ weightModifiers: mods.length > 0 ? mods : undefined })}
        disabled={disabled}
        abilityKeys={abilityKeys}
        traitCategories={traitCategories}
        traitList={traitList}
        label="权重修正"
      />

      {/* Effects */}
      <div style={{ marginBottom: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#888", fontSize: "10px" }}>效果</span>
          {!disabled && <button onClick={addEffect} style={smallBtnStyle("#0f0")}>[+ 效果]</button>}
        </div>
        {outcome.effects.length === 0 && <div style={{ color: "#555", fontSize: "11px" }}>无效果</div>}
        {outcome.effects.map((eff, idx) => (
          <div key={idx} style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "2px", flexWrap: "wrap" }}>
            <EffectEditor effect={eff} onChange={(e) => updateEffect(idx, e)} disabled={disabled}
              resourceKeys={resourceKeys} abilityKeys={abilityKeys} basicInfoNumKeys={basicInfoNumKeys}
              traitCategories={traitCategories} clothingSlots={clothingSlots} mapList={mapList} traitList={traitList} itemList={itemList} npcList={npcList} />
            {!disabled && <button onClick={() => removeEffect(idx)} style={smallBtnStyle("#e94560")}>x</button>}
          </div>
        ))}
      </div>

      {/* Output template */}
      <div>
        <span style={{ color: "#888", fontSize: "10px" }}>结果输出模板</span>
        <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: "2px" }}
          value={outcome.outputTemplate ?? ""} onChange={(e) => update({ outputTemplate: e.target.value })}
          disabled={disabled} placeholder="{{player}} ..." />
      </div>
    </div>
  );
}

interface EffectEditorProps {
  effect: ActionEffect;
  onChange: (e: ActionEffect) => void;
  disabled: boolean;
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  mapList: MapInfo[];
  traitList: TraitInfo[];
  itemList: ItemInfo[];
  npcList: { id: string; name: string }[];
}

function EffectEditor({ effect, onChange, disabled, resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots, mapList, traitList, itemList, npcList }: EffectEditorProps) {
  const update = (patch: Partial<ActionEffect>) => onChange({ ...effect, ...patch });

  return (
    <>
      <select style={inputStyle} value={effect.type}
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: "add" })} disabled={disabled}>
        {EFFECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {(effect.type === "resource" || effect.type === "ability" || effect.type === "basicInfo") && (
        <>
          <select style={inputStyle} value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })} disabled={disabled}>
            <option value="">选择</option>
            {(effect.type === "resource" ? resourceKeys : effect.type === "ability" ? abilityKeys : basicInfoNumKeys)
              .map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select style={inputStyle} value={effect.op} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            <option value="add">增加</option>
            <option value="set">设为</option>
          </select>
          <input type="number" style={{ ...inputStyle, width: "70px" }} value={effect.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
          <button type="button" style={{ ...inputStyle, cursor: "pointer", color: effect.valuePercent ? "#e94560" : "#888", minWidth: "28px", textAlign: "center" }}
            onClick={() => update({ valuePercent: !effect.valuePercent })} disabled={disabled}>
            %
          </button>
          <select style={inputStyle} value={effect.target ?? "self"}
            onChange={(e) => update({ target: e.target.value })} disabled={disabled}>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标NPC</option>
            {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </>
      )}

      {effect.type === "favorability" && (
        <>
          <span style={{ color: "#888", fontSize: "10px" }}>源:</span>
          <select style={inputStyle} value={effect.favFrom ?? "{{targetId}}"}
            onChange={(e) => update({ favFrom: e.target.value })} disabled={disabled}>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标</option>
            <option value="{{player}}">Player</option>
          </select>
          <span style={{ color: "#888", fontSize: "10px" }}>→</span>
          <span style={{ color: "#888", fontSize: "10px" }}>对象:</span>
          <select style={inputStyle} value={effect.favTo ?? "self"}
            onChange={(e) => update({ favTo: e.target.value })} disabled={disabled}>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标</option>
            <option value="{{player}}">Player</option>
          </select>
          <select style={inputStyle} value={effect.op} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            <option value="add">增加</option>
            <option value="set">设为</option>
          </select>
          <input type="number" style={{ ...inputStyle, width: "70px" }} value={effect.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
          <button type="button" style={{ ...inputStyle, cursor: "pointer", color: effect.valuePercent ? "#e94560" : "#888", minWidth: "28px", textAlign: "center" }}
            onClick={() => update({ valuePercent: !effect.valuePercent })} disabled={disabled}>
            %
          </button>
        </>
      )}

      {effect.type === "trait" && (
        <>
          <select style={inputStyle} value={effect.op} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            <option value="addTrait">添加</option>
            <option value="removeTrait">移除</option>
          </select>
          <select style={inputStyle} value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })} disabled={disabled}>
            <option value="">分类</option>
            {traitCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select style={inputStyle} value={effect.traitId ?? ""}
            onChange={(e) => update({ traitId: e.target.value })} disabled={disabled}>
            <option value="">特质</option>
            {traitList.filter((t) => !effect.key || t.category === effect.key)
              .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select style={inputStyle} value={effect.target ?? "self"}
            onChange={(e) => update({ target: e.target.value })} disabled={disabled}>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标NPC</option>
            {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </>
      )}

      {effect.type === "item" && (
        <>
          <select style={inputStyle} value={effect.op} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            <option value="addItem">添加</option>
            <option value="removeItem">移除</option>
          </select>
          <select style={inputStyle} value={effect.itemId ?? ""}
            onChange={(e) => update({ itemId: e.target.value })} disabled={disabled}>
            <option value="">选择物品</option>
            {itemList.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input type="number" style={{ ...inputStyle, width: "50px" }} value={effect.amount ?? 1}
            onChange={(e) => update({ amount: Math.max(1, Number(e.target.value)) })} disabled={disabled} />
          <select style={inputStyle} value={effect.target ?? "self"}
            onChange={(e) => update({ target: e.target.value })} disabled={disabled}>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标NPC</option>
            {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </>
      )}

      {effect.type === "clothing" && (
        <>
          <select style={inputStyle} value={effect.op} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            <option value="setState">设置状态</option>
          </select>
          <select style={inputStyle} value={effect.slot ?? ""}
            onChange={(e) => update({ slot: e.target.value })} disabled={disabled}>
            <option value="">槽位</option>
            {clothingSlots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={inputStyle} value={effect.state ?? "worn"}
            onChange={(e) => update({ state: e.target.value })} disabled={disabled}>
            <option value="worn">穿着</option>
            <option value="halfWorn">半穿</option>
            <option value="none">脱下</option>
            <option value="empty">无衣物</option>
          </select>
          <select style={inputStyle} value={effect.target ?? "self"}
            onChange={(e) => update({ target: e.target.value })} disabled={disabled}>
            <option value="self">自身</option>
            <option value="{{targetId}}">目标NPC</option>
            {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </>
      )}

      {effect.type === "position" && (() => {
        const cellOptions = effect.mapId
          ? mapList.find((m) => m.id === effect.mapId)?.cells ?? []
          : [];
        return (
          <>
            <select style={inputStyle} value={effect.mapId ?? ""}
              onChange={(e) => update({ mapId: e.target.value, cellId: undefined })} disabled={disabled}>
              <option value="">选择地图</option>
              {mapList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {effect.mapId && (
              <select style={inputStyle} value={effect.cellId != null ? String(effect.cellId) : ""}
                onChange={(e) => update({ cellId: e.target.value ? Number(e.target.value) : undefined })} disabled={disabled}>
                <option value="">选择格子</option>
                {cellOptions.map((c) => <option key={c.id} value={c.id}>{c.name ?? `#${c.id}`}</option>)}
              </select>
            )}
            <select style={inputStyle} value={effect.target ?? "self"}
              onChange={(e) => update({ target: e.target.value })} disabled={disabled}>
              <option value="self">自身</option>
              <option value="{{targetId}}">目标NPC</option>
              {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </>
        );
      })()}

      {/* Value modifiers (for numeric effect types) */}
      {(effect.type === "resource" || effect.type === "ability" || effect.type === "basicInfo" || effect.type === "favorability") && (
        <div style={{ width: "100%" }}>
          <ModifierListEditor
            modifiers={effect.valueModifiers ?? []}
            onChange={(mods) => update({ valueModifiers: mods.length > 0 ? mods : undefined })}
            disabled={disabled}
            abilityKeys={abilityKeys}
            traitCategories={traitCategories}
            traitList={traitList}
            label="数值修正"
          />
        </div>
      )}
    </>
  );
}

// ─── Template variable help panel ───

function TemplateVarHelp({ resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots }: {
  resourceKeys: KeyLabel[];
  abilityKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
}) {
  const s: React.CSSProperties = { color: "#0ff", fontSize: "11px", fontFamily: "monospace" };
  const d: React.CSSProperties = { color: "#888", fontSize: "11px" };
  const row = (v: string, desc: string) => (
    <div key={v} style={{ display: "flex", gap: "8px", marginBottom: "1px" }}>
      <span style={{ ...s, minWidth: "220px" }}>{`{{${v}}}`}</span>
      <span style={d}>{desc}</span>
    </div>
  );

  return (
    <div style={{ marginTop: "6px", padding: "8px", backgroundColor: "#0a0a1a", border: "1px solid #333", borderRadius: "3px", maxHeight: "300px", overflowY: "auto" }}>
      <div style={{ color: "#e94560", fontSize: "11px", fontWeight: "bold", marginBottom: "4px" }}>可用变量 (self = 行动者, target = 目标)</div>
      {row("player", "行动者名称 (= self.name)")}
      {row("target", "目标名称 (= target.name)")}
      {row("outcome", "结果标签 (成功/失败等)")}
      {row("outcomeGrade", "结果等级 (success/fail等)")}
      {row("effects", "效果摘要")}
      {row("time", "当前游戏时间")}
      {row("weather", "当前天气")}
      {row("location", "行动者所在地点")}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        资源 (self.resource.X / target.resource.X)
      </div>
      {resourceKeys.map((r) => row(`self.resource.${r.key}`, r.label))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        能力 (self.ability.X = 等级, self.abilityExp.X = 经验值)
      </div>
      {abilityKeys.map((a) => row(`self.ability.${a.key}`, `${a.label} 等级`))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        基本属性 (self.basicInfo.X / target.basicInfo.X)
      </div>
      {basicInfoNumKeys.map((b) => row(`self.basicInfo.${b.key}`, b.label))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        服装 (self.clothing.X / target.clothing.X)
      </div>
      {clothingSlots.map((sl) => row(`self.clothing.${sl}`, `${sl} 槽位衣物名`))}

      <div style={{ color: "#e9a045", fontSize: "11px", fontWeight: "bold", marginTop: "6px", marginBottom: "2px" }}>
        特质 (self.trait.X / target.trait.X)
      </div>
      {traitCategories.map((t) => row(`self.trait.${t.key}`, `${t.label} 值`))}
    </div>
  );
}
