/**
 * Template editors — output template list, conditions, and variable help panel.
 *
 * Extracted from ActionEditor.tsx.
 */
import type { OutputTemplateEntry, ConditionItem } from "../../types/game";
import T from "../../theme";
import { useEditorContext } from "../shared/EditorContext";
import { ConditionItemEditor, inputStyle, addBtnStyle, delBtnStyle, listRowStyle } from "../shared/ConditionEditor";

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
        <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
          {!disabled && templates.length === 0 && (
            <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
              [+ 模板]
            </button>
          )}
          {templates.length === 1 && !disabled && (
            <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
              [+ 分支]
            </button>
          )}
        </div>
        {templates.length === 1 && (
          <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
            <textarea
              style={{ ...inputStyle, flex: 1, boxSizing: "border-box", minHeight: "32px", resize: "vertical" }}
              value={templates[0].text}
              onChange={(e) => update(0, { ...templates[0], text: e.target.value })}
              disabled={disabled}
              placeholder="{{player}} ..."
            />
            {!disabled && (
              <button className="ae-del-btn" onClick={() => remove(0)} style={delBtnStyle}>
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
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
        {!disabled && (
          <button className="ae-add-btn" onClick={add} style={addBtnStyle}>
            [+ 分支]
          </button>
        )}
        <span style={{ color: T.textDim, fontSize: "11px" }}>满足条件的模板中随机选择（按权重）</span>
      </div>
      {templates.map((entry, idx) => (
        <div
          key={idx}
          style={{
            ...listRowStyle(idx, idx === templates.length - 1),
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            padding: "4px 6px",
          }}
        >
          <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
            <span style={{ color: "#6ec6ff", fontSize: "11px", fontWeight: "bold" }}>#{idx + 1}</span>
            <span style={{ color: T.textSub, fontSize: "11px" }}>权重:</span>
            <input
              type="number"
              min={0}
              style={{ ...inputStyle, width: "50px" }}
              value={entry.weight ?? 1}
              onChange={(e) => update(idx, { ...entry, weight: Math.max(0, Number(e.target.value)) })}
              disabled={disabled}
            />
            {!disabled && (
              <button className="ae-del-btn" onClick={() => remove(idx)} style={{ ...delBtnStyle, marginLeft: "auto" }}>
                x
              </button>
            )}
          </div>
          <textarea
            style={{
              ...inputStyle,
              width: "100%",
              boxSizing: "border-box",
              minHeight: "32px",
              resize: "vertical",
              marginBottom: "2px",
            }}
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
    <div
      style={{
        paddingLeft: "8px",
        borderLeft: "2px solid #333",
        marginTop: "2px",
      }}
    >
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "2px" }}>
        <span style={{ color: T.textSub, fontSize: "11px" }}>↳ 条件</span>
        {!disabled && (
          <button className="ae-add-btn" onClick={addCond} style={addBtnStyle}>
            [+]
          </button>
        )}
        {conditions.length === 0 && <span style={{ color: T.textDim, fontSize: "11px" }}>无条件（始终可选）</span>}
      </div>
      {conditions.map((item, idx) => (
        <div key={idx} style={{ marginBottom: "2px" }}>
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

  const s: React.CSSProperties = { color: "#0ff", fontSize: "11px" };
  const d: React.CSSProperties = { color: T.textSub, fontSize: "11px" };
  const row = (v: string, desc: string) => (
    <div key={v} style={{ display: "flex", gap: "8px", marginBottom: "1px" }}>
      <span style={{ ...s, minWidth: "220px" }}>{`{{${v}}}`}</span>
      <span style={d}>{desc}</span>
    </div>
  );

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
        可用变量 (self = 行动者, target = 目标)
      </div>
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
