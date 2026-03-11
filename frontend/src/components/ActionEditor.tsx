import { useState } from "react";
import type {
  ActionDefinition, ActionCondition, ConditionItem,
  ActionCost, ActionOutcome, ActionEffect,
  ValueModifier, GameDefinitions, OutputTemplateEntry, SuggestNext,
} from "../types/game";
import { createActionDef, saveActionDef, deleteActionDef } from "../api/client";

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

const sectionBase: React.CSSProperties = {
  marginBottom: "12px",
  padding: "8px 8px 8px 10px",
  backgroundColor: "#0a0a1a",
  border: "1px solid #333",
  borderRadius: "3px",
};

// Color-coded sections for visual distinction
const SEC = {
  basic:    { color: "#6ec6ff", border: "3px solid #6ec6ff" },
  weight:   { color: "#e9a045", border: "3px solid #e9a045" },
  cond:     { color: "#c78dff", border: "3px solid #c78dff" },
  outcome:  { color: "#e94560", border: "3px solid #e94560" },
  template: { color: "#7ecf7e", border: "3px solid #7ecf7e" },
};

// Alternating row style for list items — makes [x] buttons clearly belong to their row
const rowBg = (idx: number) => idx % 2 === 0 ? "#0c0c1e" : "#101028";
const listRowStyle = (idx: number, last: boolean): React.CSSProperties => ({
  backgroundColor: rowBg(idx),
  borderBottom: last ? "none" : "1px solid #1a1a2e",
  padding: "3px 4px",
  borderRadius: "2px",
});

const sectionStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  ...sectionBase,
  borderLeft: SEC[sec].border,
});

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
  { value: "variable", label: "派生变量" },
];

