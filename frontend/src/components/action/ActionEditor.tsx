import { useState, useEffect } from "react";
import type {
  ActionDefinition,
  ConditionItem,
  ActionOutcome,
  ValueModifier,
  GameDefinitions,
  OutputTemplateEntry,
} from "../../types/game";
import { createActionDef, saveActionDef, deleteActionDef, fetchLLMPresets } from "../../api/client";
import T from "../../theme";
import { TargetType } from "../../constants";
import { EditorProvider } from "../shared/EditorContext";
import type { EditorContextValue } from "../shared/EditorContext";
import { ConditionItemEditor } from "../shared/ConditionEditor";
import { inputStyle, addBtnStyle, delBtnStyle, smallBtnStyle, listRowStyle, labelStyle } from "../shared/styles";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import { ModifierListEditor } from "./ModifierEditor";
import { OutcomeEditor } from "./OutcomeEditor";
import { TemplateListEditor, TemplateVarHelp } from "./TemplateEditor";

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

// Color-coded sections for visual distinction
const SEC = {
  basic: { color: "#6ec6ff", bg: "#6ec6ff0a" },
  weight: { color: "#e9a045", bg: "#e9a0450a" },
  cond: { color: "#c78dff", bg: "#c78dff0a" },
  outcome: { color: "#e94560", bg: "#e945600a" },
  template: { color: "#7ecf7e", bg: "#7ecf7e0a" },
};

// Section wrapper: colored left border + very subtle tinted background
const sectionStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  marginBottom: "16px",
  padding: "0 0 8px 0",
  borderLeft: `3px solid ${SEC[sec].color}`,
  backgroundColor: SEC[sec].bg,
  borderRadius: "0 4px 4px 0",
});

