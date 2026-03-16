import { useState } from "react";
import type { GameDefinitions, OutfitType } from "../types/game";
import { saveOutfitTypes } from "../api/client";
import T from "../theme";
import { HelpButton, HelpPanel, helpSub, helpP } from "./HelpToggle";

interface Props {
  outfit: OutfitType;
  allOutfits: OutfitType[];
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
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
  mainHand: "主手",
  offHand: "副手",
  back: "背部",
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

export default function OutfitEditor({ outfit, allOutfits, definitions, isNew, onBack }: Props) {
  const [id, setId] = useState(isNew ? "" : outfit.id);
  const [name, setName] = useState(outfit.name);
  const [description, setDescription] = useState(outfit.description ?? "");
  const [copyDefault, setCopyDefault] = useState(outfit.copyDefault);
  const [slots, setSlots] = useState<Record<string, string[]>>(structuredClone(outfit.slots));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const clothingSlots = definitions.template.clothingSlots;

  // Group clothing by slot (multi-slot items appear in all their slots)
  const clothingBySlot: Record<string, { id: string; name: string }[]> = {};
  for (const c of Object.values(definitions.clothingDefs)) {
    const cslots = c.slots ?? (c.slot ? [c.slot] : []);
    for (const s of cslots) {
      if (!clothingBySlot[s]) clothingBySlot[s] = [];
      clothingBySlot[s].push({ id: c.id, name: c.name });
    }
  }
  const accessoryItems = clothingBySlot["accessory"] ?? [];
  for (const s of ["accessory1", "accessory2", "accessory3"]) {
    clothingBySlot[s] = [...(clothingBySlot[s] ?? []), ...accessoryItems];
  }

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage("ID 和名称不能为空");
      return;
    }
    if (id === "default") {
      setMessage("不能使用 'default' 作为 ID");
      return;
    }
    if (isNew && allOutfits.some((o) => o.id === id)) {
      setMessage("该 ID 已存在");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const entry: OutfitType = { id, name, description, copyDefault, slots };
      const next = isNew
        ? [...allOutfits, entry]
        : allOutfits.map((o) => (o.id === outfit.id ? entry : o));
      const result = await saveOutfitTypes(next);
      setMessage(result.success ? "已保存" : result.message);
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
    if (!confirm(`确定要删除服装预设「${name || id}」吗？`)) return;
    setSaving(true);
    try {
      const next = allOutfits.filter((o) => o.id !== outfit.id);
      const result = await saveOutfitTypes(next);
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

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建服装预设" : "编辑服装预设"} ==
        </span>
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
              disabled={!isNew}
              placeholder="英文标识符"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>名称</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="显示名称"
            />
          </div>
        </div>
        <div>
          <div style={labelStyle}>描述</div>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选描述"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: T.textSub, fontSize: "12px" }}>
            <input type="checkbox" checked={copyDefault} onChange={() => setCopyDefault(!copyDefault)} />
            初始继承默认服装
          </label>
          <HelpButton show={showHelp} onToggle={() => setShowHelp((v) => !v)} />
        </div>
        {showHelp && (
          <HelpPanel>
            <div style={helpSub}>开启</div>
            <div style={helpP}>角色未自定义此预设时，使用角色自己的默认服装内容。</div>
            <div style={helpSub}>关闭</div>
            <div style={helpP}>使用下方定义的默认槽位内容，所有角色共享。</div>
          </HelpPanel>
        )}
      </div>

      {/* Slots editor (only when copyDefault is off) */}
      {!copyDefault && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ color: T.accent, borderBottom: `1px solid ${T.border}`, marginBottom: "6px", paddingBottom: "2px", fontWeight: "bold" }}>
            == 默认槽位内容 ==
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {clothingSlots.map((slot) => {
              const items = slots[slot] ?? [];
              const options = clothingBySlot[slot] ?? [];
              return (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "2px" }}>
                  <span style={{ minWidth: "100px", color: T.textSub }}>{SLOT_LABELS[slot] ?? slot}:</span>
                  {items.length === 0 && <span style={{ color: T.textDim }}>(空)</span>}
                  {items.map((itemId, i) => {
                    const def = definitions.clothingDefs[itemId];
                    return (
                      <span key={i} style={{ color: T.text, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        [{def?.name ?? itemId}]
                        <button
                          style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: "0 2px", fontSize: "11px" }}
                          onClick={() => {
                            const newSlots = { ...slots, [slot]: items.filter((_, j) => j !== i) };
                            setSlots(newSlots);
                          }}
                        >x</button>
                      </span>
                    );
                  })}
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const newSlots = { ...slots, [slot]: [...items, e.target.value] };
                      setSlots(newSlots);
                    }}
                  >
                    <option value="">+添加</option>
                    {options.filter((c) => !items.includes(c.id)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {copyDefault && !showHelp && (
        <div style={{ color: T.textDim, fontSize: "12px", marginBottom: "16px" }}>
          （角色未自定义时将继承其默认服装内容）
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          style={{ padding: "4px 12px", backgroundColor: "transparent", color: T.textSub, border: `1px solid ${T.border}`, borderRadius: "3px", cursor: "pointer", fontSize: "13px" }}
        >[返回]</button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "4px 12px", backgroundColor: "transparent", color: T.successDim, border: `1px solid ${T.border}`, borderRadius: "3px", cursor: "pointer", fontSize: "13px" }}
        >[保存]</button>
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{ padding: "4px 12px", backgroundColor: "transparent", color: T.danger, border: `1px solid ${T.border}`, borderRadius: "3px", cursor: "pointer", fontSize: "13px" }}
          >[删除]</button>
        )}
        {message && (
          <span style={{ color: message.includes("失败") || message.includes("不能") || message.includes("已存在") ? T.danger : T.successDim, fontSize: "12px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
