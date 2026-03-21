import { useState, useRef } from "react";
import { t } from "../../i18n/ui";
import type { AddonInfo } from "../../types/game";
import { updateAddonMeta, uploadAsset } from "../../api/client";
import T from "../../theme";
import { fieldInputStyle } from "./AddonSidebar";

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
    <div style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px" }}>
      <span style={{ color: T.textSub, width: "32px", flexShrink: 0 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={fieldInputStyle}
      />
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
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <MetaField label={t("field.name")} value={name} onChange={setName} />
      <MetaField label={t("field.author")} value={author} onChange={setAuthor} />
      <MetaField label={t("field.categories")} value={categories} onChange={setCategories} placeholder={t("addon.commaSep")} />
      <div style={{ display: "flex", gap: "4px", fontSize: "11px" }}>
        <span style={{ color: T.textSub, width: "32px", flexShrink: 0, paddingTop: "4px" }}>{t("field.intro")}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...fieldInputStyle, resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px" }}>
        <span style={{ color: T.textSub, width: "32px", flexShrink: 0 }}>{t("field.cover")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
          {cover && (
            <img
              src={`/assets/${addon.id}/covers/${cover}?t=${coverBust}`}
              alt=""
              style={{
                width: "28px",
                height: "28px",
                objectFit: "cover",
                borderRadius: "3px",
                border: `1px solid ${T.borderDim}`,
              }}
            />
          )}
          <span
            style={{
              fontSize: "11px",
              color: T.textFaint,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cover || t("ui.none")}
          </span>
          <input
            type="file"
            accept="image/*"
            ref={coverFileRef}
            style={{ display: "none" }}
            onChange={handleCoverUpload}
          />
          <button
            onClick={() => coverFileRef.current?.click()}
            style={{ ...fieldInputStyle, width: "auto", padding: "2px 8px", cursor: "pointer", color: T.textSub }}
          >
            {t("btn.select")}
          </button>
          {cover && (
            <button
              onClick={() => setCover("")}
              style={{ ...fieldInputStyle, width: "auto", padding: "2px 8px", cursor: "pointer", color: T.danger }}
            >
              {t("btn.remove")}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ ...fieldInputStyle, width: "auto", padding: "3px 10px", cursor: "pointer", color: T.textSub }}
        >
          {t("btn.cancel")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            ...fieldInputStyle,
            width: "auto",
            padding: "3px 10px",
            cursor: "pointer",
            color: T.success,
            borderColor: T.successDim,
          }}
        >
          {saving ? t("status.saving") : t("btn.save")}
        </button>
      </div>
    </div>
  );
}
