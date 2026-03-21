import { useState } from "react";
import type { GameDefinitions, TraitDefinition, TraitEffect, AbilityDecay } from "../../types/game";
import { createTraitDef, saveTraitDef, deleteTraitDef } from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { EF, EffectDirection, MagnitudeType } from "../../constants";
import PrefixedIdInput from "../shared/PrefixedIdInput";
import { toLocalId } from "../shared/idUtils";
import { inputStyle, labelStyle, btn } from "../shared/styles";
import { RawJsonPanel } from "../shared/RawJsonEditor";
import CloneButton from "../shared/CloneDialog";

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

/** Build effect target options grouped by type. */
function buildTargetOptions(defs: GameDefinitions) {
  const groups: { label: string; options: { value: string; label: string }[] }[] = [];

  // Resources → "{label}(最大值)"
  if (defs.template.resources.length > 0) {
    groups.push({
      label: t("trait.groupResource"),
      options: defs.template.resources.map((r) => ({
        value: r.key,
        label: `${r.label}${t("trait.maxValueSuffix")}`,
      })),
    });
  }

  // Abilities
  if (defs.template.abilities.length > 0) {
    groups.push({
      label: t("trait.groupAbility"),
      options: defs.template.abilities.map((a) => ({
        value: a.key,
        label: a.label,
      })),
    });
  }

  // BasicInfo (number type only)
  const numberFields = defs.template.basicInfo.filter((f) => f.type === "number");
  if (numberFields.length > 0) {
    groups.push({
      label: t("trait.groupBasicInfo"),
      options: numberFields.map((f) => ({
        value: f.key,
        label: f.label,
      })),
    });
  }

  return groups;
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

  const isReadOnly = false; // all addon entities are editable
  const [jsonMode, setJsonMode] = useState(false);
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

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteTrait", { name: name || id }))) return;
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
  };

  /** Format percentage hint: value=5 increase → "+5%", value=5 decrease → "-5%" */
  const pctHint = (value: number, direction: string) => {
    const sign = direction === EffectDirection.INCREASE ? "+" : "-";
    return `${sign}${value}%`;
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
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newTrait") : t("editor.editTrait")} ==
        </span>
        {trait.source && <span style={{ color: T.accent, fontSize: "12px" }}>{t("field.source")}: {trait.source}</span>}
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
          <div style={labelStyle}>{t("field.category")}</div>
          <select
            style={{ ...inputStyle, width: "200px", boxSizing: "border-box" }}
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
          <div style={labelStyle}>{t("field.description")}</div>
          <textarea
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isReadOnly}
          />
        </div>
      </div>

      {/* Experience-specific hint */}
      {category === EF.EXPERIENCE && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>{t("trait.expSettings")}</div>
          <div
            style={{
              borderLeft: `2px solid ${T.borderLight}`,
              paddingLeft: "10px",
              color: T.textDim,
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {t("trait.expHint1")}
            <br />
            {t("trait.expHint2")}
          </div>
        </div>
      )}

      {/* Ability-specific fields */}
      {category === EF.ABILITY && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ ...labelStyle, marginBottom: "6px", fontSize: "12px", color: T.textSub }}>{t("trait.abilitySettings")}</div>
          <div
            style={{
              borderLeft: `2px solid ${T.borderLight}`,
              paddingLeft: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{t("trait.defaultExp")}</div>
                <input
                  type="number"
                  min={0}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(Math.max(0, Number(e.target.value)))}
                  disabled={isReadOnly}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>{t("trait.gradePreview")}</div>
                <div style={{ ...inputStyle, backgroundColor: "transparent", border: "none", paddingTop: "6px" }}>
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
                <span style={{ ...labelStyle, marginBottom: 0 }}>{t("trait.enableDecay")}</span>
              </label>
              {decayEnabled && (
                <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{t("trait.decayInterval")}</div>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                      value={decay.intervalMinutes}
                      onChange={(e) => setDecay({ ...decay, intervalMinutes: Math.max(5, Number(e.target.value)) })}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{t("trait.decayType")}</div>
                    <select
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                      value={decay.type}
                      onChange={(e) => setDecay({ ...decay, type: e.target.value as "fixed" | "percentage" })}
                      disabled={isReadOnly}
                    >
                      <option value={MagnitudeType.FIXED}>{t("trait.fixedValue")}</option>
                      <option value={MagnitudeType.PERCENTAGE}>{t("trait.percentage")}</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>{decay.type === MagnitudeType.PERCENTAGE ? t("trait.decayAmountPctLabel") : t("trait.decayAmountLabel")}</div>
                    <input
                      type="number"
                      min={1}
                      max={decay.type === "percentage" ? 100 : undefined}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
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
              {/* Target */}
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

              {/* Direction */}
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.effect}
                onChange={(e) => updateEffect(idx, { effect: e.target.value as "increase" | "decrease" })}
                disabled={isReadOnly}
              >
                <option value={EffectDirection.INCREASE}>{t("trait.increase")}</option>
                <option value={EffectDirection.DECREASE}>{t("trait.decrease")}</option>
              </select>

              {/* Magnitude type */}
              <select
                style={{ ...inputStyle, width: "70px" }}
                value={eff.magnitudeType}
                onChange={(e) => updateEffect(idx, { magnitudeType: e.target.value as "fixed" | "percentage" })}
                disabled={isReadOnly}
              >
                <option value={MagnitudeType.FIXED}>{t("trait.fixedValue")}</option>
                <option value={MagnitudeType.PERCENTAGE}>{t("trait.percentage")}</option>
              </select>

              {/* Value */}
              <input
                type="number"
                style={{ ...inputStyle, width: "60px" }}
                value={eff.value}
                onChange={(e) => updateEffect(idx, { value: Number(e.target.value) })}
                disabled={isReadOnly}
              />

              {/* Multiplier hint for percentage */}
              {eff.magnitudeType === MagnitudeType.PERCENTAGE && (
                <span style={{ color: T.textDim, fontSize: "11px", width: "50px", flexShrink: 0 }}>
                  {pctHint(eff.value, eff.effect)}
                </span>
              )}

              {/* Delete button */}
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
                marginTop: "2px",
                padding: "3px 10px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
                alignSelf: "flex-start",
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
            style={{ ...btn("create"), ...(saving && { cursor: "not-allowed" }) }}
          >
            [{t("btn.confirm")}]
          </button>
        )}
        {!isReadOnly && !isNew && addonIds && (
          <CloneButton
            addonIds={addonIds}
            defaultAddon={trait.source || ""}
            getData={() => {
              const d: Record<string, unknown> = { name, category, description, effects };
              if (category === EF.ABILITY) { d.defaultValue = defaultValue; d.decay = decayEnabled ? decay : null; }
              return d;
            }}
            createFn={(d) => createTraitDef(d)}
            onSuccess={onBack}
          />
        )}
        {!isReadOnly && !isNew && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{ ...btn("danger"), ...(saving && { cursor: "not-allowed" }) }}
          >
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
        <button onClick={() => setJsonMode(true)} style={btn("neutral")}>
          [JSON]
        </button>
        {message && (
          <span style={{ color: message === t("status.saved") ? T.success : T.danger, fontSize: "12px" }}>{message}</span>
        )}
      </div>
    </div>
  );
}
