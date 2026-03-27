import { useState } from "react";
import clsx from "clsx";
import type { GameDefinitions, OutfitType } from "../../types/game";
import { saveOutfitTypes } from "../../api/client";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { useConfirm } from "../shared/useConfirm";
import { HelpButton, HelpPanel, helpStyles } from "../shared/HelpToggle";
import sh from "../shared/shared.module.css";
import s from "./OutfitEditor.module.css";

interface Props {
  outfit: OutfitType;
  allOutfits: OutfitType[];
  definitions: GameDefinitions;
  isNew: boolean;
  onBack: () => void;
}

export default function OutfitEditor({ outfit, allOutfits, definitions, isNew, onBack }: Props) {
  const [id, setId] = useState(isNew ? "" : outfit.id);
  const [name, setName] = useState(outfit.name);
  const [description, setDescription] = useState(outfit.description ?? "");
  const [copyDefault, setCopyDefault] = useState(outfit.copyDefault);
  const [slots, setSlots] = useState<Record<string, string[]>>(structuredClone(outfit.slots));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmUI, showConfirm] = useConfirm();
  const [showHelp, setShowHelp] = useState(false);

  const clothingSlots = definitions.template.clothingSlots;

  // Group clothing by slot (multi-slot items appear in all their slots)
  const clothingBySlot: Record<string, { id: string; name: string }[]> = {};
  for (const c of Object.values(definitions.clothingDefs)) {
    const cslots = c.slots ?? (c.slot ? [c.slot] : []);
    for (const sl of cslots) {
      if (!clothingBySlot[sl]) clothingBySlot[sl] = [];
      clothingBySlot[sl].push({ id: c.id, name: c.name });
    }
  }
  const accessoryItems = clothingBySlot["accessory"] ?? [];
  for (const sl of ["accessory1", "accessory2", "accessory3"]) {
    clothingBySlot[sl] = [...(clothingBySlot[sl] ?? []), ...accessoryItems];
  }

  const handleSave = async () => {
    if (!id.trim() || !name.trim()) {
      setMessage(t("val.idNameRequired"));
      return;
    }
    if (id === "default") {
      setMessage(t("msg.noDefaultId"));
      return;
    }
    if (isNew && allOutfits.some((o) => o.id === id)) {
      setMessage(t("msg.idExists"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const entry: OutfitType = { id, name, description, copyDefault, slots };
      const next = isNew ? [...allOutfits, entry] : allOutfits.map((o) => (o.id === outfit.id ? entry : o));
      const result = await saveOutfitTypes(next);
      setMessage(result.success ? t("msg.saved") : result.message);
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
      { title: t("confirm.title"), message: t("confirm.deleteOutfit", { name: name || id }), confirmLabel: t("btn.delete"), danger: true },
      async () => {
        setSaving(true);
        try {
          const next = allOutfits.filter((o) => o.id !== outfit.id);
          const result = await saveOutfitTypes(next);
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

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <span className={sh.editorTitle}>
          == {isNew ? t("editor.newOutfit") : t("editor.editOutfit")} ==
        </span>
      </div>

      {/* Basic info */}
      <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>基础信息</span>
        </div>
        <div className={s.sectionContent}>
        <div className={s.row2}>
          <div className={s.col}>
            <div className={sh.label}>ID</div>
            <input
              className={clsx(sh.input, s.fullWidth)}
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={!isNew}
              placeholder={t("ph.idPlaceholder")}
            />
          </div>
          <div className={s.col}>
            <div className={sh.label}>{t("field.name")}</div>
            <input
              className={clsx(sh.input, s.fullWidth)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("ph.displayName")}
            />
          </div>
        </div>
        <div>
          <div className={sh.label}>{t("field.description")}</div>
          <textarea
            className={clsx(sh.input, s.textarea)}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("ph.optionalDesc")}
          />
        </div>
        <div className={s.checkRow}>
          <label className={s.checkLabel}>
            <input type="checkbox" checked={copyDefault} onChange={() => setCopyDefault(!copyDefault)} />
            {t("outfit.copyDefault")}
          </label>
          <HelpButton show={showHelp} onToggle={() => setShowHelp((v) => !v)} />
        </div>
        {showHelp && (
          <HelpPanel>
            <div className={helpStyles.helpSub}>{t("outfit.helpOn")}</div>
            <div className={helpStyles.helpP}>{t("outfit.helpOnDesc")}</div>
            <div className={helpStyles.helpSub}>{t("outfit.helpOff")}</div>
            <div className={helpStyles.helpP}>{t("outfit.helpOffDesc")}</div>
          </HelpPanel>
        )}
        </div>
      </div>

      {/* Slots editor (only when copyDefault is off) */}
      {!copyDefault && (
        <div className={s.section} style={{ "--sec-color": "var(--sec-purple)" } as React.CSSProperties}>
          <div className={s.sectionTitle}>
            <span className={s.sectionTitleText}>{t("outfit.defaultSlotContent")}</span>
          </div>
          <div className={s.sectionContent}>
          <div className={s.slotsColumn}>
            {clothingSlots.map((slot) => {
              const items = slots[slot] ?? [];
              const options = clothingBySlot[slot] ?? [];
              return (
                <div key={slot} className={s.slotRow}>
                  <span className={s.slotLabel}>{SLOT_LABELS[slot] ?? slot}:</span>
                  {items.length === 0 && <span className={s.slotEmpty}>{t("empty.slot")}</span>}
                  {items.map((itemId, i) => {
                    const def = definitions.clothingDefs[itemId];
                    return (
                      <span key={i} className={s.slotItem}>
                        [{def?.name ?? itemId}]
                        <button
                          className={s.removeBtn}
                          onClick={() => {
                            const newSlots = { ...slots, [slot]: items.filter((_, j) => j !== i) };
                            setSlots(newSlots);
                          }}
                        >
                          x
                        </button>
                      </span>
                    );
                  })}
                  <select
                    className={sh.input}
                    style={{ cursor: "pointer" }}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const newSlots = { ...slots, [slot]: [...items, e.target.value] };
                      setSlots(newSlots);
                    }}
                  >
                    <option value="">{t("btn.addClothingItem")}</option>
                    {options
                      .filter((c) => !items.includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}
      {copyDefault && !showHelp && (
        <div className={s.inheritHint}>
          {t("outfit.inheritHint")}
        </div>
      )}

      {/* Actions */}
      <div className={s.actionBar}>
        <button className={s.genBtnSub} onClick={onBack}>
          [{t("btn.return")}]
        </button>
        <button className={s.genBtnSuccess} onClick={handleSave} disabled={saving}>
          [{t("btn.save")}]
        </button>
        {!isNew && (
          <button className={s.genBtnDanger} onClick={handleDelete} disabled={saving}>
            [{t("btn.delete")}]
          </button>
        )}
        {message && (
          <span className={message === t("msg.saved") ? s.msgSuccess : s.msgError}>
            {message}
          </span>
        )}
      </div>
      {confirmUI}
    </div>
  );
}
