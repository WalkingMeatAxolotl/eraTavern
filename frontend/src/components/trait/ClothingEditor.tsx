import { useState } from "react";
import clsx from "clsx";
import type { GameDefinitions, ClothingDefinition, TraitEffect } from "../../types/game";
import { createClothingDef, saveClothingDef, deleteClothingDef } from "../../api/client";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { useConfirm } from "../shared/useConfirm";
import { EffectDirection, MagnitudeType } from "../../constants";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { HelpButton, HelpPanel, helpStyles } from "../shared/HelpToggle";
import { toLocalId } from "../shared/idUtils";
import CloneButton from "../shared/CloneDialog";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./ClothingEditor.module.css";

function buildTargetOptions(defs: GameDefinitions) {
  const groups: { label: string; options: { value: string; label: string }[] }[] = [];
  if (defs.template.resources.length > 0) {
    groups.push({
      label: t("trait.groupResource"),
      options: defs.template.resources.map((r) => ({ value: r.key, label: `${r.label}${t("trait.maxValueSuffix")}` })),
    });
  }
  if (defs.template.abilities.length > 0) {
    groups.push({
      label: t("trait.groupAbility"),
      options: defs.template.abilities.map((a) => ({ value: a.key, label: a.label })),
    });
  }
  const numberFields = defs.template.basicInfo.filter((f) => f.type === "number");
  if (numberFields.length > 0) {
    groups.push({
      label: t("trait.groupBasicInfo"),
      options: numberFields.map((f) => ({ value: f.key, label: f.label })),
    });
  }
  return groups;
}

