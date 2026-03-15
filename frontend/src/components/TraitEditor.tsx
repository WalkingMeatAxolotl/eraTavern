import { useState } from "react";
import type { GameDefinitions, TraitDefinition, TraitEffect, AbilityDecay } from "../types/game";
import { createTraitDef, saveTraitDef, deleteTraitDef } from "../api/client";
import T from "../theme";

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface TraitEditorProps {
  trait: TraitDefinition;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
  addonCrud?: AddonCrud;
}

/** Build effect target options grouped by type. */
function buildTargetOptions(defs: GameDefinitions) {
  const groups: { label: string; options: { value: string; label: string }[] }[] = [];

  // Resources → "{label}(最大值)"
  if (defs.template.resources.length > 0) {
    groups.push({
      label: "资源",
      options: defs.template.resources.map((r) => ({
        value: r.key,
        label: `${r.label}(最大值)`,
      })),
    });
  }

  // Abilities
  if (defs.template.abilities.length > 0) {
    groups.push({
      label: "能力",
      options: defs.template.abilities.map((a) => ({
        value: a.key,
        label: a.label,
      })),
    });
  }

  // BasicInfo (number type only)
  const numberFields = defs.template.basicInfo.filter((f) => f.type === "number");
  if (numberFields.length > 0) {
    groups.push({
      label: "基本信息",
      options: numberFields.map((f) => ({
        value: f.key,
        label: f.label,
      })),
    });
  }

  return groups;
}

const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: T.bg3,
  color: T.text,
  border: `1px solid ${T.borderLight}`,
  borderRadius: "3px",
  fontSize: "12px",
};

const labelStyle: React.CSSProperties = {
  color: T.textSub,
  fontSize: "11px",
  marginBottom: "2px",
};