// Section title bar — colored background strip that anchors the section
const sectionTitleStyle = (sec: keyof typeof SEC): React.CSSProperties => ({
  padding: "5px 10px",
  marginBottom: "8px",
  backgroundColor: `${SEC[sec].color}15`,
  borderBottom: `1px solid ${SEC[sec].color}25`,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

// Section content area with left padding
const sectionContent: React.CSSProperties = {
  padding: "0 10px",
};


// Inject hover styles once
const AE_STYLE_ID = "ae-hover-styles";
if (typeof document !== "undefined" && !document.getElementById(AE_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = AE_STYLE_ID;
  style.textContent = `
    .ae-btn:hover { filter: brightness(1.3); }
    .ae-add-btn:hover { background-color: #1a2a1a !important; border-color: #4a8a4a !important; }
    .ae-del-btn:hover { background-color: #2a1414 !important; border-color: #c05050 !important; }
    .ae-input:hover { border-color: #555 !important; }
    .ae-input:focus { border-color: #888 !important; outline: none; }
    .ae-sec-title { letter-spacing: 0.5px; }
  `;
  document.head.appendChild(style);
}

export default function ActionEditor({ action, isNew, definitions, onBack, addonCrud }: Props) {
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
    { id: "default", name: "默认服装" },
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
      setMessage(result.success ? "已确定" : result.message);
      if (result.success && isNew) {
        setTimeout(onBack, 500);
      }
    } catch (e) {
      setMessage(`保存失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除行动「${name || id}」吗？`)) return;
    setSaving(true);
    try {
      if (addonCrud) {
        await addonCrud.delete(id);
        onBack();
        return;
      }
      const result = await deleteActionDef(id);
      if (result.success) onBack();
      else setMessage(result.message);
    } catch (e) {
      setMessage(`删除失败: ${e instanceof Error ? e.message : e}`);
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

  return (
    <EditorProvider value={editorCtx}>
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建行动" : "编辑行动"} ==
        </span>
        {action.source && <span style={{ color: T.accent, fontSize: "12px" }}>来源: {action.source}</span>}
      </div>

      {/* Basic info */}
      <div style={sectionStyle("basic")}>
        <div style={sectionTitleStyle("basic")}>
          <span className="ae-sec-title" style={{ color: SEC.basic.color, fontSize: "12px", fontWeight: "bold" }}>
            基本信息
          </span>
        </div>
        <div style={{ ...sectionContent, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>ID</div>
              <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew || isReadOnly} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>名称</div>
              <input
                className="ae-input"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>分类</div>
              <select
                className="ae-input"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
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
                <option value="__custom__">自定义...</option>
              </select>
              {!categoryList.includes(category) && (
                <input
                  className="ae-input"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: "2px" }}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="输入新分类"
                />
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
            <div>
              <div style={labelStyle}>目标类型</div>
              <select
                className="ae-input"
                style={inputStyle}
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as ActionDefinition["targetType"])}
                disabled={isReadOnly}
              >
                <option value={TargetType.NONE}>无目标</option>
                <option value={TargetType.NPC}>角色</option>
              </select>
            </div>
            <div>
              <div style={labelStyle}>时间消耗(分)</div>
              <input
                className="ae-input"
                type="number"
                step={5}
                min={0}
                style={{ ...inputStyle, width: "80px" }}
                value={timeCost}
                onChange={(e) => setTimeCost(Math.max(0, Math.round(Number(e.target.value) / 5) * 5))}
                disabled={isReadOnly}
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: isReadOnly ? "default" : "pointer",
                paddingBottom: "4px",
              }}
            >
              <input
                type="checkbox"
                checked={triggerLLM}
                onChange={(e) => setTriggerLLM(e.target.checked)}
                disabled={isReadOnly}
              />
              <span style={{ fontSize: "12px" }}>触发LLM</span>
            </label>
            {triggerLLM && (
              <div>
                <div style={labelStyle}>LLM 预设</div>
                <select
                  className="ae-input"
                  style={{ ...inputStyle, width: "160px" }}
                  value={llmPreset}
                  onChange={(e) => setLlmPreset(e.target.value)}
                  disabled={isReadOnly}
                >
                  <option value="">（跟随默认）</option>
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
      <div style={sectionStyle("weight")}>
        <div style={sectionTitleStyle("weight")}>
          <span className="ae-sec-title" style={{ color: SEC.weight.color, fontSize: "12px", fontWeight: "bold" }}>
            NPC 权重
          </span>
        </div>
        <div style={sectionContent}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div>
              <div style={labelStyle}>基础权重</div>
              <input
                className="ae-input"
                type="number"
                min={0}
                style={{ ...inputStyle, width: "80px" }}
                value={npcWeight}
                onChange={(e) => setNpcWeight(Math.max(0, Number(e.target.value)))}
                disabled={isReadOnly}
              />
              <div style={{ color: T.textDim, fontSize: "11px", marginTop: "2px" }}>0 = NPC不会执行此行动</div>
            </div>
            <div
              style={{
                flex: 1,
                paddingLeft: "8px",
                borderLeft: "2px solid #333",
                backgroundColor: T.bg1,
                borderRadius: "0 3px 3px 0",
              }}
            >
              <ModifierListEditor
                modifiers={npcWeightModifiers}
                onChange={setNpcWeightModifiers}
                disabled={isReadOnly}
                label="↳ 权重修正"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div style={sectionStyle("cond")}>
        <div style={sectionTitleStyle("cond")}>
          <span className="ae-sec-title" style={{ color: SEC.cond.color, fontSize: "12px", fontWeight: "bold" }}>
            显示条件 (AND)
          </span>
          {!isReadOnly && (
            <div style={{ display: "flex", gap: "4px" }}>
              <button className="ae-add-btn" onClick={addCondition} style={addBtnStyle}>
                [+ 条件]
              </button>
              <button className="ae-add-btn" onClick={addOrGroup} style={addBtnStyle}>
                [+ OR]
              </button>
              <button className="ae-add-btn" onClick={addAndGroup} style={addBtnStyle}>
                [+ AND]
              </button>
            </div>
          )}
        </div>
        <div style={sectionContent}>
          {conditions.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>无条件（始终显示）</div>}
          {conditions.map((item, idx) => (
            <div key={idx} style={listRowStyle(idx, idx === conditions.length - 1)}>
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
      <div style={sectionStyle("outcome")}>
        <div style={sectionTitleStyle("outcome")}>
          <span className="ae-sec-title" style={{ color: SEC.outcome.color, fontSize: "12px", fontWeight: "bold" }}>
            结果分级
          </span>
          {!isReadOnly && (
            <button className="ae-add-btn" onClick={addOutcome} style={addBtnStyle}>
              [+ 结果]
            </button>
          )}
        </div>
        <div style={sectionContent}>
          {outcomes.length === 0 && <div style={{ color: T.textDim, fontSize: "12px" }}>无结果（固定成功）</div>}
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
      <div style={sectionStyle("template")}>
        <div style={sectionTitleStyle("template")}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="ae-sec-title" style={{ color: SEC.template.color, fontSize: "12px", fontWeight: "bold" }}>
              行为模板
            </span>
            <button
              className="ae-btn"
              onClick={() => setShowVarHelp((v) => !v)}
              style={{ ...smallBtnStyle(showVarHelp ? T.danger : T.textSub), fontSize: "11px" }}
            >
              [?]
            </button>
          </div>
        </div>
        <div style={sectionContent}>
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
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          padding: "4px 0",
          borderTop: `1px solid ${T.border}`,
          marginTop: "4px",
          paddingTop: "12px",
        }}
      >
        {!isReadOnly && (
          <button
            className="ae-add-btn"
            onClick={handleSave}
            disabled={saving}
            style={{
              ...addBtnStyle,
              padding: "5px 16px",
              fontSize: "13px",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            [确定]
          </button>
        )}
        {!isReadOnly && !isNew && (
          <button
            className="ae-del-btn"
            onClick={handleDelete}
            disabled={saving}
            style={{
              ...delBtnStyle,
              padding: "5px 16px",
              fontSize: "13px",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            [删除]
          </button>
        )}
        <button
          className="ae-btn"
          onClick={onBack}
          style={{ ...smallBtnStyle(T.textSub), padding: "5px 16px", fontSize: "13px" }}
        >
          [返回列表]
        </button>
        {message && (
          <span style={{ color: message === "已确定" ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
    </EditorProvider>
  );
}

// END OF FILE — sub-editors extracted to ModifierEditor, EffectEditor, OutcomeEditor, TemplateEditor
