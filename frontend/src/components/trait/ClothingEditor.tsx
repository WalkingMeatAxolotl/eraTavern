import { useState } from "react";
import type { GameDefinitions, ClothingDefinition, TraitEffect } from "../../types/game";
import { createClothingDef, saveClothingDef, deleteClothingDef } from "../../api/client";
import T from "../../theme";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { EffectDirection, MagnitudeType } from "../../constants";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { HelpButton, HelpPanel, helpSub, helpP, helpEm } from "../shared/HelpToggle";
import { toLocalId } from "../shared/idUtils";
import { inputStyle, labelStyle } from "../shared/styles";

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
}

export default function ClothingEditor({ clothing, definitions, isNew, onBack, addonCrud }: Props) {
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
    let m = value / 100;
    if (direction === EffectDirection.DECREASE) m = 2.0 - m;
    return `\u00D7${m.toFixed(2)}`;
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

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteClothing", { name: name || id }))) return;
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
  };

  // Available slots for occlusion (exclude the item's own slots)
  const occlusionOptions = slots.filter((s) => !selectedSlots.includes(s) && !occlusion.includes(s));

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newClothing") : t("editor.editClothing")} ==
        </span>
        {clothing.source && <span style={{ color: T.accent, fontSize: "12px" }}>{t("field.source")}: {clothing.source}</span>}
      </div>

      {/* Basic info */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <PrefixedIdInput prefix={addonPrefix} value={id} onChange={setId} disabled={!isNew || isReadOnly} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>{t("field.name")}</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isReadOnly}
            />
          </div>
        </div>
        <div>
          <div style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "6px" }}>
            {t("clothing.equipSlot")} {selectedSlots.length > 1 && <span style={{ color: T.accent }}>({t("clothing.multiSlot")})</span>}
            <HelpButton show={showSlotHelp} onToggle={() => setShowSlotHelp((v) => !v)} />
          </div>
          {showSlotHelp && (
            <HelpPanel>
              <div style={helpP}>{t("clothing.slotHelp")}</div>
              <div style={helpSub}>{t("clothing.multiSlot")}</div>
              <div style={helpP}>{t("clothing.multiSlotHelp")}</div>
            </HelpPanel>
          )}
          <div
            style={{
              borderLeft: `2px solid ${T.borderLight}`,
              paddingLeft: "10px",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              alignItems: "center",
            }}
          >
            {selectedSlots.map((s, i) => (
              <span
                key={s}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                  padding: "2px 8px",
                  backgroundColor: T.bg2,
                  border: `1px solid ${T.borderLight}`,
                  borderRadius: "3px",
                  fontSize: "12px",
                }}
              >
                {SLOT_LABELS[s] ?? s}
                {!isReadOnly && i > 0 && (
                  <button
                    onClick={() => {
                      const next = selectedSlots.filter((x) => x !== s);
                      setSelectedSlots(next);
                      setOcclusion((prev) => prev.filter((o) => !next.includes(o)));
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: T.danger,
                      cursor: "pointer",
                      padding: "0 2px",
                      fontSize: "12px",
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                )}
              </span>
            ))}
            {!isReadOnly &&
              (() => {
                const available = slots.filter((s) => !selectedSlots.includes(s));
                return available.length > 0 ? (
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const next = [...selectedSlots, e.target.value];
                      setSelectedSlots(next);
                      setOcclusion((prev) => prev.filter((o) => !next.includes(o)));
                    }}
                    style={inputStyle}
                  >
                    <option value="">+</option>
                    {available.map((s) => (
                      <option key={s} value={s}>
                        {SLOT_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                ) : null;
              })()}
          </div>
        </div>
      </div>

      {/* Occlusion */}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            ...labelStyle,
            marginBottom: "6px",
            fontSize: "12px",
            color: T.textSub,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {t("clothing.occlusionSlot")}
          <HelpButton show={showOcclusionHelp} onToggle={() => setShowOcclusionHelp((v) => !v)} />
        </div>
        {showOcclusionHelp && (
          <HelpPanel>
            <div style={helpP}>
              {t("clothing.occlusionHelp1", { highlight: <span style={helpEm}>???</span> })}
            </div>
            <div style={helpP}>
              {t("clothing.occlusionHelp2", { highlight: <span style={helpEm}>worn</span> })}
            </div>
          </HelpPanel>
        )}
        <div
          style={{
            borderLeft: `2px solid ${T.borderLight}`,
            paddingLeft: "10px",
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            alignItems: "center",
          }}
        >
          {occlusion.map((s) => (
            <span
              key={s}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                padding: "2px 8px",
                backgroundColor: T.bg2,
                border: `1px solid ${T.borderLight}`,
                borderRadius: "3px",
                fontSize: "12px",
              }}
            >
              {SLOT_LABELS[s] ?? s}
              {!isReadOnly && (
                <button
                  onClick={() => setOcclusion((prev) => prev.filter((x) => x !== s))}
                  style={{
                    background: "none",
                    border: "none",
                    color: T.danger,
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "12px",
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              )}
            </span>
          ))}
          {!isReadOnly && occlusionOptions.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setOcclusion((prev) => [...prev, e.target.value]);
              }}
              style={inputStyle}
            >
              <option value="">+</option>
              {occlusionOptions.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          )}
          {occlusion.length === 0 && <span style={{ color: T.textDim }}>{t("ui.none")}</span>}
        </div>
      </div>

      {/* Effects */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>{t("section.effects")}</div>
        <div
          style={{
            borderLeft: `2px solid ${T.borderLight}`,
            paddingLeft: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {effects.map((eff, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 8px",
                backgroundColor: T.bg2,
                borderRadius: "3px",
              }}
            >
              <select
                style={{ ...inputStyle, flex: "1 1 0" }}
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
                style={{ ...inputStyle, width: "70px" }}
                value={eff.effect}
                onChange={(e) => updateEffect(idx, { effect: e.target.value as "increase" | "decrease" })}
                disabled={isReadOnly}
              >
                <option value={EffectDirection.INCREASE}>{t("trait.increase")}</option>
                <option value={EffectDirection.DECREASE}>{t("trait.decrease")}</option>
              </select>
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.magnitudeType}
                onChange={(e) => updateEffect(idx, { magnitudeType: e.target.value as "fixed" | "percentage" })}
                disabled={isReadOnly}
              >
                <option value={MagnitudeType.FIXED}>{t("trait.fixedValue")}</option>
                <option value={MagnitudeType.PERCENTAGE}>{t("trait.percentage")}</option>
              </select>
              <input
                type="number"
                style={{ ...inputStyle, width: "60px" }}
                value={eff.value}
                onChange={(e) => updateEffect(idx, { value: Number(e.target.value) })}
                disabled={isReadOnly}
              />
              {eff.magnitudeType === MagnitudeType.PERCENTAGE && (
                <span style={{ color: T.textDim, fontSize: "11px", width: "50px", flexShrink: 0 }}>
                  {pctHint(eff.value, eff.effect)}
                </span>
              )}
              {!isReadOnly && (
                <button
                  onClick={() => removeEffect(idx)}
                  style={{
                    background: "none",
                    border: "none",
                    color: T.danger,
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "0 4px",
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <button
              onClick={addEffect}
              style={{
                marginTop: "6px",
                padding: "3px 10px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              [{t("btn.addEffect")}]
            </button>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "5px 16px",
              backgroundColor: T.bg2,
              color: T.successDim,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "13px",
            }}
          >
            [{t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: "5px 16px",
              backgroundColor: T.bg2,
              color: T.danger,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "13px",
            }}
          >
            [{t("btn.delete")}]
          </button>
        )}
        <button
          onClick={onBack}
          style={{
            padding: "5px 16px",
            backgroundColor: T.bg2,
            color: T.textSub,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          [{t("btn.back")}]
        </button>
        {message && (
          <span style={{ color: message === t("status.saved") ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
  );
}
