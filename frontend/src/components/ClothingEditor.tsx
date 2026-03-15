import { useState } from "react";
import type { GameDefinitions, ClothingDefinition, TraitEffect } from "../types/game";
import { createClothingDef, saveClothingDef, deleteClothingDef } from "../api/client";
import T from "../theme";

function buildTargetOptions(defs: GameDefinitions) {
  const groups: { label: string; options: { value: string; label: string }[] }[] = [];
  if (defs.template.resources.length > 0) {
    groups.push({
      label: "资源",
      options: defs.template.resources.map((r) => ({ value: r.key, label: `${r.label}(最大值)` })),
    });
  }
  if (defs.template.abilities.length > 0) {
    groups.push({
      label: "能力",
      options: defs.template.abilities.map((a) => ({ value: a.key, label: a.label })),
    });
  }
  const numberFields = defs.template.basicInfo.filter((f) => f.type === "number");
  if (numberFields.length > 0) {
    groups.push({
      label: "基本信息",
      options: numberFields.map((f) => ({ value: f.key, label: f.label })),
    });
  }
  return groups;
}

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface Props {
  clothing: ClothingDefinition;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
  addonCrud?: AddonCrud;
}

const SLOT_LABELS: Record<string, string> = {
  hat: "帽子",
  upperBody: "上半身",
  upperUnderwear: "上半身内衣",
  lowerBody: "下半身",
  lowerUnderwear: "下半身内衣",
  hands: "手",
  feet: "脚",
  shoes: "鞋子",
  accessory: "装饰品",
  accessory1: "装饰品1",
  accessory2: "装饰品2",
  accessory3: "装饰品3",
};

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

export default function ClothingEditor({ clothing, definitions, isNew, onBack, addonCrud }: Props) {
  const [id, setId] = useState(clothing.id);
  const [name, setName] = useState(clothing.name);
  const [slot, setSlot] = useState(clothing.slot);
  const [occlusion, setOcclusion] = useState<string[]>([...clothing.occlusion]);
  const [effects, setEffects] = useState<TraitEffect[]>([...(clothing.effects ?? [])]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isReadOnly = false;  // all addon entities are editable
  const slots = [...new Set(definitions.template.clothingSlots.map((s) =>
    s.startsWith("accessory") ? "accessory" : s
  ))];
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

  const pctHint = (value: number, direction: string) => {
    let m = value / 100;
    if (direction === "decrease") m = 2.0 - m;
    return `\u00D7${m.toFixed(2)}`;
  };

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage("ID 和名称不能为空");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = { id, name, slot, occlusion, effects };
      if (addonCrud) {
        if (isNew) { await addonCrud.create(data); } else { await addonCrud.save(id, data); }
        return;
      }
      const result = isNew
        ? await createClothingDef(data)
        : await saveClothingDef(id, data);
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
    if (!confirm(`确定要删除服装「${name || id}」吗？`)) return;
    setSaving(true);
    try {
      if (addonCrud) { await addonCrud.delete(id); return; }
      const result = await deleteClothingDef(id);
      if (result.success) {
        onBack();
      } else {
        setMessage(result.message);
      }
    } catch (e) {
      setMessage(`删除失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  // Available slots for occlusion (exclude the item's own slot)
  const occlusionOptions = slots.filter((s) => s !== slot && !occlusion.includes(s));

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建服装" : "编辑服装"} ==
        </span>
        {clothing.source && (
          <span style={{ color: T.accent, fontSize: "12px" }}>
            来源: {clothing.source}
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
        <div>
          <div style={labelStyle}>装备槽位</div>
          <select
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            value={slot}
            onChange={(e) => {
              setSlot(e.target.value);
              // Remove self-slot from occlusion if it was there
              setOcclusion((prev) => prev.filter((s) => s !== e.target.value));
            }}
            disabled={isReadOnly}
          >
            {slots.map((s) => (
              <option key={s} value={s}>{SLOT_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Occlusion */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>遮挡槽位</div>
        <div style={{ borderLeft: `2px solid ${T.borderLight}`, paddingLeft: "10px", display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
          {occlusion.map((s) => (
            <span
              key={s}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                padding: "2px 8px",
                backgroundColor: T.bg2,
                border: `1px solid ${T.borderLight}`,
                borderRadius: "3px",
                fontSize: "12px",
              }}
            >
              {SLOT_LABELS[s] ?? s}
              {!isReadOnly && (
                <button
                  onClick={() => setOcclusion((prev) => prev.filter((x) => x !== s))}
                  style={{
                    background: "none",
                    border: "none",
                    color: T.danger,
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "12px",
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              )}
            </span>
          ))}
          {!isReadOnly && occlusionOptions.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setOcclusion((prev) => [...prev, e.target.value]);
              }}
              style={inputStyle}
            >
              <option value="">+</option>
              {occlusionOptions.map((s) => (
                <option key={s} value={s}>{SLOT_LABELS[s] ?? s}</option>
              ))}
            </select>
          )}
          {occlusion.length === 0 && <span style={{ color: T.textDim }}>无</span>}
        </div>
      </div>

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
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.effect}
                onChange={(e) => updateEffect(idx, { effect: e.target.value as "increase" | "decrease" })}
                disabled={isReadOnly}
              >
                <option value="increase">增加</option>
                <option value="decrease">减少</option>
              </select>
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.magnitudeType}
                onChange={(e) => updateEffect(idx, { magnitudeType: e.target.value as "fixed" | "percentage" })}
                disabled={isReadOnly}
              >
                <option value="fixed">固定值</option>
                <option value="percentage">百分比</option>
              </select>
              <input
                type="number"
                style={{ ...inputStyle, width: "60px" }}
                value={eff.value}
                onChange={(e) => updateEffect(idx, { value: Number(e.target.value) })}
                disabled={isReadOnly}
              />
              {eff.magnitudeType === "percentage" && (
                <span style={{ color: T.textDim, fontSize: "11px", width: "50px", flexShrink: 0 }}>
                  {pctHint(eff.value, eff.effect)}
                </span>
              )}
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
                marginTop: "6px",
                padding: "3px 10px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
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
