import { useState, useCallback, useMemo } from "react";
import clsx from "clsx";
import { t } from "../../i18n/ui";
import type { GameDefinitions, TraitDefinition, TraitGroup } from "../../types/game";
import { fetchDefinitions, fetchTraitDefs, fetchTraitGroups } from "../../api/client";
import TraitEditor from "./TraitEditor";
import TraitGroupEditor from "./TraitGroupEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";
import { RawJsonView } from "../shared/RawJsonEditor";
import { SectionDivider } from "../shared/SectionDivider";
import { useManagerState } from "../shared/useManagerState";
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./TraitManager.module.css";

export default function TraitManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [traits, setTraits] = useState<TraitDefinition[]>([]);
  const [traitGroups, setTraitGroups] = useState<TraitGroup[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const { collapsed, toggle: toggleCollapse } = useCollapsibleGroups();

  const loadFn = useCallback(async () => {
    const [defs, traitList, groupList] = await Promise.all([fetchDefinitions(), fetchTraitDefs(), fetchTraitGroups()]);
    setDefinitions(defs);
    setTraits(traitList);
    setTraitGroups(groupList);
  }, []);

  const { editingId, isNew, loading, handleEdit, handleNew, handleBack: hookHandleBack } = useManagerState({
    onEditingChange,
    loadFn,
    isEditingExtra: editingGroupId !== null,
  });

  const handleBack = useCallback(() => {
    setEditingGroupId(null);
    hookHandleBack();
  }, [hookHandleBack]);

  const handleEditGroup = (id: string) => {
    setEditingGroupId(id);
  };

  const handleNewGroup = () => {
    setEditingGroupId("__new__");
  };

  if (loading || !definitions) {
    return <div className={s.loading}>{t("status.loading")}</div>;
  }

  // Group editor view
  if (editingGroupId !== null) {
    const existingGroup = traitGroups.find((g) => g.id === editingGroupId);
    const blankGroup: TraitGroup = {
      id: "",
      name: "",
      category: definitions.template.traits[0]?.key ?? "",
      traits: [],
      source: selectedAddon ?? "",
    };

    return (
      <TraitGroupEditor
        group={isNew ? blankGroup : (existingGroup ?? blankGroup)}
        definitions={definitions}
        isNew={isNew}
        onBack={handleBack}
        addonIds={addonIds}
      />
    );
  }

  // Editor view
  if (editingId !== null) {
    const existing = traits.find((t) => t.id === editingId);
    const blank: TraitDefinition = {
      id: "",
      name: "",
      category: definitions.template.traits[0]?.key ?? "",
      description: "",
      effects: [],
      source: selectedAddon ?? "",
    };

    return (
      <TraitEditor trait={isNew ? blank : (existing ?? blank)} definitions={definitions} isNew={isNew} onBack={handleBack} addonIds={addonIds} />
    );
  }

  return (
    <TraitList
      definitions={definitions}
      traits={traits}
      traitGroups={traitGroups}
      selectedAddon={selectedAddon}
      collapsed={collapsed}
      onToggleCollapse={toggleCollapse}
      onEditTrait={handleEdit}
      onNewTrait={handleNew}
      onEditGroup={handleEditGroup}
      onNewGroup={handleNewGroup}
    />
  );
}

// ── List View ──────────────────────────────────────────

interface TraitListProps {
  definitions: GameDefinitions;
  traits: TraitDefinition[];
  traitGroups: TraitGroup[];
  selectedAddon: string | null;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (key: string) => void;
  onEditTrait: (id: string) => void;
  onNewTrait: () => void;
  onEditGroup: (id: string) => void;
  onNewGroup: () => void;
}

