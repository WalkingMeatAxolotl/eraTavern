import { useState } from "react";
import clsx from "clsx";
import type { GameDefinitions, TraitDefinition, TraitEffect, AbilityDecay } from "../../types/game";
import { createTraitDef, saveTraitDef, deleteTraitDef } from "../../api/client";
import { t } from "../../i18n/ui";
import { useConfirm } from "../shared/useConfirm";
import { EF } from "../../constants";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import TraitEffectListEditor from "../shared/TraitEffectListEditor";
import { toLocalId } from "../shared/idUtils";
import { RawJsonPanel } from "../shared/RawJsonEditor";
import CloneButton from "../shared/CloneDialog";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./TraitEditor.module.css";

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface TraitEditorProps {
  trait: TraitDefinition;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
  addonCrud?: AddonCrud;
  addonIds?: string[];
}

export default function TraitEditor({ trait, definitions, isNew, onBack, addonCrud, addonIds }: TraitEditorProps) {
  const addonPrefix = trait.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(trait.id));
  const [name, setName] = useState(trait.name);
  const [category, setCategory] = useState(trait.category);
  const [description, setDescription] = useState(trait.description ?? "");
  const [effects, setEffects] = useState<TraitEffect[]>([...trait.effects]);
  const [defaultValue, setDefaultValue] = useState<number>(trait.defaultValue ?? 0);
  const [decayEnabled, setDecayEnabled] = useState<boolean>(!!trait.decay);
  const [decay, setDecay] = useState<AbilityDecay>(trait.decay ?? { amount: 0, type: "fixed", intervalMinutes: 60 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmUI, showConfirm] = useConfirm();

  const isReadOnly = false; // all addon entities are editable
  const [jsonMode, setJsonMode] = useState(false);

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage(t("val.idNameRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data: Record<string, unknown> = { id, name, category, description, effects, source: trait.source };
      if (category === EF.ABILITY) {
        data.defaultValue = defaultValue;
        data.decay = decayEnabled ? decay : null;
      }
      if (addonCrud) {
        if (isNew) {
          await addonCrud.create(data);
        } else {
          await addonCrud.save(trait.id, data);
        }
        return;
      }
      const result = isNew ? await createTraitDef(data) : await saveTraitDef(trait.id, data);
      setMessage(result.success ? t("status.saved") : result.message);
      if (result.success && isNew) {
        // Return to list after creating
        setTimeout(onBack, 500);
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    showConfirm(
      { title: t("confirm.title"), message: t("confirm.deleteTrait", { name: name || id }), confirmLabel: t("btn.delete"), danger: true },
      async () => {
        setSaving(true);
        try {
          if (addonCrud) {
            await addonCrud.delete(trait.id);
            onBack();
            return;
          }
          const result = await deleteTraitDef(trait.id);
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
      },
    );
  };

  const buildData = (): Record<string, unknown> => {
    const data: Record<string, unknown> = { id, name, category, description, effects };
    if (category === EF.ABILITY) {
      data.defaultValue = defaultValue;
      data.decay = decayEnabled ? decay : null;
    }
    return data;
  };

  if (jsonMode) {
    return (
      <RawJsonPanel
        data={buildData()}
        onSave={async (data) => {
          const result = isNew ? await createTraitDef({ ...data, source: trait.source } as never) : await saveTraitDef(trait.id, { ...data, source: trait.source } as never);
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
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newTrait") : t("editor.editTrait")} ==
        </span>
        {trait.source && <span className={s.sourceTag}>{t("field.source")}: {trait.source}</span>}
      </div>

      {/* Basic info */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>基础信息</span>
        </div>
        <div className={s.sectionContent}>
          <div className={s.formGroup}>
            <div className={s.row2}>
              <div className={s.col}>
                <div className={sh.label}>ID</div>
                <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew || isReadOnly} />
              </div>
              <div className={s.col}>
                <div className={sh.label}>{t("field.name")}</div>
                <input
                  className={clsx(sh.input, s.fullWidth)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
            </div>
            <div>
              <div className={sh.label}>{t("field.category")}</div>
              <select
                className={clsx(sh.input, s.selectW200)}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isReadOnly}
              >
                {definitions.template.traits.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className={sh.label}>{t("field.description")}</div>
              <textarea
                className={clsx(sh.input, s.textarea)}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Experience-specific hint */}
      {category === EF.EXPERIENCE && (
        <div className={s.section} style={{ "--sec-color": "var(--sec-orange)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>{t("trait.expSettings")}</span>
          </div>
          <div className={s.sectionContent}>
            <div className={s.hintBlock}>
              {t("trait.expHint1")}
              <br />
              {t("trait.expHint2")}
            </div>
          </div>
        </div>
      )}

      {/* Ability-specific fields */}
      {category === EF.ABILITY && (
        <div className={s.section} style={{ "--sec-color": "var(--sec-orange)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>{t("trait.abilitySettings")}</span>
          </div>
          <div className={s.sectionContentCol}>
            <div className={s.row2}>
              <div className={s.col}>
                <div className={sh.label}>{t("trait.defaultExp")}</div>
                <input
                  type="number"
                  min={0}
                  className={clsx(sh.input, s.fullWidth)}
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(Math.max(0, Number(e.target.value)))}
                  disabled={isReadOnly}
                />
              </div>
              <div className={s.col}>
                <div className={sh.label}>{t("trait.gradePreview")}</div>
                <div className={s.gradePreview}>
                  {(() => {
                    const grades = ["G", "F", "E", "D", "C", "B", "A", "S"];
                    const level = Math.min(Math.floor(defaultValue / 1000), grades.length - 1);
                    return grades[Math.max(0, level)];
                  })()}
                </div>
              </div>
            </div>

            {/* Decay settings */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={decayEnabled}
                  onChange={(e) => setDecayEnabled(e.target.checked)}
                  disabled={isReadOnly}
                />
                <span className={sh.label} style={{ marginBottom: 0 }}>{t("trait.enableDecay")}</span>
              </label>
              {decayEnabled && (
                <div className={s.row2} style={{ marginTop: "6px" }}>
                  <div className={s.col}>
                    <div className={sh.label}>{t("trait.decayInterval")}</div>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      className={clsx(sh.input, s.fullWidth)}
                      value={decay.intervalMinutes}
                      onChange={(e) => setDecay({ ...decay, intervalMinutes: Math.max(5, Number(e.target.value)) })}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div className={s.col}>
                    <div className={sh.label}>{t("trait.decayType")}</div>
                    <select
                      className={clsx(sh.input, s.fullWidth)}
                      value={decay.type}
                      onChange={(e) => setDecay({ ...decay, type: e.target.value as "fixed" | "percentage" })}
                      disabled={isReadOnly}
                    >
                      <option value={MagnitudeType.FIXED}>{t("trait.fixedValue")}</option>
                      <option value={MagnitudeType.PERCENTAGE}>{t("trait.percentage")}</option>
                    </select>
                  </div>
                  <div className={s.col}>
                    <div className={sh.label}>{decay.type === MagnitudeType.PERCENTAGE ? t("trait.decayAmountPctLabel") : t("trait.decayAmountLabel")}</div>
                    <input
                      type="number"
                      min={1}
                      max={decay.type === "percentage" ? 100 : undefined}
                      className={clsx(sh.input, s.fullWidth)}
                      value={decay.amount}
                      onChange={(e) => {
                        let v = Math.max(1, Number(e.target.value));
                        if (decay.type === MagnitudeType.PERCENTAGE) v = Math.min(100, v);
                        setDecay({ ...decay, amount: v });
                      }}
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Effects */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-red)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.effects")}</span>
        </div>
        <div className={s.sectionContent}>
          <TraitEffectListEditor effects={effects} onChange={setEffects} definitions={definitions} disabled={isReadOnly} />
        </div>
      </div>

      {/* Action bar */}
      <div className={s.actionBar}>
        {!isReadOnly && (
          <button
            className={btnClass("create")}
            onClick={handleSave}
            disabled={saving}
          >
            [{t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={trait.source || ""}
            entityType="traits"
            sourceId={trait.id}
            onSuccess={onBack}
          />
        )}
        {!isReadOnly && !isNew && (
          <button
            className={btnClass("danger")}
            onClick={handleDelete}
            disabled={saving}
          >
            [{t("btn.delete")}]
          </button>
        )}
        <button className={btnClass("neutral")} onClick={onBack}>
          [{t("btn.back")}]
        </button>
        <button className={btnClass("neutral")} onClick={() => setJsonMode(true)}>
          [JSON]
        </button>
        {message && (
          <span className={message === t("status.saved") ? s.msgSuccess : s.msgError}>{message}</span>
        )}
      </div>
      {confirmUI}
    </div>
  );
}
