import { useState, useCallback } from "react";
import { t, SLOT_LABELS } from "../../i18n/ui";
import type { GameDefinitions, ClothingDefinition } from "../../types/game";
import { fetchDefinitions, fetchClothingDefs } from "../../api/client";
import ClothingEditor from "./ClothingEditor";
import OutfitEditor from "./OutfitEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";
import { RawJsonView } from "../shared/RawJsonEditor";
import { SectionDivider } from "../shared/SectionDivider";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./ClothingManager.module.css";

export default function ClothingManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [clothing, setClothing] = useState<ClothingDefinition[]>([]);
  const { isCollapsed, toggle: toggleCollapse } = useCollapsibleGroups();
  const [editingOutfitId, setEditingOutfitId] = useState<string | null>(null);
  const [isNewOutfit, setIsNewOutfit] = useState(false);

  const loadFn = useCallback(async () => {
    const [defs, clothingList] = await Promise.all([fetchDefinitions(), fetchClothingDefs()]);
    setDefinitions(defs);
    setClothing(clothingList);
  }, []);

  const { editingId, isNew, loading, showJson, setShowJson, handleEdit, handleNew, handleBack, loadData } =
    useManagerState({ onEditingChange, loadFn });

  if (loading || !definitions) {
    return <div className={s.loading}>{t("status.loading")}</div>;
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
      <ClothingEditor clothing={isNew ? blank : (existing ?? blank)} definitions={definitions} isNew={isNew} onBack={handleBack} addonIds={addonIds} />
    );
  }

  const readOnly = isReadOnly(selectedAddon);
  const filteredClothing = selectedAddon ? clothing.filter((c) => c.source === selectedAddon) : clothing;

  if (showJson && selectedAddon) {
    return <RawJsonView addonId={selectedAddon} filename="clothing.json" onClose={() => setShowJson(false)} />;
  }

  // Group clothing by slot — deduplicate accessory1/2/3 into "accessory"
  const rawSlots = definitions.template.clothingSlots;
  const slots = [...new Set(rawSlots.map((s) => (s.startsWith("accessory") ? "accessory" : s)))];
  const grouped: Record<string, ClothingDefinition[]> = {};
  for (const sl of slots) {
    grouped[sl] = [];
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
    <div className={s.wrapper}>
      {/* Header: title + both create buttons */}
      <div className={s.header}>
        <span className={sh.editorTitle}>== {t("header.clothingList")} ==</span>
        {!readOnly && (
          <div className={s.btnRow}>
            <button className={btnClass("neutral", "md")} onClick={() => setShowJson(true)}>
              [JSON]
            </button>
            <button
              className={btnClass("create", "md")}
              onClick={() => {
                setIsNewOutfit(true);
                setEditingOutfitId("__new__");
              }}
            >
              [{t("btn.newPreset")}]
            </button>
            <button className={btnClass("create", "md")} onClick={handleNew}>
              [{t("btn.newClothing")}]
            </button>
          </div>
        )}
      </div>

      <div className={s.catContainer}>
        {/* ── Outfit Presets section ── */}
        <SectionDivider label={t("clothing.presetSection")} />
        {(() => {
          const types = definitions.outfitTypes ?? [];
          return (
            <div className={s.card}>
              <div className={s.cardContent}>
                {types.length === 0 && <span className={s.emptyMsg}>({t("ui.none")})</span>}
                <div className={s.itemGrid}>
                  {types.map((ot) => (
                    <button
                      className={s.item}
                      key={ot.id}
                      onClick={() => {
                        setIsNewOutfit(false);
                        setEditingOutfitId(ot.id);
                      }}
                    >
                      {ot.name || ot.id}
                      <span className={s.presetTag}>
                        {ot.copyDefault ? `(${t("clothing.inheritTag")})` : `(${t("clothing.slotCountTag", { count: Object.values(ot.slots || {}).filter((v) => v.length > 0).length })})`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Clothing Items section ── */}
        <SectionDivider label={t("clothing.itemSection")} />
        {slots.map((slotKey) => {
          const items = grouped[slotKey] || [];
          const slotCollapsed = isCollapsed(slotKey);
          return (
            <div key={slotKey} className={s.card}>
              <button className={s.catBtn} onClick={() => toggleCollapse(slotKey)}>
                <span className={s.catArrow}>
                  {slotCollapsed ? "\u25B6" : "\u25BC"}
                </span>{" "}
                {SLOT_LABELS[slotKey] ?? slotKey} ({items.length})
              </button>
              {!slotCollapsed && items.length > 0 && (
                <div className={s.cardContent}>
                  <div className={s.itemGrid}>
                    {items.map((c) => (
                      <button className={s.item} key={c.id} onClick={() => handleEdit(c.id)}>
                        {c.name || c.id}
                        {c.source && <span className={s.sourceSpan}> [{c.source}]</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Uncategorized */}
        {grouped["__other__"] && grouped["__other__"].length > 0 && (
          <div className={s.card}>
            <button className={s.catBtn} onClick={() => toggleCollapse("__other__")}>
              <span className={s.catArrow}>
                {isCollapsed("__other__") ? "\u25B6" : "\u25BC"}
              </span>{" "}
              {t("label.uncategorized")} ({grouped["__other__"].length})
            </button>
            {!isCollapsed("__other__") && (
              <div className={s.cardContent}>
                <div className={s.itemGrid}>
                  {grouped["__other__"].map((c) => (
                    <button className={s.item} key={c.id} onClick={() => handleEdit(c.id)}>
                      {c.name || c.id}
                      {c.source && <span className={s.sourceSpan}> [{c.source}]</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
