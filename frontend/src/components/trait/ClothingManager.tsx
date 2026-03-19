import T from "../../theme";
import { useEffect, useState, useCallback } from "react";
import { t, SLOT_LABELS } from "../../i18n/ui";
import type { GameDefinitions, ClothingDefinition } from "../../types/game";
import { fetchDefinitions, fetchClothingDefs } from "../../api/client";
import ClothingEditor from "./ClothingEditor";
import OutfitEditor from "./OutfitEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";

const hoverStyles = `
  .cm-cat-btn:hover { background-color: ${T.bg3} !important; color: ${T.text} !important; }
  .cm-item:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .cm-action-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
`;

export default function ClothingManager({
  selectedAddon,
  onEditingChange,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [clothing, setClothing] = useState<ClothingDefinition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const { isCollapsed, toggle: toggleCollapse } = useCollapsibleGroups();
  const [editingOutfitId, setEditingOutfitId] = useState<string | null>(null);
  const [isNewOutfit, setIsNewOutfit] = useState(false);

  useEffect(() => {
    onEditingChange?.(editingId !== null);
  }, [editingId, onEditingChange]);

  const loadData = useCallback(async () => {
    const [defs, clothingList] = await Promise.all([fetchDefinitions(), fetchClothingDefs()]);
    setDefinitions(defs);
    setClothing(clothingList);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = (id: string) => {
    setIsNew(false);
    setEditingId(id);
  };

  const handleNew = () => {
    setIsNew(true);
    setEditingId("__new__");
  };

  const handleBack = () => {
    setEditingId(null);
    setIsNew(false);
    loadData();
  };

  if (!definitions) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
  }

  // Outfit editor view
  if (editingOutfitId !== null) {
    const types = definitions.outfitTypes ?? [];
    const existing = types.find((t) => t.id === editingOutfitId);
    const blank = { id: "", name: "", description: "", copyDefault: true, slots: {} };
    return (
      <OutfitEditor
        outfit={isNewOutfit ? blank : (existing ?? blank)}
        allOutfits={types}
        definitions={definitions}
        isNew={isNewOutfit}
        onBack={() => {
          setEditingOutfitId(null);
          setIsNewOutfit(false);
          loadData();
        }}
      />
    );
  }

  // Clothing editor view
  if (editingId !== null) {
    const existing = clothing.find((c) => c.id === editingId);
    const blank: ClothingDefinition = {
      id: "",
      name: "",
      slot: definitions.template.clothingSlots[0] ?? "",
      occlusion: [],
      effects: [],
      source: selectedAddon ?? "",
    };

    return (
      <ClothingEditor
        clothing={isNew ? blank : (existing ?? blank)}
        definitions={definitions}
        isNew={isNew}
        onBack={handleBack}
      />
    );
  }

  const readOnly = selectedAddon === null;
  const filteredClothing = selectedAddon ? clothing.filter((c) => c.source === selectedAddon) : clothing;

  // Group clothing by slot — deduplicate accessory1/2/3 into "accessory"
  const rawSlots = definitions.template.clothingSlots;
  const slots = [...new Set(rawSlots.map((s) => (s.startsWith("accessory") ? "accessory" : s)))];
  const grouped: Record<string, ClothingDefinition[]> = {};
  for (const s of slots) {
    grouped[s] = [];
  }
  for (const c of filteredClothing) {
    const cslots = c.slots ?? (c.slot ? [c.slot] : []);
    const primarySlot = cslots[0] ?? "";
    const key = primarySlot.startsWith("accessory") ? "accessory" : primarySlot;
    if (grouped[key]) {
      grouped[key].push(c);
    } else {
      if (!grouped["__other__"]) grouped["__other__"] = [];
      grouped["__other__"].push(c);
    }
  }

  return (
    <div
      style={{
        fontSize: "13px",
        color: T.text,
        padding: "12px 0",
      }}
    >
      <style>{hoverStyles}</style>
      {/* Header: title + both create buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.clothingList")} ==</span>
        {!readOnly && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              className="cm-action-btn"
              onClick={() => {
                setIsNewOutfit(true);
                setEditingOutfitId("__new__");
              }}
              style={{
                padding: "4px 12px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              [{t("btn.newPreset")}]
            </button>
            <button
              className="cm-action-btn"
              onClick={handleNew}
              style={{
                padding: "4px 12px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              [{t("btn.newClothing")}]
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* ── Outfit Presets section ── */}
        <SectionDivider label={t("clothing.presetSection")} />
        {(() => {
          const types = definitions.outfitTypes ?? [];
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
              {types.length === 0 && <span style={{ color: T.textDim, fontSize: "12px" }}>({t("ui.none")})</span>}
              {types.map((ot) => (
                <button
                  className="cm-item"
                  key={ot.id}
                  onClick={() => {
                    setIsNewOutfit(false);
                    setEditingOutfitId(ot.id);
                  }}
                  style={{
                    position: "relative",
                    padding: "4px 10px",
                    backgroundColor: T.bg1,
                    color: T.text,
                    border: `1px solid ${T.border}`,
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "12px",
                    transition: "background-color 0.15s, border-color 0.15s",
                  }}
                >
                  {ot.name || ot.id}
                  <span style={{ color: T.textDim, fontSize: "11px", marginLeft: "4px" }}>
                    {ot.copyDefault ? `(${t("clothing.inheritTag")})` : `(${t("clothing.slotCountTag", { count: Object.values(ot.slots).filter((v) => v.length > 0).length })})`}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Clothing Items section ── */}
        <SectionDivider label={t("clothing.itemSection")} />
        {slots.map((slotKey) => {
          const items = grouped[slotKey] || [];
          const slotCollapsed = isCollapsed(slotKey);
          return (
            <div key={slotKey}>
              <button
                className="cm-cat-btn"
                onClick={() => toggleCollapse(slotKey)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 12px",
                  backgroundColor: T.bg2,
                  color: T.textSub,
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  borderRadius: "3px",
                  transition: "background-color 0.1s, color 0.1s",
                }}
              >
                <span style={{ display: "inline-block", width: "1.2em", textAlign: "center", fontSize: "11px" }}>
                  {slotCollapsed ? "\u25B6" : "\u25BC"}
                </span>{" "}
                {SLOT_LABELS[slotKey] ?? slotKey} ({items.length})
              </button>
              {!slotCollapsed && items.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                  {items.map((c) => (
                    <button
                      className="cm-item"
                      key={c.id}
                      onClick={() => handleEdit(c.id)}
                      style={{
                        position: "relative",
                        padding: "4px 10px",
                        backgroundColor: T.bg1,
                        color: T.text,
                        border: `1px solid ${T.border}`,
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontSize: "12px",
                        transition: "background-color 0.15s, border-color 0.15s",
                      }}
                    >
                      {c.name || c.id}
                      {c.source && <span style={{ color: T.textSub, fontSize: "11px" }}> [{c.source}]</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Uncategorized */}
        {grouped["__other__"] && grouped["__other__"].length > 0 && (
          <div>
            <button
              className="cm-cat-btn"
              onClick={() => toggleCollapse("__other__")}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 12px",
                backgroundColor: T.bg2,
                color: T.textSub,
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                borderRadius: "3px",
                transition: "background-color 0.1s, color 0.1s",
              }}
            >
              <span style={{ display: "inline-block", width: "1.2em", textAlign: "center", fontSize: "11px" }}>
                {isCollapsed("__other__") ? "\u25B6" : "\u25BC"}
              </span>{" "}
              {t("label.uncategorized")} ({grouped["__other__"].length})
            </button>
            {!isCollapsed("__other__") && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                {grouped["__other__"].map((c) => (
                  <button
                    className="cm-item"
                    key={c.id}
                    onClick={() => handleEdit(c.id)}
                    style={{
                      position: "relative",
                      padding: "4px 10px",
                      backgroundColor: T.bg1,
                      color: T.text,
                      border: `1px solid ${T.border}`,
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px",
                      transition: "background-color 0.15s, border-color 0.15s",
                    }}
                  >
                    {c.name || c.id}
                    {c.source && <span style={{ color: T.textSub, fontSize: "11px" }}> [{c.source}]</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: "4px 0 2px",
        fontSize: "12px",
        color: T.textDim,
      }}
    >
      <span style={{ color: T.accent, fontWeight: "bold" }}>{label}</span>
      <span style={{ flex: 1, height: "1px", backgroundColor: T.borderDim }} />
    </div>
  );
}
