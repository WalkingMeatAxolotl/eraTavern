import { useState, useMemo } from "react";
import type { GameDefinitions, TraitGroup } from "../../types/game";
import { createTraitGroup, saveTraitGroup, deleteTraitGroup } from "../../api/client";
import { t } from "../../i18n/ui";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import CloneButton from "../shared/CloneDialog";
import sh from "../shared/shared.module.css";
import s from "./TraitGroupEditor.module.css";

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface Props {
  group: TraitGroup;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
  addonCrud?: AddonCrud;
  addonIds?: string[];
}

export default function TraitGroupEditor({ group, definitions, isNew, onBack, addonCrud, addonIds }: Props) {
  const addonPrefix = group.source || "";
  const [data, setData] = useState<TraitGroup>(() => structuredClone(group));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isReadOnly = false; // all addon entities are editable
  const categories = definitions.template.traits;

  // Traits in the same category as the group
  const availableTraits = useMemo(() => {
    return Object.values(definitions.traitDefs)
      .filter((t) => t.category === data.category)
      .map((t) => ({ id: t.id, name: t.name }));
  }, [definitions.traitDefs, data.category]);

  const handleSave = async () => {
    if (!data.id || !data.name) {
      setMessage(t("val.idNameRequired"));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        id: data.id,
        name: data.name,
        category: data.category,
        traits: data.traits,
        exclusive: data.exclusive !== false,
        source: group.source,
      };
      if (addonCrud) {
        if (isNew) {
          await addonCrud.create(payload);
        } else {
          await addonCrud.save(group.id, payload);
        }
        return;
      }
      const result = isNew ? await createTraitGroup(payload) : await saveTraitGroup(group.id, payload);
      setMessage(result.message);
      if (result.success && isNew) {
        onBack();
      }
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteTraitGroup", { name: data.name }))) return;
    setSaving(true);
    try {
      if (addonCrud) {
        await addonCrud.delete(data.id);
        onBack();
        return;
      }
      await deleteTraitGroup(data.id);
      onBack();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  };

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newTraitGroup") : t("editor.editTraitGroup", { name: data.name })} ==
        </span>
        <button className={s.genBtnSub} onClick={onBack}>
          [{t("btn.return")}]
        </button>
      </div>

      {/* ID */}
      <div className={s.row}>
        <span className={s.rowLabel}>ID:</span>
        <PrefixedIdInput
          prefix={addonPrefix}
          value={isNew ? data.id : toLocalId(data.id)}
          onChange={(v) => setData((prev) => ({ ...prev, id: v }))}
          disabled={!isNew || isReadOnly}
        />
      </div>

      {/* Name */}
      <div className={s.row}>
        <span className={s.rowLabel}>{t("field.name")}:</span>
        <input
          className={s.input}
          value={data.name}
          onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
          readOnly={isReadOnly}
        />
      </div>

      {/* Category */}
      <div className={s.row}>
        <span className={s.rowLabel}>{t("field.category")}:</span>
        <select
          className={s.select}
          value={data.category}
          onChange={(e) => setData((prev) => ({ ...prev, category: e.target.value, traits: [] }))}
          disabled={isReadOnly}
        >
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Exclusive */}
      <div className={s.row}>
        <span className={s.rowLabel}>{t("field.exclusive")}:</span>
        <label className={s.checkLabel}>
          <input
            type="checkbox"
            checked={data.exclusive !== false}
            onChange={(e) => setData((prev) => ({ ...prev, exclusive: e.target.checked }))}
            disabled={isReadOnly}
            style={{ cursor: isReadOnly ? "default" : "pointer" }}
          />
          {t("trait.exclusiveHint")}
        </label>
      </div>

      {/* Member traits */}
      <div className={s.memberLabel}>{t("trait.memberTraits")}</div>
      <div className={s.memberWrap}>
        {data.traits.map((tid) => {
          const def = definitions.traitDefs[tid];
          return (
            <span key={tid} className={s.memberChip}>
              {def?.name ?? tid}
              {!isReadOnly && (
                <button
                  className={s.removeBtn}
                  onClick={() => setData((prev) => ({ ...prev, traits: prev.traits.filter((x) => x !== tid) }))}
                >
                  x
                </button>
              )}
            </span>
          );
        })}
        {!isReadOnly && (
          <select
            className={s.select}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setData((prev) => ({ ...prev, traits: [...prev.traits, e.target.value] }));
            }}
          >
            <option value="">+</option>
            {availableTraits
              .filter((t) => !data.traits.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* Action bar */}
      <div className={s.actionBar}>
        {!isReadOnly && (
          <button className={s.genBtnSuccess} onClick={handleSave} disabled={saving}>
            [{saving ? t("status.submitting") : t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={group.source || ""}
            getData={() => ({ name: data.name, category: data.category, traits: data.traits, exclusive: data.exclusive !== false })}
            createFn={(d) => createTraitGroup(d)}
            onSuccess={onBack}
            className={s.genBtnAccent}
          />
        )}
        {!isReadOnly && !isNew && (
          <button className={s.genBtnDanger} onClick={handleDelete} disabled={saving}>
            [{t("btn.delete")}]
          </button>
        )}
        <button className={s.genBtnSub} onClick={onBack}>
          [{t("btn.return")}]
        </button>
        {message && (
          <span
            className={message.includes("fail") || message.includes("not found") ? s.msgError : s.msgSuccess}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
