import { useState, useRef } from "react";
import { t } from "../../i18n/ui";
import type { AddonInfo } from "../../types/game";
import { updateAddonMeta, uploadAsset } from "../../api/client";
import clsx from "clsx";
import s from "./AddonMetaEditor.module.css";

function MetaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className={s.fieldRow}>
      <span className={s.fieldLabel}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={s.fieldInput} />
    </div>
  );
}

export default function AddonMetaEditor({
  addon,
  displayVersion,
  onUpdated,
  onClose,
}: {
  addon: AddonInfo;
  displayVersion: string;
  onUpdated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(addon.name);
  const [author, setAuthor] = useState(addon.author ?? "");
  const [description, setDescription] = useState(addon.description ?? "");
  const [categories, setCategories] = useState((addon.categories ?? []).join(", "));
  const [cover, setCover] = useState(addon.cover ?? "");
  const [coverBust, setCoverBust] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Reset fields when addon identity changes
  const keyRef = useRef(`${addon.id}@${addon.version}`);
  if (`${addon.id}@${addon.version}` !== keyRef.current) {
    keyRef.current = `${addon.id}@${addon.version}`;
    setName(addon.name);
    setAuthor(addon.author ?? "");
    setDescription(addon.description ?? "");
    setCategories((addon.categories ?? []).join(", "));
    setCover(addon.cover ?? "");
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const cats = categories
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await updateAddonMeta(addon.id, displayVersion, {
        name,
        author: author || undefined,
        description: description || undefined,
        cover: cover,
        categories: cats.length > 0 ? cats : undefined,
      });
      onUpdated();
      onClose();
    } catch (e) {
      console.error("Failed to update addon meta:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadAsset(file, "covers", `addon-${addon.id}`, { addonId: addon.id });
    if (result.success && result.filename) {
      setCover(result.filename);
      setCoverBust(Date.now());
    }
    e.target.value = "";
  };

  return (
    <div className={s.container}>
      <MetaField label={t("field.name")} value={name} onChange={setName} />
      <MetaField label={t("field.author")} value={author} onChange={setAuthor} />
      <MetaField label={t("field.categories")} value={categories} onChange={setCategories} placeholder={t("addon.commaSep")} />
      <div className={s.fieldRow}>
        <span className={clsx(s.fieldLabel, s.fieldLabelTop)}>{t("field.intro")}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={s.textarea} />
      </div>
      <div className={s.fieldRow}>
        <span className={s.fieldLabel}>{t("field.cover")}</span>
        <div className={s.coverRow}>
          {cover && (
            <img src={`/assets/${addon.id}/covers/${cover}?t=${coverBust}`} alt="" className={s.coverImg} />
          )}
          <span className={s.coverName}>{cover || t("ui.none")}</span>
          <input type="file" accept="image/*" ref={coverFileRef} className={s.coverHidden} onChange={handleCoverUpload} />
          <button onClick={() => coverFileRef.current?.click()} className={clsx(s.smallBtn, s.smallBtnSub)}>
            {t("btn.select")}
          </button>
          {cover && (
            <button onClick={() => setCover("")} className={clsx(s.smallBtn, s.smallBtnDanger)}>
              {t("btn.remove")}
            </button>
          )}
        </div>
      </div>
      <div className={s.actions}>
        <button onClick={onClose} className={clsx(s.actionBtn, s.actionBtnCancel)}>
          {t("btn.cancel")}
        </button>
        <button onClick={handleSave} disabled={saving || !name.trim()} className={clsx(s.actionBtn, s.actionBtnSave)}>
          {saving ? t("status.saving") : t("btn.save")}
        </button>
      </div>
    </div>
  );
}