function TraitList({
  definitions,
  traits,
  traitGroups,
  selectedAddon,
  collapsed,
  onToggleCollapse,
  onEditTrait,
  onNewTrait,
  onEditGroup,
  onNewGroup,
}: TraitListProps) {
  const readOnly = selectedAddon === null;
  const filteredTraits = selectedAddon ? traits.filter((t) => t.source === selectedAddon) : traits;
  const filteredGroups = selectedAddon ? traitGroups.filter((g) => g.source === selectedAddon) : traitGroups;
  const [showJson, setShowJson] = useState(false);

  const groupsByCategory = useMemo(() => {
    const result: Record<string, TraitGroup[]> = {};
    for (const g of filteredGroups) {
      if (!result[g.category]) result[g.category] = [];
      result[g.category].push(g);
    }
    return result;
  }, [filteredGroups]);

  // Group traits by category
  const categories = definitions.template.traits;
  const grouped: Record<string, TraitDefinition[]> = {};
  for (const cat of categories) {
    grouped[cat.key] = [];
  }
  for (const t of filteredTraits) {
    if (grouped[t.category]) {
      grouped[t.category].push(t);
    } else {
      if (!grouped["__other__"]) grouped["__other__"] = [];
      grouped["__other__"].push(t);
    }
  }

  // Split categories into three groups
  const abilityCats = categories.filter((c) => c.key === "ability");
  const experienceCats = categories.filter((c) => c.key === "experience");
  const traitCats = categories.filter((c) => c.key !== "ability" && c.key !== "experience");

  const renderCategory = (cat: { key: string; label: string }) => {
    const items = grouped[cat.key] || [];
    const catGroups = groupsByCategory[cat.key] ?? [];
    const isCollapsed = collapsed[cat.key] ?? false;
    return (
      <CategorySection
        key={cat.key}
        label={cat.label}
        traitCount={items.length}
        groupCount={catGroups.length}
        isCollapsed={isCollapsed}
        onToggle={() => onToggleCollapse(cat.key)}
        groups={catGroups}
        traits={items}
        definitions={definitions}
        onEditTrait={onEditTrait}
        onEditGroup={onEditGroup}
      />
    );
  };

  if (showJson && selectedAddon) {
    return <RawJsonView addonId={selectedAddon} filename="traits.json" onClose={() => setShowJson(false)} />;
  }

  return (
    <div className={s.wrapper}>
      <div className={s.header}>
        <span className={sh.editorTitle}>== {t("header.traitList")} ==</span>
        {!readOnly && (
          <div className={s.btnRow}>
            <button className={btnClass("neutral", "md")} onClick={() => setShowJson(true)}>
              [JSON]
            </button>
            <button className={btnClass("create", "md")} onClick={onNewGroup}>
              [{t("btn.newTraitGroup")}]
            </button>
            <button className={btnClass("create", "md")} onClick={onNewTrait}>
              [{t("btn.newTrait")}]
            </button>
          </div>
        )}
      </div>

      <div className={s.catContainer}>
        {/* ── Ability section ── */}
        {abilityCats.length > 0 && (
          <>
            <SectionDivider label={t("trait.sectionAbility")} />
            {abilityCats.map((cat) => renderCategory(cat))}
          </>
        )}

        {/* ── Experience section ── */}
        {experienceCats.length > 0 && (
          <>
            <SectionDivider label={t("trait.sectionExperience")} />
            {experienceCats.map((cat) => renderCategory(cat))}
          </>
        )}

        {/* ── Trait section ── */}
        {traitCats.length > 0 && (
          <>
            <SectionDivider label={t("trait.sectionTrait")} />
            {traitCats.map((cat) => renderCategory(cat))}
          </>
        )}

        {/* Uncategorized */}
        {grouped["__other__"] && grouped["__other__"].length > 0 && (
          <CategorySection
            label={t("label.uncategorized")}
            traitCount={grouped["__other__"].length}
            groupCount={0}
            isCollapsed={collapsed["__other__"] ?? false}
            onToggle={() => onToggleCollapse("__other__")}
            groups={[]}
            traits={grouped["__other__"]}
            definitions={definitions}
            onEditTrait={onEditTrait}
            onEditGroup={onEditGroup}
          />
        )}
      </div>

    </div>
  );
}

// ── Category Section ───────────────────────────────────

interface CategorySectionProps {
  label: string;
  traitCount: number;
  groupCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
  groups: TraitGroup[];
  traits: TraitDefinition[];
  definitions: GameDefinitions;
  onEditTrait: (id: string) => void;
  onEditGroup: (id: string) => void;
}

