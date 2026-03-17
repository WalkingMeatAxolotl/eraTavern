import { useState, useEffect, useCallback } from "react";
import T from "../theme";
import type { LorebookEntry } from "../types/game";
import {
  fetchLorebookEntries,
  createLorebookEntry,
  saveLorebookEntry,
  deleteLorebookEntry,
} from "../api/client";

const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: T.bg3,
  color: T.text,
  border: `1px solid ${T.borderLight}`,
  borderRadius: "3px",
  fontSize: "12px",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  color: T.textSub,
  fontSize: "11px",
  marginBottom: "2px",
};

const sectionStyle: React.CSSProperties = {
  borderLeft: `2px solid ${T.borderLight}`,
  paddingLeft: "10px",
  marginBottom: "12px",
};

const btnStyle = (color: string): React.CSSProperties => ({
  padding: "5px 16px",
  backgroundColor: T.bg2,
  color,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "13px",
});

function makeBlankEntry(addonId: string): Omit<LorebookEntry, "source"> {
  return {
    id: `${addonId}.`,
    name: "",
    keywords: [],
    content: "",
    enabled: true,
    priority: 10,
    insertMode: "keyword",
  };
}

interface Props {
  selectedAddon: string;
  onEditingChange?: (editing: boolean) => void;
}