const COST_TYPES: { value: ActionCost["type"]; label: string }[] = [
  { value: "resource", label: "资源" },
  { value: "basicInfo", label: "基本属性" },
  { value: "item", label: "物品" },
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

export default function ActionEditor({ action, isNew, definitions, onBack, addonCrud }: Props) {
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
  const [outputTemplates, setOutputTemplates] = useState<import("../types/game").OutputTemplateEntry[]>(
    action.outputTemplates ?? (action.outputTemplate ? [{ text: action.outputTemplate }] : [])
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showVarHelp, setShowVarHelp] = useState(false);

  const isReadOnly = false;  // all addon entities are editable

  const { template, maps, traitDefs, itemDefs, clothingDefs, characters } = definitions;
  const resourceKeys = template.resources.map((r) => ({ key: r.key, label: r.label }));
  const abilityKeys = template.abilities.map((a) => ({ key: a.key, label: a.label }));
  const experienceKeys = (template.experiences ?? []).map((e: { key: string; label: string }) => ({ key: e.key, label: e.label }));
  const basicInfoNumKeys = template.basicInfo.filter((b) => b.type === "number").map((b) => ({ key: b.key, label: b.label }));
  const traitCategories = template.traits.map((t) => ({ key: t.key, label: t.label }));
  const clothingSlots = template.clothingSlots;
  const mapList = Object.values(maps);
  const traitList = Object.values(traitDefs);
  const itemList = Object.values(itemDefs);
  const npcList = Object.values(characters ?? {}).filter((c) => !c.isPlayer);
  const variableList = Object.values(definitions.variableDefs ?? {}).map((v) => ({ id: v.id, name: v.name || v.id }));
  const actionList = Object.values(definitions.actionDefs).map((a) => ({ id: a.id, name: a.name || a.id }));
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
    setOutcomes([...outcomes, { grade: "success", label: "成功", weight: 100, effects: [] }]);
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
        conditions, costs: [], outcomes,
        outputTemplates: outputTemplates.length > 0 ? outputTemplates : undefined,
      };
      if (addonCrud) {
        if (isNew) { await addonCrud.create(data); } else { await addonCrud.save(id, data); }
        return;
      }
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
      if (addonCrud) { await addonCrud.delete(id); return; }
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
        {action.source && <span style={{ color: "#e89a19", fontSize: "12px" }}>来源: {action.source}</span>}
      </div>

      {/* Basic info */}
      <div style={{ ...sectionStyle("basic"), display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ color: SEC.basic.color, fontSize: "12px", fontWeight: "bold" }}>基本信息</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={id} onChange={(e) => setId(e.target.value)} disabled={!isNew || isReadOnly} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>名称</div>
            <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={name} onChange={(e) => setName(e.target.value)} disabled={isReadOnly} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>分类</div>
            <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={categoryList.includes(category) ? category : "__custom__"}
              onChange={(e) => { if (e.target.value !== "__custom__") setCategory(e.target.value); }}
              disabled={isReadOnly}>
              {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">自定义...</option>
            </select>
            {!categoryList.includes(category) && (
              <input style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: "2px" }}
                value={category} onChange={(e) => setCategory(e.target.value)} disabled={isReadOnly}
                placeholder="输入新分类" />
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
          <div>
            <div style={labelStyle}>目标类型</div>
            <select style={inputStyle} value={targetType}
              onChange={(e) => setTargetType(e.target.value as ActionDefinition["targetType"])} disabled={isReadOnly}>
              <option value="none">无目标</option>
              <option value="npc">NPC</option>
              <option value="self">自身</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>时间消耗(分)</div>
            <input type="number" step={5} min={0} style={{ ...inputStyle, width: "80px" }}
              value={timeCost} onChange={(e) => setTimeCost(Math.max(0, Math.round(Number(e.target.value) / 5) * 5))} disabled={isReadOnly} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: isReadOnly ? "default" : "pointer", paddingBottom: "4px" }}>
            <input type="checkbox" checked={triggerLLM} onChange={(e) => setTriggerLLM(e.target.checked)} disabled={isReadOnly} />
            <span style={{ fontSize: "12px" }}>触发LLM</span>
          </label>
        </div>
      </div>

      {/* NPC Weight */}
      <div style={sectionStyle("weight")}>
        <div style={{ color: SEC.weight.color, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>NPC 权重</div>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div>
            <div style={labelStyle}>基础权重</div>
            <input type="number" style={{ ...inputStyle, width: "80px" }}
              value={npcWeight} onChange={(e) => setNpcWeight(Number(e.target.value))} disabled={isReadOnly} />
            <div style={{ color: "#666", fontSize: "10px", marginTop: "2px" }}>0 = NPC不会执行此行动</div>
          </div>
          <div style={{
            flex: 1,
            paddingLeft: "8px",
            borderLeft: "2px solid #333",
            backgroundColor: "#0d0d1e",
            borderRadius: "0 3px 3px 0",
          }}>
            <ModifierListEditor
              modifiers={npcWeightModifiers}
              onChange={setNpcWeightModifiers}
              disabled={isReadOnly}
              abilityKeys={abilityKeys}
              experienceKeys={experienceKeys}
              traitCategories={traitCategories}
              traitList={traitList}
              variableList={variableList}
              label="↳ 权重修正"
            />
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div style={sectionStyle("cond")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ color: SEC.cond.color, fontSize: "12px", fontWeight: "bold" }}>显示条件 (AND)</span>
          {!isReadOnly && (
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={addCondition} style={smallBtnStyle("#0f0")}>[+ 条件]</button>
              <button onClick={addOrGroup} style={smallBtnStyle("#0f0")}>[+ OR]</button>
              <button onClick={addAndGroup} style={smallBtnStyle("#0f0")}>[+ AND]</button>
            </div>
          )}
        </div>
        {conditions.length === 0 && <div style={{ color: "#666", fontSize: "12px" }}>无条件（始终显示）</div>}
        {conditions.map((item, idx) => (
          <div key={idx} style={listRowStyle(idx, idx === conditions.length - 1)}>
            <ConditionItemEditor
              item={item}
              onChange={(newItem) => updateCondition(idx, newItem)}
              onRemove={() => removeCondition(idx)}
              disabled={isReadOnly}
              depth={0}
              ctx={{
                definitions, resourceKeys, abilityKeys, basicInfoNumKeys,
                traitCategories, clothingSlots, mapList, traitList, itemList, npcList, variableList, variableList,
              }}
            />
          </div>
        ))}
      </div>

      {/* Outcomes */}
      <div style={sectionStyle("outcome")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ color: SEC.outcome.color, fontSize: "12px", fontWeight: "bold" }}>结果分级</span>
          {!isReadOnly && <button onClick={addOutcome} style={smallBtnStyle("#0f0")}>[+ 结果]</button>}
        </div>
        {outcomes.length === 0 && <div style={{ color: "#666", fontSize: "12px" }}>无结果（固定成功）</div>}
        {outcomes.map((outcome, idx) => (
          <OutcomeEditor key={idx} outcome={outcome} onChange={(o) => updateOutcome(idx, o)}
            onRemove={() => removeOutcome(idx)} disabled={isReadOnly} definitions={definitions}
            resourceKeys={resourceKeys} abilityKeys={abilityKeys} experienceKeys={experienceKeys} basicInfoNumKeys={basicInfoNumKeys}
            traitCategories={traitCategories} clothingSlots={clothingSlots} mapList={mapList} traitList={traitList} itemList={itemList} npcList={npcList} variableList={variableList} actionList={actionList} categoryList={categoryList} />
        ))}
      </div>

      {/* Output templates */}
      <div style={sectionStyle("template")}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <span style={{ color: SEC.template.color, fontSize: "12px", fontWeight: "bold" }}>行为模板</span>
          <button onClick={() => setShowVarHelp((v) => !v)}
            style={{ ...smallBtnStyle(showVarHelp ? "#e94560" : "#888"), fontSize: "11px" }}>
            [?]
          </button>
        </div>
        <TemplateListEditor
          templates={outputTemplates}
          onChange={setOutputTemplates}
          disabled={isReadOnly}
          ctx={{
            definitions, resourceKeys, abilityKeys, basicInfoNumKeys,
            traitCategories, clothingSlots, mapList, traitList, itemList, npcList, variableList,
          }}
        />
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
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving}
            style={{ ...smallBtnStyle("#0f0"), padding: "5px 16px", fontSize: "13px", cursor: saving ? "not-allowed" : "pointer" }}>
            [保存]
          </button>
        )}
        {!isReadOnly && !isNew && (
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
interface MapInfo { id: string; name: string; cells: { id: number; name?: string; tags?: string[] }[] }
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
  variableList: { id: string; name: string }[];
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
        <div key={idx} style={{ ...listRowStyle(idx, idx === items.length - 1), marginBottom: "2px" }}>
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
  const { resourceKeys, abilityKeys, basicInfoNumKeys, traitCategories, clothingSlots, mapList, traitList, itemList, npcList, variableList } = ctx;
  const update = (patch: Partial<ActionCondition>) => onChange({ ...condition, ...patch });

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
        <LocationCondEditor condition={condition} onChange={update} disabled={disabled} mapList={mapList} />
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

      {condition.type === "variable" && (
        <>
          <select style={inputStyle} value={condition.varId ?? ""}
            onChange={(e) => update({ varId: e.target.value })} disabled={disabled}>
            <option value="">选择变量</option>
            {variableList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select style={inputStyle} value={condition.op ?? ">="} onChange={(e) => update({ op: e.target.value })} disabled={disabled}>
            {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input type="number" style={{ ...inputStyle, width: "70px" }} value={condition.value ?? 0}
            onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
        </>
      )}
    </div>
  );
}


// ─── Location condition editor with tag support ───

function LocationCondEditor({
  condition, onChange, disabled, mapList,
}: {
  condition: ActionCondition;
  onChange: (patch: Partial<ActionCondition>) => void;
  disabled: boolean;
  mapList: MapInfo[];
}) {
  const selectedMap = mapList.find((m) => m.id === condition.mapId);
  const cells = selectedMap?.cells ?? [];
  const selectedIds = new Set(condition.cellIds ?? []);
  const selectedTags = new Set(condition.cellTags ?? []);

  // Collect all unique tags across cells in this map
  const allTags = [...new Set(cells.flatMap((c) => c.tags ?? []))].sort();

  // Compute which cells are matched by selected tags
  const tagMatchedIds = new Set(
    cells.filter((c) => (c.tags ?? []).some((t) => selectedTags.has(t))).map((c) => c.id)
  );

  const toggleCell = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ cellIds: [...next] });
  };

  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    onChange({ cellTags: [...next] });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <select style={inputStyle} value={condition.mapId ?? ""}
        onChange={(e) => onChange({ mapId: e.target.value, cellIds: [], cellTags: [] })} disabled={disabled}>
        <option value="">选择地图</option>
        {mapList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {condition.mapId && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
          {allTags.length > 0 && allTags.map((tag) => (
            <label key={`tag-${tag}`} style={{
              display: "inline-flex", alignItems: "center", gap: "3px",
              padding: "2px 6px", fontSize: "11px", cursor: disabled ? "default" : "pointer",
              backgroundColor: selectedTags.has(tag) ? "#2a4a2a" : "#1a1a2e",
              border: `1px solid ${selectedTags.has(tag) ? "#4a8a4a" : "#333"}`,
              borderRadius: "3px", color: selectedTags.has(tag) ? "#8f8" : "#aaa",
            }}>
              <input type="checkbox" checked={selectedTags.has(tag)} onChange={() => toggleTag(tag)}
                disabled={disabled} style={{ margin: 0, width: "12px", height: "12px" }} />
              #{tag}
            </label>
          ))}
          {cells.map((c) => {
            const isTagged = tagMatchedIds.has(c.id);
            const isManual = selectedIds.has(c.id);
            const isActive = isTagged || isManual;
            return (
              <label key={c.id} style={{
                display: "inline-flex", alignItems: "center", gap: "3px",
                padding: "2px 6px", fontSize: "11px", cursor: disabled ? "default" : "pointer",
                backgroundColor: isActive ? (isTagged ? "#1a3a4a" : "#2a2a4a") : "#1a1a2e",
                border: `1px solid ${isActive ? (isTagged ? "#4a8aaa" : "#6a6aaa") : "#333"}`,
                borderRadius: "3px", color: isActive ? "#ddd" : "#888",
                opacity: isTagged && !isManual ? 0.8 : 1,
              }}>
                <input type="checkbox" checked={isManual} onChange={() => toggleCell(c.id)}
                  disabled={disabled || isTagged} style={{ margin: 0, width: "12px", height: "12px" }} />
                {c.name ?? `#${c.id}`}
                {isTagged && <span style={{ fontSize: "9px", color: "#4a8aaa" }}>(tag)</span>}
              </label>
            );
          })}
        </div>
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

function ModifierListEditor({ modifiers, onChange, disabled, abilityKeys, experienceKeys, traitCategories, traitList, variableList, label }: {
  modifiers: ValueModifier[];
  onChange: (mods: ValueModifier[]) => void;
  disabled: boolean;
  abilityKeys: KeyLabel[];
  experienceKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  traitList: TraitInfo[];
  variableList: { id: string; name: string }[];
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
        <div key={idx} style={{ ...listRowStyle(idx, idx === modifiers.length - 1), display: "flex", gap: "4px", alignItems: "center", marginTop: "2px", flexWrap: "wrap" }}>
          <select style={{ ...inputStyle, width: "70px" }} value={mod.type}
            onChange={(e) => {
              const t = e.target.value as ValueModifier["type"];
              if (t === "ability") update(idx, { type: t, key: abilityKeys[0]?.key ?? "", per: 1000, bonus: mod.bonus, bonusMode: mod.bonusMode });
              else if (t === "experience") update(idx, { type: t, key: experienceKeys[0]?.key ?? "", per: 1, bonus: mod.bonus, bonusMode: mod.bonusMode });
              else if (t === "trait") update(idx, { type: t, key: traitCategories[0]?.key ?? "", value: "", bonus: mod.bonus, bonusMode: mod.bonusMode });
              else if (t === "variable") update(idx, { type: t, varId: variableList[0]?.id ?? "", per: 1, bonus: mod.bonus, bonusMode: mod.bonusMode });
              else update(idx, { type: t, source: "target", per: 100, bonus: mod.bonus, bonusMode: mod.bonusMode });
            }} disabled={disabled}>
            <option value="ability">能力</option>
            <option value="experience">经验</option>
            <option value="trait">特质</option>
            <option value="favorability">好感度</option>
            <option value="variable">派生变量</option>
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

          {mod.type === "experience" && (
            <>
              <select style={inputStyle} value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })} disabled={disabled}>
                {experienceKeys.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
              <span style={{ color: "#888", fontSize: "10px" }}>每</span>
              <input type="number" style={{ ...inputStyle, width: "55px" }} value={mod.per ?? 1}
                onChange={(e) => update(idx, { ...mod, per: Number(e.target.value) })} disabled={disabled} />
            </>
          )}

          {mod.type === "trait" && (
            <>
              <select style={inputStyle} value={mod.key ?? ""}
                onChange={(e) => update(idx, { ...mod, key: e.target.value })} disabled={disabled}>
                {traitCategories.filter((c) => c.key !== "ability" && c.key !== "experience").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
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

          {mod.type === "variable" && (
            <>
              <select style={inputStyle} value={mod.varId ?? ""}
                onChange={(e) => update(idx, { ...mod, varId: e.target.value })} disabled={disabled}>
                <option value="">选择变量</option>
                {variableList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <span style={{ color: "#888", fontSize: "10px" }}>每</span>
              <input type="number" style={{ ...inputStyle, width: "55px" }} value={mod.per ?? 1}
                onChange={(e) => update(idx, { ...mod, per: Number(e.target.value) })} disabled={disabled} />
            </>
          )}

          <select style={{ ...inputStyle, width: "auto", fontSize: "10px" }}
            value={mod.bonusMode ?? "add"}
            onChange={(e) => update(idx, { ...mod, bonusMode: e.target.value as "add" | "multiply" })}
            disabled={disabled}>
            <option value="add">+</option>
            <option value="multiply">x%</option>
          </select>
          <input type="number" style={{ ...inputStyle, width: "60px" }} value={mod.bonus}
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
  experienceKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  mapList: MapInfo[];
  traitList: TraitInfo[];
  itemList: ItemInfo[];
  npcList: { id: string; name: string }[];
  variableList: { id: string; name: string }[];
  actionList: { id: string; name: string }[];
  categoryList: string[];
}

function OutcomeEditor({ outcome, onChange, onRemove, disabled, definitions, resourceKeys, abilityKeys, experienceKeys, basicInfoNumKeys, traitCategories, clothingSlots, mapList, traitList, itemList, npcList, variableList, actionList, categoryList }: OutcomeEditorProps) {
  const [showChain, setShowChain] = useState((outcome.suggestNext ?? []).length > 0);
  const [showOutTpl, setShowOutTpl] = useState(
    (outcome.outputTemplates ?? []).length > 0 || !!outcome.outputTemplate
  );

  const update = (patch: Partial<ActionOutcome>) => onChange({ ...outcome, ...patch });

  const removeEffect = (idx: number) => {
    update({ effects: outcome.effects.filter((_, i) => i !== idx) });
  };
  const updateEffect = (idx: number, eff: ActionEffect) => {
    const next = [...outcome.effects];
    next[idx] = eff;
    update({ effects: next });
  };

  // Group effects by target
  const targetGroups: { target: string; label: string; indices: number[] }[] = [];
  const seenTargets: Record<string, number> = {};
  for (let i = 0; i < outcome.effects.length; i++) {
    const eff = outcome.effects[i];
    const t = eff.target ?? "self";
    if (t in seenTargets) {
      targetGroups[seenTargets[t]].indices.push(i);
    } else {
      seenTargets[t] = targetGroups.length;
      const label = t === "self" ? "自身" : t === "{{targetId}}" ? "目标NPC" : (npcList.find((n) => n.id === t)?.name ?? t);
      targetGroups.push({ target: t, label, indices: [i] });
    }
  }

  const addEffectForTarget = (targetVal: string) => {
    update({ effects: [...outcome.effects, { type: "resource", key: resourceKeys[0]?.key, op: "add", value: 0, target: targetVal }] });
  };

  const addTargetGroup = () => {
    const newTarget = "self" in seenTargets ? "{{targetId}}" : "self";
    addEffectForTarget(newTarget);
  };

  const changeGroupTarget = (oldTarget: string, newTarget: string) => {
    const next = [...outcome.effects];
    for (let i = 0; i < next.length; i++) {
      const t = next[i].target ?? "self";
      if (t === oldTarget) {
        next[i] = { ...next[i], target: newTarget };
      }
    }
    update({ effects: next });
  };

  const targetColor = (t: string) => t === "self" ? "#6ec6ff" : "#e9a045";

  // Sub-section header helper
  const subHeader = (label: string, color: string, count: number | null, rightContent?: React.ReactNode) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "3px 0", marginBottom: "4px",
      borderBottom: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: "11px", fontWeight: "bold" }}>
        <span style={{ color, marginRight: "4px" }}>|</span>
        <span style={{ color: "#bbb" }}>{label}</span>
        {count !== null && <span style={{ color: "#666", fontSize: "10px", marginLeft: "4px" }}>({count})</span>}
      </span>
      {rightContent}
    </div>
  );

  // Collapsible toggle header helper
  const toggleHeader = (label: string, color: string, isOpen: boolean, toggle: () => void, count: number, rightContent?: React.ReactNode) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "3px 0", cursor: "pointer", userSelect: "none",
      borderBottom: isOpen ? `1px solid ${color}33` : "none",
      marginBottom: isOpen ? "4px" : "0",
      opacity: isOpen || count > 0 ? 1 : 0.5,
    }} onClick={toggle}>
      <span style={{ fontSize: "11px", fontWeight: "bold" }}>
        <span style={{ color, marginRight: "4px" }}>{isOpen ? "\u25BC" : "\u25B6"}</span>
        <span style={{ color: "#bbb" }}>{label}</span>
        {count > 0 && <span style={{ color: "#666", fontSize: "10px", marginLeft: "4px" }}>({count})</span>}
      </span>
      <div onClick={(e) => e.stopPropagation()}>{rightContent}</div>
    </div>
  );

  const chainCount = (outcome.suggestNext ?? []).length;
  const tplCount = (outcome.outputTemplates ?? (outcome.outputTemplate ? [{ text: outcome.outputTemplate }] : [])).length;

  return (
    <div style={{ border: "1px solid #444", borderRadius: "3px", padding: "8px", marginBottom: "8px", backgroundColor: "#111122" }}>
      {/* Outcome header: grade, label, weight */}
      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px", paddingBottom: "6px", borderBottom: "1px solid #333" }}>
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
      <div style={{
        marginLeft: "8px",
        paddingLeft: "8px",
        borderLeft: "2px solid #333",
        backgroundColor: "#0d0d1e",
        borderRadius: "0 3px 3px 0",
        marginBottom: "8px",
      }}>
        <ModifierListEditor
          modifiers={outcome.weightModifiers ?? []}
          onChange={(mods) => update({ weightModifiers: mods.length > 0 ? mods : undefined })}
          disabled={disabled}
          abilityKeys={abilityKeys}
          experienceKeys={experienceKeys}
          traitCategories={traitCategories}
          traitList={traitList}
          label="↳ 权重修正"
        />
      </div>

      {/* Effects grouped by target */}
      <div style={{ marginBottom: "8px" }}>
        {subHeader("效果", "#6ec6ff", outcome.effects.length,
          !disabled && <button onClick={addTargetGroup} style={smallBtnStyle("#0f0")}>[+ 目标组]</button>
        )}
        {targetGroups.length === 0 && <div style={{ color: "#555", fontSize: "11px", paddingLeft: "12px" }}>无效果</div>}
        {targetGroups.map((group) => (
          <div key={group.target} style={{
            border: `1px solid ${targetColor(group.target)}33`,
            borderLeft: `3px solid ${targetColor(group.target)}`,
            borderRadius: "3px",
            padding: "4px 6px",
            marginBottom: "4px",
            backgroundColor: "#0a0a1a",
          }}>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ color: targetColor(group.target), fontSize: "11px", fontWeight: "bold" }}>目标:</span>
              <select style={{ ...inputStyle, width: "auto", fontSize: "11px" }}
                value={group.target}
                onChange={(e) => changeGroupTarget(group.target, e.target.value)}
                disabled={disabled}>
                <option value="self">自身</option>
                <option value="{{targetId}}">目标NPC</option>
                {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              {!disabled && (
                <button onClick={() => addEffectForTarget(group.target)} style={{ ...smallBtnStyle("#0f0"), marginLeft: "auto" }}>
                  [+ 效果]
                </button>
              )}
            </div>
            {group.indices.map((effIdx, gi) => {
              const eff = outcome.effects[effIdx];
              const hasModifiers = (eff.type === "resource" || eff.type === "ability" || eff.type === "basicInfo" || eff.type === "favorability");
              return (
                <div key={effIdx} style={{ ...listRowStyle(gi, gi === group.indices.length - 1), marginTop: "2px" }}>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                    <EffectEditor effect={eff} onChange={(e) => updateEffect(effIdx, { ...e, target: group.target })} disabled={disabled}
                      resourceKeys={resourceKeys} abilityKeys={abilityKeys} experienceKeys={experienceKeys} basicInfoNumKeys={basicInfoNumKeys}
                      traitCategories={traitCategories} clothingSlots={clothingSlots} mapList={mapList} traitList={traitList} itemList={itemList} variableList={variableList} />
                    {!disabled && <button onClick={() => removeEffect(effIdx)} style={smallBtnStyle("#e94560")}>x</button>}
                  </div>
                  {hasModifiers && (
                    <div style={{
                      marginTop: "2px",
                      marginLeft: "12px",
                      paddingLeft: "8px",
                      borderLeft: "2px solid #333",
                      backgroundColor: "#0d0d1e",
                      borderRadius: "0 3px 3px 0",
                    }}>
                      <ModifierListEditor
                        modifiers={eff.valueModifiers ?? []}
                        onChange={(mods) => updateEffect(effIdx, { ...eff, target: group.target, valueModifiers: mods.length > 0 ? mods : undefined })}
                        disabled={disabled}
                        abilityKeys={abilityKeys}
                        experienceKeys={experienceKeys}
                        traitCategories={traitCategories}
                        traitList={traitList}
                        variableList={variableList}
                        label="↳ 数值修正"
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
      <div style={{ marginBottom: "6px" }}>
        {toggleHeader("行动链", "#e9a045", showChain, () => setShowChain(!showChain), chainCount,
          !disabled && showChain && (
            <button
              onClick={() => update({
                suggestNext: [...(outcome.suggestNext ?? []), { actionId: actionList[0]?.id ?? "", bonus: 50, decay: 60 }],
              })}
              style={smallBtnStyle("#0f0")}
            >
              [+]
            </button>
          )
        )}
        {showChain && (
          <div style={{ paddingLeft: "12px" }}>
            {chainCount === 0 && <div style={{ color: "#555", fontSize: "11px" }}>无行动链（此结果后NPC自由选择下一行动）</div>}
            {(outcome.suggestNext ?? []).map((sn, snIdx) => {
              const mode = sn.category ? "category" : "action";
              const updateSn = (patch: Partial<SuggestNext>) => {
                const next = [...(outcome.suggestNext ?? [])];
                next[snIdx] = { ...next[snIdx], ...patch };
                update({ suggestNext: next });
              };
              return (
                <div key={snIdx} style={{
                  ...listRowStyle(snIdx, snIdx === (outcome.suggestNext ?? []).length - 1),
                  display: "flex", gap: "4px", alignItems: "center",
                  borderLeft: "2px solid #e9a04566",
                  borderRadius: "0 3px 3px 0",
                }}>
                  <select
                    style={{ ...inputStyle, width: "auto", fontSize: "10px", color: mode === "category" ? "#e9a045" : "#6ec6ff" }}
                    value={mode}
                    onChange={(e) => {
                      if (e.target.value === "category") {
                        updateSn({ actionId: undefined, category: categoryList[0] ?? "" });
                      } else {
                        updateSn({ category: undefined, actionId: actionList[0]?.id ?? "" });
                      }
                    }}
                    disabled={disabled}
                    title="匹配模式：单个行动 或 整个分类"
                  >
                    <option value="action">行动</option>
                    <option value="category">分类</option>
                  </select>
                  {mode === "action" ? (
                    <select
                      style={{ ...inputStyle, flex: 1, fontSize: "11px" }}
                      value={sn.actionId ?? ""}
                      onChange={(e) => updateSn({ actionId: e.target.value })}
                      disabled={disabled}
                    >
                      <option value="">-- 选择行动 --</option>
                      {actionList.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      style={{ ...inputStyle, flex: 1, fontSize: "11px" }}
                      value={sn.category ?? ""}
                      onChange={(e) => updateSn({ category: e.target.value })}
                      disabled={disabled}
                    >
                      <option value="">-- 选择分类 --</option>
                      {categoryList.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                  <span style={{ color: "#e9a045", fontSize: "10px", whiteSpace: "nowrap" }}>+</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "45px" }}
                    value={sn.bonus}
                    onChange={(e) => updateSn({ bonus: Number(e.target.value) })}
                    disabled={disabled}
                    title="权重加成"
                  />
                  <span style={{ color: "#666", fontSize: "10px", whiteSpace: "nowrap" }}>/</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "45px" }}
                    value={sn.decay}
                    onChange={(e) => updateSn({ decay: Math.max(1, Number(e.target.value)) })}
                    disabled={disabled}
                    title="衰减时间(分钟)"
                  />
                  <span style={{ color: "#666", fontSize: "10px" }}>分</span>
                  {!disabled && (
                    <button
                      onClick={() => {
                        const next = (outcome.suggestNext ?? []).filter((_, i) => i !== snIdx);
                        update({ suggestNext: next.length > 0 ? next : undefined });
                      }}
                      style={smallBtnStyle("#e94560")}
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
        {toggleHeader("结果输出", "#7ecf7e", showOutTpl, () => setShowOutTpl(!showOutTpl), tplCount)}
        {showOutTpl && (
          <div style={{ paddingLeft: "12px" }}>
            <TemplateListEditor
              templates={outcome.outputTemplates ?? (outcome.outputTemplate ? [{ text: outcome.outputTemplate }] : [])}
              onChange={(tpls) => update({ outputTemplates: tpls.length > 0 ? tpls : undefined, outputTemplate: undefined })}
              disabled={disabled}
              ctx={{
                definitions, resourceKeys, abilityKeys, basicInfoNumKeys,
                traitCategories, clothingSlots, mapList, traitList, itemList, npcList, variableList,
              }}
            />
          </div>
        )}
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
  experienceKeys: KeyLabel[];
  basicInfoNumKeys: KeyLabel[];
  traitCategories: KeyLabel[];
  clothingSlots: string[];
  mapList: MapInfo[];
  traitList: TraitInfo[];
  itemList: ItemInfo[];
  variableList: { id: string; name: string }[];
}

function EffectEditor({ effect, onChange, disabled, resourceKeys, abilityKeys, experienceKeys, basicInfoNumKeys, traitCategories, clothingSlots, mapList, traitList, itemList, variableList }: EffectEditorProps) {
  const update = (patch: Partial<ActionEffect>) => onChange({ ...effect, ...patch });

  return (
    <>
      <select style={inputStyle} value={effect.type}
        onChange={(e) => onChange({ type: e.target.value as ActionEffect["type"], op: "add" })} disabled={disabled}>
        {EFFECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {(effect.type === "resource" || effect.type === "ability" || effect.type === "basicInfo") && (() => {
        const isVarMode = typeof effect.value === "object" && effect.value !== null;
        const varVal = isVarMode ? (effect.value as { varId: string; multiply?: number }) : null;
        return (
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
            <button type="button" style={{ ...inputStyle, cursor: "pointer", color: isVarMode ? "#e94560" : "#888", minWidth: "28px", textAlign: "center" }}
              onClick={() => {
                if (isVarMode) {
                  update({ value: 0 });
                } else {
                  update({ value: { varId: variableList[0]?.id ?? "", multiply: 1 } as any });
                }
              }} disabled={disabled} title="切换固定值/变量引用">
              V
            </button>
            {isVarMode ? (
              <>
                <select style={inputStyle} value={varVal?.varId ?? ""}
                  onChange={(e) => update({ value: { ...varVal!, varId: e.target.value } as any })} disabled={disabled}>
                  <option value="">选择变量</option>
                  {variableList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <span style={{ color: "#888", fontSize: "10px" }}>×</span>
                <input type="number" step="0.1" style={{ ...inputStyle, width: "55px" }} value={varVal?.multiply ?? 1}
                  onChange={(e) => update({ value: { ...varVal!, multiply: Number(e.target.value) } as any })} disabled={disabled} />
              </>
            ) : (
              <>
                <input type="number" style={{ ...inputStyle, width: "70px" }} value={(effect.value as number) ?? 0}
                  onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
                <button type="button" style={{ ...inputStyle, cursor: "pointer", color: effect.valuePercent ? "#e94560" : "#888", minWidth: "28px", textAlign: "center" }}
                  onClick={() => update({ valuePercent: !effect.valuePercent })} disabled={disabled}>
                  %
                </button>
              </>
            )}
          </>
        );
      })()}

      {effect.type === "experience" && (
        <>
          <select style={inputStyle} value={effect.key ?? ""}
            onChange={(e) => update({ key: e.target.value })} disabled={disabled}>
            <option value="">选择</option>
            {experienceKeys.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <span style={{ color: "#888", fontSize: "10px" }}>+</span>
          <input type="number" style={{ ...inputStyle, width: "50px" }} value={effect.value ?? 1}
            onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
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
          {(() => {
            const isVarMode = typeof effect.value === "object" && effect.value !== null;
            const varVal = isVarMode ? (effect.value as { varId: string; multiply?: number }) : null;
            return (
              <>
                <button type="button" style={{ ...inputStyle, cursor: "pointer", color: isVarMode ? "#e94560" : "#888", minWidth: "28px", textAlign: "center" }}
                  onClick={() => {
                    if (isVarMode) update({ value: 0 });
                    else update({ value: { varId: variableList[0]?.id ?? "", multiply: 1 } as any });
                  }} disabled={disabled} title="切换固定值/变量引用">
                  V
                </button>
                {isVarMode ? (
                  <>
                    <select style={inputStyle} value={varVal?.varId ?? ""}
                      onChange={(e) => update({ value: { ...varVal!, varId: e.target.value } as any })} disabled={disabled}>
                      <option value="">选择变量</option>
                      {variableList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <span style={{ color: "#888", fontSize: "10px" }}>×</span>
                    <input type="number" step="0.1" style={{ ...inputStyle, width: "55px" }} value={varVal?.multiply ?? 1}
                      onChange={(e) => update({ value: { ...varVal!, multiply: Number(e.target.value) } as any })} disabled={disabled} />
                  </>
                ) : (
                  <>
                    <input type="number" style={{ ...inputStyle, width: "70px" }} value={(effect.value as number) ?? 0}
                      onChange={(e) => update({ value: Number(e.target.value) })} disabled={disabled} />
                    <button type="button" style={{ ...inputStyle, cursor: "pointer", color: effect.valuePercent ? "#e94560" : "#888", minWidth: "28px", textAlign: "center" }}
                      onClick={() => update({ valuePercent: !effect.valuePercent })} disabled={disabled}>
                      %
                    </button>
                  </>
                )}
              </>
            );
          })()}
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
          </>
        );
      })()}

    </>
  );
}

// ─── Template list editor (multiple conditional templates) ───

function TemplateListEditor({ templates, onChange, disabled, ctx }: {
  templates: OutputTemplateEntry[];
  onChange: (tpls: OutputTemplateEntry[]) => void;
  disabled: boolean;
  ctx: ConditionCtx;
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
        <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
          {!disabled && templates.length === 0 && (
            <button onClick={add} style={smallBtnStyle("#0f0")}>[+ 模板]</button>
          )}
          {templates.length === 1 && !disabled && (
            <button onClick={add} style={smallBtnStyle("#0f0")}>[+ 分支]</button>
          )}
        </div>
        {templates.length === 1 && (
          <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
            <textarea style={{ ...inputStyle, flex: 1, boxSizing: "border-box", minHeight: "32px", resize: "vertical" }}
              value={templates[0].text}
              onChange={(e) => update(0, { ...templates[0], text: e.target.value })}
              disabled={disabled} placeholder="{{player}} ..." />
            {!disabled && <button onClick={() => remove(0)} style={smallBtnStyle("#e94560")}>x</button>}
          </div>
        )}
      </div>
    );
  }

  // Multiple templates: show conditions + weight for each
  return (
    <div>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
        {!disabled && <button onClick={add} style={smallBtnStyle("#0f0")}>[+ 分支]</button>}
        <span style={{ color: "#666", fontSize: "10px" }}>满足条件的模板中随机选择（按权重）</span>
      </div>
      {templates.map((entry, idx) => (
        <div key={idx} style={{
          ...listRowStyle(idx, idx === templates.length - 1),
          border: "1px solid #333", borderRadius: "3px", padding: "4px 6px",
        }}>
          <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
            <span style={{ color: "#6ec6ff", fontSize: "10px", fontWeight: "bold" }}>#{idx + 1}</span>
            <span style={{ color: "#888", fontSize: "10px" }}>权重:</span>
            <input type="number" style={{ ...inputStyle, width: "50px" }} value={entry.weight ?? 1}
              onChange={(e) => update(idx, { ...entry, weight: Math.max(0, Number(e.target.value)) })}
              disabled={disabled} />
            {!disabled && <button onClick={() => remove(idx)} style={{ ...smallBtnStyle("#e94560"), marginLeft: "auto" }}>x</button>}
          </div>
          <textarea style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: "32px", resize: "vertical", marginBottom: "2px" }}
            value={entry.text}
            onChange={(e) => update(idx, { ...entry, text: e.target.value })}
            disabled={disabled} placeholder="{{player}} ..." />
          {/* Conditions */}
          <TemplateConditionsEditor
            conditions={entry.conditions ?? []}
            onChange={(conds) => update(idx, { ...entry, conditions: conds.length > 0 ? conds : undefined })}
            disabled={disabled}
            ctx={ctx}
          />
        </div>
      ))}
    </div>
  );
}

function TemplateConditionsEditor({ conditions, onChange, disabled, ctx }: {
  conditions: ConditionItem[];
  onChange: (conds: ConditionItem[]) => void;
  disabled: boolean;
  ctx: ConditionCtx;
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
    <div style={{
      paddingLeft: "8px",
      borderLeft: "2px solid #333",
      marginTop: "2px",
    }}>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
        <span style={{ color: "#888", fontSize: "10px" }}>↳ 条件</span>
        {!disabled && <button onClick={addCond} style={smallBtnStyle("#888")}>[+]</button>}
        {conditions.length === 0 && <span style={{ color: "#555", fontSize: "10px" }}>无条件（始终可选）</span>}
      </div>
      {conditions.map((item, idx) => (
        <div key={idx} style={{ marginBottom: "2px" }}>
          <ConditionItemEditor
            item={item}
            onChange={(newItem) => updateCond(idx, newItem)}
            onRemove={() => removeCond(idx)}
            disabled={disabled}
            depth={0}
            ctx={ctx}
          />
        </div>
      ))}
    </div>
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