function CategorySection({
  label,
  traitCount,
  groupCount,
  isCollapsed,
  onToggle,
  groups,
  traits,
  definitions,
  onEditTrait,
  onEditGroup,
}: CategorySectionProps) {
  const [expandGroups, setExpandGroups] = useState(true);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  // Build set of trait IDs highlighted by the hovered group
  const highlightedTraits = useMemo(() => {
    if (!hoveredGroupId) return new Set<string>();
    const g = groups.find((g) => g.id === hoveredGroupId);
    return new Set(g?.traits ?? []);
  }, [hoveredGroupId, groups]);

  const countLabel = groupCount > 0 ? `${traitCount} + ${t("trait.groupCountLabel", { count: groupCount })}` : `${traitCount}`;
  return (
    <div className={s.card}>
      <button className={s.catBtn} onClick={onToggle}>
        <span className={s.catArrow}>
          {isCollapsed ? "\u25B6" : "\u25BC"}
        </span>{" "}
        {label} ({countLabel})
      </button>
      {!isCollapsed && (
        <div className={s.catContent}>
          {/* Trait groups */}
          {groups.length > 0 && (
            <>
              {expandGroups ? (
                <div className={s.groupColumn}>
                  {groups.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      definitions={definitions}
                      onEditGroup={() => onEditGroup(g.id)}
                      onHoverChange={(hovered) => setHoveredGroupId(hovered ? g.id : null)}
                    />
                  ))}
                  <button className={s.collapseBtn} onClick={() => setExpandGroups(false)}>
                    [{t("trait.collapseGroups")}]
                  </button>
                </div>
              ) : (
                <div className={s.groupChipWrap}>
                  {groups.map((g) => (
                    <GroupChip
                      key={g.id}
                      group={g}
                      onEditGroup={() => onEditGroup(g.id)}
                      onHoverChange={(hovered) => setHoveredGroupId(hovered ? g.id : null)}
                    />
                  ))}
                  <button className={s.accentBtn} onClick={() => setExpandGroups(true)}>
                    [{t("trait.expandGroups")}]
                  </button>
                </div>
              )}
              {traits.length > 0 && <div className={s.divider} />}
            </>
          )}
          {/* Individual traits */}
          {traits.length > 0 && (
            <div className={s.traitGrid}>
              {traits.map((t) => {
                const isHighlighted = highlightedTraits.has(t.id);
                const isDimmed = hoveredGroupId !== null && !isHighlighted;
                return (
                  <TraitChip
                    key={t.id}
                    trait={t}
                    highlighted={isHighlighted}
                    dimmed={isDimmed}
                    onClick={() => onEditTrait(t.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Group Row (expanded mode) ──────────────────────────

function GroupRow({
  group,
  definitions,
  onEditGroup,
  onHoverChange,
}: {
  group: TraitGroup;
  definitions: GameDefinitions;
  onEditGroup: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const memberNames = group.traits.map((tid) => definitions.traitDefs[tid]?.name ?? tid);

  return (
    <button
      className={s.groupRow}
      onClick={onEditGroup}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <span className={s.groupRowName}>{group.name}</span>
      <span className={s.groupRowSep}>:</span>
      <span className={s.groupRowMembers}>{memberNames.join(" | ")}</span>
    </button>
  );
}

// ── Group Chip (compact mode) ─────────────────────────

function GroupChip({
  group,
  onEditGroup,
  onHoverChange,
}: {
  group: TraitGroup;
  onEditGroup: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const count = group.traits.length;

  return (
    <button
      className={s.groupChip}
      onClick={onEditGroup}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {group.name}
      <span className={s.groupChipCount}>({count})</span>
    </button>
  );
}

// ── Trait Chip ──────────────────────────────────────────

function TraitChip({
  trait,
  highlighted,
  dimmed,
  onClick,
}: {
  trait: TraitDefinition;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(s.traitChip, highlighted && s.traitChipHighlighted, dimmed && s.traitChipDimmed)}
      onClick={onClick}
    >
      {trait.name || trait.id}
      {trait.source && <span className={s.traitChipSource}> [{trait.source}]</span>}
    </button>
  );
}
