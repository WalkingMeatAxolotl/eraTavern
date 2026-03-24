import { useState } from "react";
import type { ItemDefinition } from "../../types/game";
import { createItemDef, saveItemDef, deleteItemDef } from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import { RawJsonPanel } from "../shared/RawJsonEditor";
import CloneButton from "../shared/CloneDialog";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./ItemEditor.module.css";

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
  addonIds?: string[];
}

export default function ItemEditor({ item, isNew, allTags, onBack, addonCrud, addonIds }: Props) {
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
  const [jsonMode, setJsonMode] = useState(false);

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
      setMessage(t("val.idNameRequired"));
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
      setMessage(result.success ? t("status.saved") : result.message);
      if (result.success && isNew) {
        setTimeout(onBack, 500);
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteItem", { name: name || id }))) return;
    setSaving(true);
    try {
      if (addonCrud) {
        await addonCrud.delete(item.id);
        onBack();
        return;
      }
      const result = await deleteItemDef(item.id);
      if (result.success) {
        onBack();
      } else {
        setMessage(result.message);
      }
    } catch (e) {
      setMessage(t("msg.deleteFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  if (jsonMode) {
    return (
      <RawJsonPanel
        data={{ id, name, tags, description, maxStack, sellable, price }}
        onSave={async (data) => {
          const result = isNew
            ? await createItemDef({ ...data, source: item.source } as never)
            : await saveItemDef(item.id, { ...data, source: item.source } as never);
          if (result.success && isNew) setTimeout(onBack, 500);
          return result;
        }}
        onToggle={() => setJsonMode(false)}
      />
    );
  }

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.title}>
          == {isNew ? t("editor.newItem") : t("editor.editItem")} ==
        </span>
        {item.source && <span className={s.sourceLabel}>{t("field.source")}: {item.source}</span>}
      </div>

      {/* Basic info */}
      <div className={s.form}>
        <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>基础信息</span>
          </div>
          <div className={s.sectionContent}>
            <div className={s.row2}>
              <div className={s.field}>
                <div className={sh.label}>ID</div>
                <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew || isReadOnly} />
              </div>
              <div className={s.field}>
                <div className={sh.label}>{t("field.name")}</div>
                <input
                  className={sh.input}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>标签</span>
          </div>
          <div className={s.sectionContent}>
            <div>
              {/* Selected tags */}
              <div className={s.tagList}>
                {tags.map((t) => (
                  <span key={t} className={s.tagBadge}>
                    {t}
                    {!isReadOnly && (
                      <button onClick={() => setTags(tags.filter((x) => x !== t))} className={s.tagRemoveBtn}>
                        x
                      </button>
                    )}
                  </span>
                ))}
                {tags.length === 0 && <span className={s.tagNone}>{t("ui.none")}</span>}
              </div>
              {/* Available tags from pool (clickable) */}
              {!isReadOnly && availableTags.length > 0 && (
                <div className={s.tagList}>
                  {availableTags.map((t) => (
                    <button key={t} onClick={() => addTag(t)} className={s.tagPoolBtn}>
                      + {t}
                    </button>
                  ))}
                </div>
              )}
              {/* Free-form input for new tags */}
              {!isReadOnly && (
                <input
                  className={sh.input}
                  style={{ width: "120px" }}
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
                  placeholder={t("ui.customTag")}
                />
              )}
            </div>
          </div>
        </div>

        {/* Attributes */}
        <div className={s.section} style={{ "--sec-color": "var(--sec-orange)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>属性</span>
          </div>
          <div className={s.sectionContent}>
            <div>
              <div className={sh.label}>{t("field.description")}</div>
              <textarea
                className={`${sh.input} ${s.textarea}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isReadOnly}
              />
            </div>

            <div className={s.row3}>
              <div className={s.field}>
                <div className={sh.label}>{t("field.maxStack")}</div>
                <input
                  type="number"
                  className={sh.input}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={maxStack}
                  onChange={(e) => setMaxStack(Math.max(1, Number(e.target.value)))}
                  min={1}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <div className={sh.label}>{t("field.sellable")}</div>
                <label className={s.checkLabel} style={{ cursor: isReadOnly ? "default" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={sellable}
                    onChange={(e) => setSellable(e.target.checked)}
                    disabled={isReadOnly}
                  />
                  <span className={s.checkText}>{sellable ? t("ui.yes") : t("ui.no")}</span>
                </label>
              </div>
              <div className={s.field}>
                <div className={sh.label}>{t("field.price")}</div>
                <input
                  type="number"
                  className={sh.input}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                  min={0}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className={s.actions}>
        {!isReadOnly && (
          <button onClick={handleSave} disabled={saving} className={btnClass("create")}>
            [{t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={item.source || ""}
            getData={() => ({ name, tags, description, maxStack, sellable, price })}
            createFn={(d) => createItemDef(d as ItemDefinition)}
            onSuccess={onBack}
          />
        )}
        {!isReadOnly && !isNew && (
          <button onClick={handleDelete} disabled={saving} className={btnClass("danger")}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} className={btnClass("neutral")}>
          [{t("btn.back")}]
        </button>
        <button onClick={() => setJsonMode(true)} className={btnClass("neutral")}>
          [JSON]
        </button>
        {message && (
          <span className={message === t("status.saved") ? s.messageOk : s.messageErr}>{message}</span>
        )}
      </div>
    </div>
  );
}
