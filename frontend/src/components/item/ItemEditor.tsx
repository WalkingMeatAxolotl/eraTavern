import { useState } from "react";
import type { ItemDefinition } from "../../types/game";
import { createItemDef, saveItemDef, deleteItemDef } from "../../api/client";
import T from "../../theme";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import { inputStyle, labelStyle } from "../shared/styles";

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface Props {
  item: ItemDefinition;
  isNew: boolean;
  allTags?: string[];
  onBack: () => void;
  addonCrud?: AddonCrud;
}

export default function ItemEditor({ item, isNew, allTags, onBack, addonCrud }: Props) {
  const addonPrefix = item.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(item.id));
  const [name, setName] = useState(item.name);
  const [tags, setTags] = useState<string[]>([...(item.tags ?? [])]);
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState(item.description);
  const [maxStack, setMaxStack] = useState(item.maxStack);
  const [sellable, setSellable] = useState(item.sellable);
  const [price, setPrice] = useState(item.price);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isReadOnly = false; // all addon entities are editable

  // Tags from pool that aren't already selected
  const availableTags = (allTags ?? []).filter((t) => !tags.includes(t));

  const addTag = (t: string) => {
    const trimmed = t.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage("ID 和名称不能为空");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = { id, name, tags, description, maxStack, sellable, price, source: item.source };
      if (addonCrud) {
        if (isNew) {
          await addonCrud.create(data);
        } else {
          await addonCrud.save(item.id, data);
        }
        return;
      }
      const result = isNew ? await createItemDef(data) : await saveItemDef(item.id, data);
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
    if (!confirm(`确定要删除物品「${name || id}」吗？`)) return;
    setSaving(true);
    try {
      if (addonCrud) {
        await addonCrud.delete(id);
        onBack();
        return;
      }
      const result = await deleteItemDef(id);
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
          == {isNew ? "新建物品" : "编辑物品"} ==
        </span>
        {item.source && <span style={{ color: T.accent, fontSize: "12px" }}>来源: {item.source}</span>}
      </div>

      {/* Basic info */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew || isReadOnly} />
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

        {/* Tags */}
        <div>
          <div style={labelStyle}>标签</div>
          {/* Selected tags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
            {tags.map((t) => (
              <span
                key={t}
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
                {t}
                {!isReadOnly && (
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
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
            {tags.length === 0 && <span style={{ color: T.textDim }}>无</span>}
          </div>
          {/* Available tags from pool (clickable) */}
          {!isReadOnly && availableTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
              {availableTags.map((t) => (
                <button
                  key={t}
                  onClick={() => addTag(t)}
                  style={{
                    padding: "2px 8px",
                    backgroundColor: T.bg3,
                    color: T.textDim,
                    border: `1px dashed ${T.border}`,
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  + {t}
                </button>
              ))}
            </div>
          )}
          {/* Free-form input for new tags */}
          {!isReadOnly && (
            <input
              style={{ ...inputStyle, width: "120px" }}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput);
              }}
              placeholder="自定义标签..."
            />
          )}
        </div>

        <div>
          <div style={labelStyle}>描述</div>
          <textarea
            style={{
              ...inputStyle,
              width: "100%",
              boxSizing: "border-box",
              minHeight: "48px",
              resize: "vertical",
            }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isReadOnly}
          />
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>最大堆叠数</div>
            <input
              type="number"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={maxStack}
              onChange={(e) => setMaxStack(Math.max(1, Number(e.target.value)))}
              min={1}
              disabled={isReadOnly}
            />
          </div>
          <div>
            <div style={labelStyle}>可出售</div>
            <label
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: isReadOnly ? "default" : "pointer" }}
            >
              <input
                type="checkbox"
                checked={sellable}
                onChange={(e) => setSellable(e.target.checked)}
                disabled={isReadOnly}
              />
              <span style={{ fontSize: "12px" }}>{sellable ? "是" : "否"}</span>
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>价格</div>
            <input
              type="number"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
              min={0}
              disabled={isReadOnly}
            />
          </div>
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
          <span style={{ color: message === "已确定" ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
  );
}
