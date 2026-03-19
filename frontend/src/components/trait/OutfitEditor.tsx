import { useState } from "react";
import type { GameDefinitions, OutfitType } from "../../types/game";
import { saveOutfitTypes } from "../../api/client";
import T from "../../theme";
import { t, SLOT_LABELS } from "../../i18n/ui";
import { HelpButton, HelpPanel, helpSub, helpP } from "../shared/HelpToggle";
import { inputStyle, labelStyle } from "../shared/styles";

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
  const [showHelp, setShowHelp] = useState(false);

  const clothingSlots = definitions.template.clothingSlots;

  // Group clothing by slot (multi-slot items appear in all their slots)
  const clothingBySlot: Record<string, { id: string; name: string }[]> = {};
  for (const c of Object.values(definitions.clothingDefs)) {
    const cslots = c.slots ?? (c.slot ? [c.slot] : []);
    for (const s of cslots) {
      if (!clothingBySlot[s]) clothingBySlot[s] = [];
      clothingBySlot[s].push({ id: c.id, name: c.name });
    }
  }
  const accessoryItems = clothingBySlot["accessory"] ?? [];
  for (const s of ["accessory1", "accessory2", "accessory3"]) {
    clothingBySlot[s] = [...(clothingBySlot[s] ?? []), ...accessoryItems];
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

  const handleDelete = async () => {
    if (!confirm(t("confirm.deleteOutfit", { name: name || id }))) return;
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
  };

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newOutfit") : t("editor.editOutfit")} ==
        </span>
      </div>

      {/* Basic info */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={!isNew}
              placeholder={t("ph.idPlaceholder")}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>{t("field.name")}</div>
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("ph.displayName")}
            />
          </div>
        </div>
        <div>
          <div style={labelStyle}>{t("field.description")}</div>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("ph.optionalDesc")}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              color: T.textSub,
              fontSize: "12px",
            }}
          >
            <input type="checkbox" checked={copyDefault} onChange={() => setCopyDefault(!copyDefault)} />
            {t("outfit.copyDefault")}
          </label>
          <HelpButton show={showHelp} onToggle={() => setShowHelp((v) => !v)} />
        </div>
        {showHelp && (
          <HelpPanel>
            <div style={helpSub}>{t("outfit.helpOn")}</div>
            <div style={helpP}>{t("outfit.helpOnDesc")}</div>
            <div style={helpSub}>{t("outfit.helpOff")}</div>
            <div style={helpP}>{t("outfit.helpOffDesc")}</div>
          </HelpPanel>
        )}
      </div>

      {/* Slots editor (only when copyDefault is off) */}
      {!copyDefault && (
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              color: T.accent,
              borderBottom: `1px solid ${T.border}`,
              marginBottom: "6px",
              paddingBottom: "2px",
              fontWeight: "bold",
            }}
          >
            == {t("outfit.defaultSlotContent")} ==
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {clothingSlots.map((slot) => {
              const items = slots[slot] ?? [];
              const options = clothingBySlot[slot] ?? [];
              return (
                <div
                  key={slot}
                  style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "2px" }}
                >
                  <span style={{ minWidth: "100px", color: T.textSub }}>{SLOT_LABELS[slot] ?? slot}:</span>
                  {items.length === 0 && <span style={{ color: T.textDim }}>{t("empty.slot")}</span>}
                  {items.map((itemId, i) => {
                    const def = definitions.clothingDefs[itemId];
                    return (
                      <span key={i} style={{ color: T.text, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        [{def?.name ?? itemId}]
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            color: T.danger,
                            cursor: "pointer",
                            padding: "0 2px",
                            fontSize: "11px",
                          }}
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
                    style={{ ...inputStyle, cursor: "pointer" }}
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
      )}
      {copyDefault && !showHelp && (
        <div style={{ color: T.textDim, fontSize: "12px", marginBottom: "16px" }}>
          {t("outfit.inheritHint")}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          style={{
            padding: "4px 12px",
            backgroundColor: "transparent",
            color: T.textSub,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          [{t("btn.return")}]
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "4px 12px",
            backgroundColor: "transparent",
            color: T.successDim,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          [{t("btn.save")}]
        </button>
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: "4px 12px",
              backgroundColor: "transparent",
              color: T.danger,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            [{t("btn.delete")}]
          </button>
        )}
        {message && (
          <span
            style={{
              color:
                message === t("msg.saved") ? T.successDim : T.danger,
              fontSize: "12px",
            }}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
