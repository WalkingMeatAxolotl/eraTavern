import { useState, useEffect, useCallback } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { LorebookMode } from "../../constants";
import type { LorebookEntry } from "../../types/game";
import { fetchLorebookEntries, createLorebookEntry, saveLorebookEntry, deleteLorebookEntry } from "../../api/client";
import { inputStyle as _inputStyle, labelStyle } from "../shared/styles";

const inputStyle: React.CSSProperties = {
  ..._inputStyle,
  width: "100%",
  boxSizing: "border-box",
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
    insertMode: LorebookMode.KEYWORD,
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

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filteredEntries = selectedAddon === "__all__" ? entries : entries.filter((e) => e.source === selectedAddon);

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
    if (!entry.id.trim()) {
      setMessage(t("val.idRequired"));
      return;
    }
    if (!entry.name.trim()) {
      setMessage(t("val.nameRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = isNew ? await createLorebookEntry(entry) : await saveLorebookEntry(entry.id, entry);
      if (result.success) {
        setMessage(t("msg.saved"));
        if (isNew) {
          setIsNew(false);
          setEditingId(entry.id);
        }
        loadEntries();
      } else {
        setMessage(result.message || t("msg.saveFailed", { error: "" }));
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteEntry", { name: entry.name || entry.id }))) return;
    setSaving(true);
    try {
      const result = await deleteLorebookEntry(entry.id);
      if (result.success) {
        handleBack();
      } else {
        setMessage(result.message || t("msg.deleteFailed", { error: "" }));
      }
    } catch (e) {
      setMessage(t("msg.deleteFailed", { error: e instanceof Error ? e.message : String(e) }));
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
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.lorebook")} ==</span>
          <button onClick={handleNew} style={btnStyle(T.successDim)}>
            [{t("btn.newEntry")}]
          </button>
        </div>

        {filteredEntries.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", padding: "8px 0" }}>
            {t("empty.lorebook")}
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
                  {e.insertMode === LorebookMode.ALWAYS ? `[${t("lorebook.alwaysOn")}]` : e.keywords.slice(0, 3).join(", ")}
                  {e.keywords.length > 3 ? "..." : ""}
                </span>
              </span>
              <span style={{ color: T.textDim, fontSize: "11px" }}>
                {e.enabled ? "" : `[${t("lorebook.disabled")}]`} P:{e.priority}
              </span>
            </button>
          ))}
        </div>

        {message && <div style={{ color: T.danger, fontSize: "12px", marginTop: "8px" }}>{message}</div>}
      </div>
    );
  }

  // --- Edit view ---
  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newEntry") : t("editor.editEntry")} ==
        </span>
        <button onClick={handleBack} style={btnStyle(T.textSub)}>
          [{t("btn.back")}]
        </button>
      </div>

      {/* Basic info */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>{t("section.basicInfo")}</div>
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
            <div style={labelStyle}>{t("field.name")}</div>
            <input
              style={inputStyle}
              value={entry.name}
              onChange={(e) => setEntry((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ width: "120px" }}>
            <div style={labelStyle}>{t("lorebook.priority")}</div>
            <input
              style={inputStyle}
              type="number"
              value={entry.priority}
              onChange={(e) => setEntry((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div style={{ width: "160px" }}>
            <div style={labelStyle}>{t("lorebook.triggerMode")}</div>
            <select
              style={inputStyle}
              value={entry.insertMode}
              onChange={(e) => setEntry((prev) => ({ ...prev, insertMode: e.target.value as "keyword" | "always" }))}
            >
              <option value={LorebookMode.KEYWORD}>{t("lorebook.keywordTrigger")}</option>
              <option value={LorebookMode.ALWAYS}>{t("lorebook.alwaysInject")}</option>
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
              {t("field.enabled")}
            </label>
          </div>
        </div>
      </div>

      {/* Keywords */}
      {entry.insertMode === LorebookMode.KEYWORD && (
        <div style={sectionStyle}>
          <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>{t("section.keywords")}</div>
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
                  style={{
                    background: "none",
                    border: "none",
                    color: T.danger,
                    cursor: "pointer",
                    fontSize: "11px",
                    padding: 0,
                  }}
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder={t("lorebook.keywordPlaceholder")}
            />
            <button onClick={addKeyword} style={btnStyle(T.textSub)}>
              [{t("effOp.add")}]
            </button>
          </div>
          <div style={{ color: T.textDim, fontSize: "11px", marginTop: "4px" }}>
            {t("lorebook.keywordHelp")}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={sectionStyle}>
        <div style={{ color: T.textSub, fontSize: "12px", fontWeight: "bold", marginBottom: "6px" }}>{t("section.content")}</div>
        <textarea
          style={{ ...inputStyle, minHeight: "150px", resize: "vertical", fontFamily: T.fontMono }}
          value={entry.content}
          onChange={(e) => setEntry((prev) => ({ ...prev, content: e.target.value }))}
          placeholder={t("lorebook.contentPlaceholder")}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "12px" }}>
        <button onClick={handleSave} disabled={saving} style={btnStyle(T.successDim)}>
          [{t("btn.save")}]
        </button>
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} style={btnStyle(T.danger)}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={handleBack} style={btnStyle(T.textSub)}>
          [{t("btn.back")}]
        </button>
        {message && (
          <span style={{ color: message === t("msg.saved") ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
  );
}