interface AddonCrud {
  save: (id: string, data: unknown) => Promise<void>;
  create: (data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

interface Props {
  clothing: ClothingDefinition;
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
  addonCrud?: AddonCrud;
  addonIds?: string[];
}

export default function ClothingEditor({ clothing, definitions, isNew, onBack, addonCrud, addonIds }: Props) {
  const addonPrefix = clothing.source || "";
  const [id, setId] = useState(isNew ? "" : toLocalId(clothing.id));
  const [name, setName] = useState(clothing.name);
  const [selectedSlots, setSelectedSlots] = useState<string[]>(
    clothing.slots ?? (clothing.slot ? [clothing.slot] : []),
  );
  const [occlusion, setOcclusion] = useState<string[]>([...clothing.occlusion]);
  const [effects, setEffects] = useState<TraitEffect[]>([...(clothing.effects ?? [])]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmUI, showConfirm] = useConfirm();
  const [showSlotHelp, setShowSlotHelp] = useState(false);
  const [showOcclusionHelp, setShowOcclusionHelp] = useState(false);

  const isReadOnly = false; // all addon entities are editable
  const slots = [
    ...new Set(definitions.template.clothingSlots.map((s) => (s.startsWith("accessory") ? "accessory" : s))),
  ];
  const targetGroups = buildTargetOptions(definitions);
  const allTargets = targetGroups.flatMap((g) => g.options);

  const updateEffect = (idx: number, patch: Partial<TraitEffect>) => {
    setEffects((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEffect = (idx: number) => {
    setEffects((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEffect = () => {
    const firstTarget = allTargets[0]?.value ?? "";
    setEffects((prev) => [...prev, { target: firstTarget, effect: EffectDirection.INCREASE, magnitudeType: MagnitudeType.FIXED, value: 0 }]);
  };

  const pctHint = (value: number, direction: string) => {
    const sign = direction === EffectDirection.INCREASE ? "+" : "-";
    return `${sign}${value}%`;
  };

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage(t("val.idNameRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = { id, name, slots: selectedSlots, occlusion, effects, source: clothing.source };
      if (addonCrud) {
        if (isNew) {
          await addonCrud.create(data);
        } else {
          await addonCrud.save(clothing.id, data);
        }
        return;
      }
      const result = isNew ? await createClothingDef(data) : await saveClothingDef(clothing.id, data);
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

  const handleDelete = () => {
    showConfirm(
      { title: t("confirm.title"), message: t("confirm.deleteClothing", { name: name || id }), confirmLabel: t("btn.delete"), danger: true },
      async () => {
        setSaving(true);
        try {
          if (addonCrud) {
            await addonCrud.delete(clothing.id);
            onBack();
            return;
          }
          const result = await deleteClothingDef(clothing.id);
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

  // Available slots for occlusion (exclude the item's own slots)
  const occlusionOptions = slots.filter((s) => !selectedSlots.includes(s) && !occlusion.includes(s));

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newClothing") : t("editor.editClothing")} ==
        </span>
        {clothing.source && <span className={s.sourceTag}>{t("field.source")}: {clothing.source}</span>}
      </div>

      {/* Basic info */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
        <div className={s.sectionTitle}><span className={s.sectionTitleText}>{t("section.basicInfo")}</span></div>
        <div className={s.sectionContent}>
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
        </div>
      </div>
      <div className={s.section} style={{ "--sec-color": "var(--sec-purple)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>
              {t("clothing.equipSlot")} {selectedSlots.length > 1 && <span className={s.multiSlotTag}>({t("clothing.multiSlot")})</span>}
            </span>
            <HelpButton show={showSlotHelp} onToggle={() => setShowSlotHelp((v) => !v)} />
          </div>
          <div className={s.sectionContent}>
          {showSlotHelp && (
            <HelpPanel>
              <div className={helpStyles.helpP}>{t("clothing.slotHelp")}</div>
              <div className={helpStyles.helpSub}>{t("clothing.multiSlot")}</div>
              <div className={helpStyles.helpP}>{t("clothing.multiSlotHelp")}</div>
            </HelpPanel>
          )}
          <div className={s.chipList}>
            {selectedSlots.map((sl, i) => (
              <span key={sl} className={s.chip}>
                {SLOT_LABELS[sl] ?? sl}
                {!isReadOnly && i > 0 && (
                  <button
                    className={s.removeBtn}
                    onClick={() => {
                      const next = selectedSlots.filter((x) => x !== sl);
                      setSelectedSlots(next);
                      setOcclusion((prev) => prev.filter((o) => !next.includes(o)));
                    }}
                  >
                    x
                  </button>
                )}
              </span>
            ))}
            {!isReadOnly &&
              (() => {
                const available = slots.filter((sl) => !selectedSlots.includes(sl));
                return available.length > 0 ? (
                  <select
                    className={sh.input}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const next = [...selectedSlots, e.target.value];
                      setSelectedSlots(next);
                      setOcclusion((prev) => prev.filter((o) => !next.includes(o)));
                    }}
                  >
                    <option value="">+</option>
                    {available.map((sl) => (
                      <option key={sl} value={sl}>
                        {SLOT_LABELS[sl] ?? sl}
                      </option>
                    ))}
                  </select>
                ) : null;
              })()}
          </div>
          </div>
        </div>

      {/* Occlusion */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-purple)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("clothing.occlusionSlot")}</span>
          <HelpButton show={showOcclusionHelp} onToggle={() => setShowOcclusionHelp((v) => !v)} />
        </div>
        <div className={s.sectionContent}>
        {showOcclusionHelp && (
          <HelpPanel>
            <div className={helpStyles.helpP}>
              {t("clothing.occlusionHelp1", { highlight: <span className={helpStyles.helpEm}>???</span> })}
            </div>
            <div className={helpStyles.helpP}>
              {t("clothing.occlusionHelp2", { highlight: <span className={helpStyles.helpEm}>worn</span> })}
            </div>
          </HelpPanel>
        )}
        <div className={s.chipList}>
          {occlusion.map((sl) => (
            <span key={sl} className={s.chip}>
              {SLOT_LABELS[sl] ?? sl}
              {!isReadOnly && (
                <button
                  className={s.removeBtn}
                  onClick={() => setOcclusion((prev) => prev.filter((x) => x !== sl))}
                >
                  x
                </button>
              )}
            </span>
          ))}
          {!isReadOnly && occlusionOptions.length > 0 && (
            <select
              className={sh.input}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setOcclusion((prev) => [...prev, e.target.value]);
              }}
            >
              <option value="">+</option>
              {occlusionOptions.map((sl) => (
                <option key={sl} value={sl}>
                  {SLOT_LABELS[sl] ?? sl}
                </option>
              ))}
            </select>
          )}
          {occlusion.length === 0 && <span className={s.noneText}>{t("ui.none")}</span>}
        </div>
        </div>
      </div>

      {/* Effects */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-red)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("section.effects")}</span>
        </div>
        <div className={s.sectionContent}>
        <div className={s.effectList}>
          {effects.map((eff, idx) => (
            <div key={idx} className={s.effectRow}>
              <select
                className={clsx(sh.input, sh.flex1)}
                value={eff.target}
                onChange={(e) => updateEffect(idx, { target: e.target.value })}
                disabled={isReadOnly}
              >
                {targetGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                className={clsx(sh.input, sh.w70)}
                value={eff.effect}
                onChange={(e) => updateEffect(idx, { effect: e.target.value as "increase" | "decrease" })}
                disabled={isReadOnly}
              >
                <option value={EffectDirection.INCREASE}>{t("trait.increase")}</option>
                <option value={EffectDirection.DECREASE}>{t("trait.decrease")}</option>
              </select>
              <select
                className={clsx(sh.input, sh.w70)}
                value={eff.magnitudeType}
                onChange={(e) => updateEffect(idx, { magnitudeType: e.target.value as "fixed" | "percentage" })}
                disabled={isReadOnly}
              >
                <option value={MagnitudeType.FIXED}>{t("trait.fixedValue")}</option>
                <option value={MagnitudeType.PERCENTAGE}>{t("trait.percentage")}</option>
              </select>
              <input
                type="number"
                className={clsx(sh.input, sh.w60)}
                value={eff.value}
                onChange={(e) => updateEffect(idx, { value: Number(e.target.value) })}
                disabled={isReadOnly}
              />
              {eff.magnitudeType === MagnitudeType.PERCENTAGE && (
                <span className={s.pctHint}>
                  {pctHint(eff.value, eff.effect)}
                </span>
              )}
              {!isReadOnly && (
                <button className={s.deleteBtn} onClick={() => removeEffect(idx)}>
                  x
                </button>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <button className={s.addEffectBtn} onClick={addEffect}>
              [{t("btn.addEffect")}]
            </button>
          )}
        </div>
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
            defaultAddon={clothing.source || ""}
            entityType="clothing"
            sourceId={clothing.id}
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
        {message && (
          <span className={message === t("status.saved") ? s.msgSuccess : s.msgError}>{message}</span>
        )}
      </div>
      {confirmUI}
    </div>
  );
}