export default function TraitEditor({ trait, definitions, isNew, onBack, addonCrud }: TraitEditorProps) {
  const [id, setId] = useState(trait.id);
  const [name, setName] = useState(trait.name);
  const [category, setCategory] = useState(trait.category);
  const [description, setDescription] = useState(trait.description ?? "");
  const [effects, setEffects] = useState<TraitEffect[]>([...trait.effects]);
  const [defaultValue, setDefaultValue] = useState<number>(trait.defaultValue ?? 0);
  const [decayEnabled, setDecayEnabled] = useState<boolean>(!!trait.decay);
  const [decay, setDecay] = useState<AbilityDecay>(
    trait.decay ?? { amount: 0, type: "fixed", intervalMinutes: 60 }
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isReadOnly = false;  // all addon entities are editable
  const targetGroups = buildTargetOptions(definitions);
  const allTargets = targetGroups.flatMap((g) => g.options);

  const updateEffect = (idx: number, patch: Partial<TraitEffect>) => {
    setEffects((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEffect = (idx: number) => {
    setEffects((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEffect = () => {
    const firstTarget = allTargets[0]?.value ?? "";
    setEffects((prev) => [
      ...prev,
      { target: firstTarget, effect: "increase", magnitudeType: "fixed", value: 0 },
    ]);
  };

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage("ID 和名称不能为空");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data: Record<string, unknown> = { id, name, category, description, effects };
      if (category === "ability") {
        data.defaultValue = defaultValue;
        data.decay = decayEnabled ? decay : null;
      }
      if (addonCrud) {
        if (isNew) { await addonCrud.create(data); } else { await addonCrud.save(id, data); }
        return;
      }
      const result = isNew
        ? await createTraitDef(data)
        : await saveTraitDef(id, data);
      setMessage(result.success ? "已确定" : result.message);
      if (result.success && isNew) {
        // Return to list after creating
        setTimeout(onBack, 500);
      }
    } catch (e) {
      setMessage(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除特质「${name || id}」吗？`)) return;
    setSaving(true);
    try {
      if (addonCrud) { await addonCrud.delete(id); return; }
      const result = await deleteTraitDef(id);
      if (result.success) {
        onBack();
      } else {
        setMessage(result.message);
      }
    } catch (e) {
      setMessage(`删除失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  /** Format percentage hint: value=120 increase → "+20%", value=80 decrease → "-20%"
   *  Multiple percentage effects on same target stack additively: two +20% = +40% total. */
  const pctHint = (value: number, direction: string) => {
    const delta = direction === "increase" ? value - 100 : 100 - value;
    return `${delta >= 0 ? "+" : ""}${delta}%`;
  };

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建特质" : "编辑特质"} ==
        </span>
        {trait.source && (
          <span style={{ color: T.accent, fontSize: "12px" }}>
            来源: {trait.source}
          </span>
        )}
      </div>

      {/* Basic info */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={!isNew || isReadOnly}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>名称</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isReadOnly}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>分类</div>
            <select
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isReadOnly}
            >
              {definitions.template.traits.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>描述</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isReadOnly}
            />
          </div>
        </div>
      </div>

      {/* Experience-specific hint */}
      {category === "experience" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>经验设定</div>
          <div style={{ borderLeft: `2px solid ${T.borderLight}`, paddingLeft: "10px", color: T.textDim, fontSize: "12px", lineHeight: 1.5 }}>
            经验会自动作用于全部角色，记录事件发生的次数。
            <br />
            通过行动效果中的「经验」类型来增加次数，首次触发时自动记录事件/地点/对象。
          </div>
        </div>
      )}

      {/* Ability-specific fields */}
      {category === "ability" && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>能力设定</div>
          <div style={{ borderLeft: `2px solid ${T.borderLight}`, paddingLeft: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>默认经验值</div>
              <input
                type="number"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                value={defaultValue}
                onChange={(e) => setDefaultValue(Number(e.target.value))}
                disabled={isReadOnly}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>等级预览</div>
              <div style={{ ...inputStyle, backgroundColor: "transparent", border: "none", paddingTop: "6px" }}>
                {(() => {
                  const grades = ["G", "F", "E", "D", "C", "B", "A", "S"];
                  const level = Math.min(Math.floor(defaultValue / 1000), grades.length - 1);
                  return grades[Math.max(0, level)];
                })()}
              </div>
            </div>
          </div>

          {/* Decay settings */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={decayEnabled}
                onChange={(e) => setDecayEnabled(e.target.checked)}
                disabled={isReadOnly}
              />
              <span style={{ ...labelStyle, marginBottom: 0 }}>启用数值回落</span>
            </label>
            {decayEnabled && (
              <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>每隔(游戏分钟)</div>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    value={decay.intervalMinutes}
                    onChange={(e) => setDecay({ ...decay, intervalMinutes: Number(e.target.value) })}
                    disabled={isReadOnly}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>下降类型</div>
                  <select
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    value={decay.type}
                    onChange={(e) => setDecay({ ...decay, type: e.target.value as "fixed" | "percentage" })}
                    disabled={isReadOnly}
                  >
                    <option value="fixed">固定值</option>
                    <option value="percentage">百分比</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>下降量{decay.type === "percentage" ? "(%)" : ""}</div>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    value={decay.amount}
                    onChange={(e) => setDecay({ ...decay, amount: Number(e.target.value) })}
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Effects */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>效果</div>
        <div style={{ borderLeft: `2px solid ${T.borderLight}`, paddingLeft: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {effects.map((eff, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 8px",
                backgroundColor: T.bg2,
                borderRadius: "3px",
              }}
            >
              {/* Target */}
              <select
                style={{ ...inputStyle, flex: "1 1 0" }}
                value={eff.target}
                onChange={(e) => updateEffect(idx, { target: e.target.value })}
                disabled={isReadOnly}
              >
                {targetGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Direction */}
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.effect}
                onChange={(e) => updateEffect(idx, { effect: e.target.value as "increase" | "decrease" })}
                disabled={isReadOnly}
              >
                <option value="increase">增加</option>
                <option value="decrease">减少</option>
              </select>

              {/* Magnitude type */}
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.magnitudeType}
                onChange={(e) => updateEffect(idx, { magnitudeType: e.target.value as "fixed" | "percentage" })}
                disabled={isReadOnly}
              >
                <option value="fixed">固定值</option>
                <option value="percentage">百分比</option>
              </select>

              {/* Value */}
              <input
                type="number"
                style={{ ...inputStyle, width: "60px" }}
                value={eff.value}
                onChange={(e) => updateEffect(idx, { value: Number(e.target.value) })}
                disabled={isReadOnly}
              />

              {/* Multiplier hint for percentage */}
              {eff.magnitudeType === "percentage" && (
                <span style={{ color: T.textDim, fontSize: "11px", width: "50px", flexShrink: 0 }}>
                  {pctHint(eff.value, eff.effect)}
                </span>
              )}

              {/* Delete button */}
              {!isReadOnly && (
                <button
                  onClick={() => removeEffect(idx)}
                  style={{
                    background: "none",
                    border: "none",
                    color: T.danger,
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "0 4px",
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <button
              onClick={addEffect}
              style={{
                marginTop: "2px",
                padding: "3px 10px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
                alignSelf: "flex-start",
              }}
            >
              [+ 添加效果]
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "5px 16px",
              backgroundColor: T.bg2,
              color: T.successDim,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "13px",
            }}
          >
            [确定]
          </button>
        )}
        {!isReadOnly && !isNew && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: "5px 16px",
              backgroundColor: T.bg2,
              color: T.danger,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "13px",
            }}
          >
            [删除]
          </button>
        )}
        <button
          onClick={onBack}
          style={{
            padding: "5px 16px",
            backgroundColor: T.bg2,
            color: T.textSub,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          [返回列表]
        </button>
        {message && (
          <span style={{ color: message === "已确定" ? T.success : T.danger, fontSize: "12px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
