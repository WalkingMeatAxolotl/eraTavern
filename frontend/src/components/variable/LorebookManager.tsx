import React, { useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { LorebookMode } from "../../constants";
import type { LorebookEntry } from "../../types/game";
import { fetchLorebookEntries, createLorebookEntry, saveLorebookEntry, deleteLorebookEntry } from "../../api/client";
import { RawJsonView } from "../shared/RawJsonEditor";
import { btnClass } from "../shared/buttons";
import CloneButton from "../shared/CloneDialog";
import sh from "../shared/shared.module.css";
import s from "./LorebookManager.module.css";

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
  addonIds?: string[];
}

export default function LorebookManager({ selectedAddon, onEditingChange, addonIds }: Props) {
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

  const [showJson, setShowJson] = useState(false);

  if (showJson && selectedAddon !== "__all__") {
    return <RawJsonView addonId={selectedAddon} filename="lorebook.json" onClose={() => setShowJson(false)} />;
  }

  // --- List view ---
  if (editingId === null) {
    return (
      <div className={s.wrapper}>
        <div className={s.header}>
          <span className={sh.editorTitle}>== {t("header.lorebook")} ==</span>
          <div className={s.btnRow}>
            {selectedAddon !== "__all__" && (
              <button onClick={() => setShowJson(true)} className={btnClass("neutral")}>
                [JSON]
              </button>
            )}
            <button onClick={handleNew} className={btnClass("create")}>
              [{t("btn.newEntry")}]
            </button>
          </div>
        </div>

        {filteredEntries.length === 0 && (
          <div className={s.emptyMsg}>
            {t("empty.lorebook")}
          </div>
        )}

        <div className={s.listColumn}>
          {filteredEntries.map((e) => (
            <button
              key={e.id}
              onClick={() => handleSelect(e)}
              className={e.enabled ? s.listItem : s.listItemDisabled}
            >
              <span>
                <span style={{ fontWeight: "bold" }}>{e.name || e.id}</span>
                <span className={s.itemMeta}>
                  {e.insertMode === LorebookMode.ALWAYS ? `[${t("lorebook.alwaysOn")}]` : e.keywords.slice(0, 3).join(", ")}
                  {e.keywords.length > 3 ? "..." : ""}
                </span>
              </span>
              <span className={s.itemStatus}>
                {e.enabled ? "" : `[${t("lorebook.disabled")}]`} P:{e.priority}
              </span>
            </button>
          ))}
        </div>

        {message && <div className={sh.errorText} style={{ marginTop: "8px" }}>{message}</div>}

      </div>
    );
  }

  // --- Edit view ---
  return (
    <div className={s.wrapper}>
      <div className={s.header} style={{ marginBottom: "12px" }}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newEntry") : t("editor.editEntry")} ==
        </span>
        <button onClick={handleBack} className={btnClass("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>

      {/* Basic info */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.basicInfo")}</span>
        </div>
        <div className={s.sectionContent}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
            <div style={{ flex: 1 }}>
              <div className={sh.label}>ID</div>
              <input
                className={s.inputFull}
                style={isNew ? {} : { color: T.textDim }}
                value={entry.id}
                onChange={(e) => setEntry((prev) => ({ ...prev, id: e.target.value }))}
                disabled={!isNew}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className={sh.label}>{t("field.name")}</div>
              <input
                className={s.inputFull}
                value={entry.name}
                onChange={(e) => setEntry((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
            <div style={{ width: "120px" }}>
              <div className={sh.label}>{t("lorebook.priority")}</div>
              <input
                className={s.inputFull}
                type="number"
                value={entry.priority}
                onChange={(e) => setEntry((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div style={{ width: "160px" }}>
              <div className={sh.label}>{t("lorebook.triggerMode")}</div>
              <select
                className={s.inputFull}
                value={entry.insertMode}
                onChange={(e) => setEntry((prev) => ({ ...prev, insertMode: e.target.value as "keyword" | "always" }))}
              >
                <option value={LorebookMode.KEYWORD}>{t("lorebook.keywordTrigger")}</option>
                <option value={LorebookMode.ALWAYS}>{t("lorebook.alwaysInject")}</option>
              </select>
            </div>
            <div>
              <div className={sh.label}>&nbsp;</div>
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
      </div>

      {/* Keywords */}
      {entry.insertMode === LorebookMode.KEYWORD && (
        <div className={s.section} style={{ "--sec-color": "var(--sec-purple)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>{t("section.keywords")}</span>
          </div>
          <div className={s.sectionContent}>
            <div className={s.keywordChips}>
              {entry.keywords.map((kw) => (
                <span key={kw} className={s.keywordChip}>
                  {kw}
                  <button onClick={() => removeKeyword(kw)} className={s.keywordRemove}>
                    x
                  </button>
                </span>
              ))}
            </div>
            <div className={s.keywordInputRow}>
              <input
                className={s.inputW200}
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
              <button onClick={addKeyword} className={btnClass("neutral")}>
                [{t("effOp.add")}]
              </button>
            </div>
            <div className={s.keywordHelp}>
              {t("lorebook.keywordHelp")}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-green)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.content")}</span>
        </div>
        <div className={s.sectionContent}>
          <textarea
            className={s.contentTextarea}
            value={entry.content}
            onChange={(e) => setEntry((prev) => ({ ...prev, content: e.target.value }))}
            placeholder={t("lorebook.contentPlaceholder")}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className={s.actionBar}>
        <button onClick={handleSave} disabled={saving} className={btnClass("create")}>
          [{t("btn.save")}]
        </button>
        {!isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={selectedAddon !== "__all__" ? selectedAddon : (addonIds[0] ?? "")}
            getData={() => ({ name: entry.name, keywords: entry.keywords, content: entry.content, enabled: entry.enabled, priority: entry.priority, insertMode: entry.insertMode })}
            createFn={(d) => {
              const fullId = d.source + "." + d.id;
              return createLorebookEntry({ ...d, id: fullId } as unknown as Omit<LorebookEntry, "source">);
            }}
            onSuccess={handleBack}
            className={btnClass("neutral")}
          />
        )}
        {!isNew && (
          <button onClick={handleDelete} disabled={saving} className={btnClass("danger")}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={handleBack} className={btnClass("neutral")}>
          [{t("btn.back")}]
        </button>
        {message && (
          <span style={{ color: message === t("msg.saved") ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
  );
}