export default function LorebookManager({ selectedAddon, onEditingChange }: Props) {
  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entry, setEntry] = useState<Omit<LorebookEntry, "source">>(makeBlankEntry(selectedAddon));
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const loadEntries = useCallback(async () => {
    try {
      const data = await fetchLorebookEntries();
      setEntries(data);
    } catch (e) {
      console.error("Failed to load lorebook:", e);
    }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const filteredEntries = selectedAddon === "__all__"
    ? entries
    : entries.filter((e) => e.source === selectedAddon);

  const handleSelect = (e: LorebookEntry) => {
    const { source: _, ...rest } = e;
    setEntry(rest);
    setEditingId(e.id);
    setIsNew(false);
    setMessage("");
    onEditingChange?.(true);
  };

  const handleNew = () => {
    setEntry(makeBlankEntry(selectedAddon === "__all__" ? "" : selectedAddon));
    setEditingId("__new__");
    setIsNew(true);
    setMessage("");
    setKeywordInput("");
    onEditingChange?.(true);
  };

  const handleBack = () => {
    setEditingId(null);
    setIsNew(false);
    setMessage("");
    onEditingChange?.(false);
    loadEntries();
  };

  const handleSave = async () => {
    if (!entry.id.trim()) { setMessage("ID 不能为空"); return; }
    if (!entry.name.trim()) { setMessage("名称不能为空"); return; }
    setSaving(true);
    setMessage("");
    try {
      const result = isNew
        ? await createLorebookEntry(entry)
        : await saveLorebookEntry(entry.id, entry);
      if (result.success) {
        setMessage("已保存");
        if (isNew) {
          setIsNew(false);
          setEditingId(entry.id);
        }
        loadEntries();
      } else {
        setMessage(result.message || "保存失败");
      }
    } catch (e) {
      setMessage(`保存失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除「${entry.name || entry.id}」吗？`)) return;
    setSaving(true);
    try {
      const result = await deleteLorebookEntry(entry.id);
      if (result.success) {
        handleBack();
      } else {
        setMessage(result.message || "删除失败");
      }
    } catch (e) {
      setMessage(`删除失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw || entry.keywords.includes(kw)) return;
    setEntry((e) => ({ ...e, keywords: [...e.keywords, kw] }));
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setEntry((e) => ({ ...e, keywords: e.keywords.filter((k) => k !== kw) }));
  };

  // --- List view ---
  if (editingId === null) {
    return (
      <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
            == 世界书 ==
          </span>
          <button onClick={handleNew} style={btnStyle(T.successDim)}>[+ 新建条目]</button>
        </div>

        {filteredEntries.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>
            暂无条目。世界书条目可为 LLM 提供世界观、设定等背景信息。
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {filteredEntries.map((e) => (
            <button
              key={e.id}
              onClick={() => handleSelect(e)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: T.bg1,
                color: e.enabled ? T.text : T.textDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
                textAlign: "left",
                opacity: e.enabled ? 1 : 0.6,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = T.borderLight)}
              onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = T.border)}
            >
              <span>
                <span style={{ fontWeight: "bold" }}>{e.name || e.id}</span>
                <span style={{ color: T.textDim, marginLeft: "8px", fontSize: "11px" }}>
                  {e.insertMode === "always" ? "[常驻]" : e.keywords.slice(0, 3).join(", ")}
                  {e.keywords.length > 3 ? "..." : ""}
                </span>
              </span>
              <span style={{ color: T.textDim, fontSize: "11px" }}>
                {e.enabled ? "" : "[禁用]"} P:{e.priority}
              </span>
            </button>
          ))}
        </div>

        {message && (
          <div style={{ color: T.danger, fontSize: "12px", marginTop: "8px" }}>{message}</div>
        )}
      </div>
    );
  }

  // --- Edit view ---
  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? "新建条目" : "编辑条目"} ==
        </span>
        <button onClick={handleBack} style={btnStyle(T.textSub)}>[返回列表]</button>
      </div>

      {/* Basic info */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>基本信息</div>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input
              style={{ ...inputStyle, ...(isNew ? {} : { color: T.textDim }) }}
              value={entry.id}
              onChange={(e) => setEntry((prev) => ({ ...prev, id: e.target.value }))}
              disabled={!isNew}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>名称</div>
            <input
              style={inputStyle}
              value={entry.name}
              onChange={(e) => setEntry((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ width: "120px" }}>
            <div style={labelStyle}>优先级</div>
            <input
              style={inputStyle}
              type="number"
              value={entry.priority}
              onChange={(e) => setEntry((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div style={{ width: "160px" }}>
            <div style={labelStyle}>触发方式</div>
            <select
              style={inputStyle}
              value={entry.insertMode}
              onChange={(e) => setEntry((prev) => ({ ...prev, insertMode: e.target.value as "keyword" | "always" }))}
            >
              <option value="keyword">关键词触发</option>
              <option value="always">始终注入</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>&nbsp;</div>
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: T.textSub }}>
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(e) => setEntry((prev) => ({ ...prev, enabled: e.target.checked }))}
                style={{ accentColor: T.accent }}
              />
              启用
            </label>
          </div>
        </div>
      </div>

      {/* Keywords */}
      {entry.insertMode === "keyword" && (
        <div style={sectionStyle}>
          <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>关键词</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
            {entry.keywords.map((kw) => (
              <span
                key={kw}
                style={{
                  padding: "2px 8px",
                  backgroundColor: T.bg2,
                  color: T.accent,
                  border: `1px solid ${T.border}`,
                  borderRadius: "3px",
                  fontSize: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: "11px", padding: 0 }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              style={{ ...inputStyle, width: "200px" }}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              placeholder="输入关键词后回车"
            />
            <button onClick={addKeyword} style={btnStyle(T.textSub)}>[添加]</button>
          </div>
          <div style={{ color: T.textDim, fontSize: "11px", marginTop: "4px" }}>
            当行动结果、角色名、地点名中包含任一关键词时，自动注入此条目内容
          </div>
        </div>
      )}

      {/* Content */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>内容</div>
        <textarea
          style={{ ...inputStyle, minHeight: "150px", resize: "vertical", fontFamily: T.fontMono }}
          value={entry.content}
          onChange={(e) => setEntry((prev) => ({ ...prev, content: e.target.value }))}
          placeholder="注入给 LLM 的设定文本..."
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
        <button onClick={handleSave} disabled={saving} style={btnStyle(T.successDim)}>
          [保存]
        </button>
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle(T.danger)}>
            [删除]
          </button>
        )}
        <button onClick={handleBack} style={btnStyle(T.textSub)}>[返回列表]</button>
        {message && (
          <span style={{ color: message === "已保存" ? T.success : T.danger, fontSize: "12px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
