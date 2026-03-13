import T from "../theme";
import { useEffect, useState, useCallback, useMemo } from "react";
import type { GameDefinitions, TraitDefinition, TraitGroup } from "../types/game";
import { fetchDefinitions, fetchTraitDefs, fetchTraitGroups } from "../api/client";
import TraitEditor from "./TraitEditor";
import TraitGroupEditor from "./TraitGroupEditor";

const hoverStyles = `
  .tm-cat-btn:hover { background-color: ${T.bg3} !important; color: ${T.text} !important; }
  .tm-trait-chip:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .tm-action-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .tm-accent-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.accent} !important; }
`;

export default function TraitManager({ selectedAddon, onEditingChange }: { selectedAddon: string | null; onEditingChange?: (editing: boolean) => void }) {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [traits, setTraits] = useState<TraitDefinition[]>([]);
  const [traitGroups, setTraitGroups] = useState<TraitGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => { onEditingChange?.(editingId !== null || editingGroupId !== null); }, [editingId, editingGroupId, onEditingChange]);

  const loadData = useCallback(async () => {
    const [defs, traitList, groupList] = await Promise.all([
      fetchDefinitions(),
      fetchTraitDefs(),
      fetchTraitGroups(),
    ]);
    setDefinitions(defs);
    setTraits(traitList);
    setTraitGroups(groupList);
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
    setEditingGroupId(null);
    setIsNew(false);
    loadData();
  };

  const handleEditGroup = (id: string) => {
    setIsNew(false);
    setEditingGroupId(id);
  };

  const handleNewGroup = () => {
    setIsNew(true);
    setEditingGroupId("__new__");
  };

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!definitions) {
    return (
      <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>
        加载中...
      </div>
    );
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
      <TraitEditor
        trait={isNew ? blank : (existing ?? blank)}
        definitions={definitions}
        isNew={isNew}
        onBack={handleBack}
      />
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
  definitions, traits, traitGroups, selectedAddon,
  collapsed, onToggleCollapse, onEditTrait, onNewTrait, onEditGroup, onNewGroup,
}: TraitListProps) {
  const readOnly = selectedAddon === null;
  const filteredTraits = selectedAddon ? traits.filter(t => t.source === selectedAddon) : traits;
  const filteredGroups = selectedAddon ? traitGroups.filter(g => g.source === selectedAddon) : traitGroups;

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

  const btnBase: React.CSSProperties = {
    padding: "4px 12px",
    backgroundColor: T.bg2,
    color: T.successDim,
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "13px",
  };

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <style>{hoverStyles}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == 属性列表 ==
        </span>
        {!readOnly && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="tm-action-btn" onClick={onNewGroup} style={btnBase}>[+ 新建特质组]</button>
            <button className="tm-action-btn" onClick={onNewTrait} style={btnBase}>[+ 新建]</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* ── Ability section ── */}
        {abilityCats.length > 0 && (
          <>
            <SectionDivider label="能力" />
            {abilityCats.map((cat) => renderCategory(cat))}
          </>
        )}

        {/* ── Experience section ── */}
        {experienceCats.length > 0 && (
          <>
            <SectionDivider label="经验" />
            {experienceCats.map((cat) => renderCategory(cat))}
          </>
        )}

        {/* ── Trait section ── */}
        {traitCats.length > 0 && (
          <>
            <SectionDivider label="特质" />
            {traitCats.map((cat) => renderCategory(cat))}
          </>
        )}

        {/* Uncategorized */}
        {grouped["__other__"] && grouped["__other__"].length > 0 && (
          <CategorySection
            label="未分类"
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
  label, traitCount, groupCount, isCollapsed, onToggle,
  groups, traits, definitions, onEditTrait, onEditGroup,
}: CategorySectionProps) {
  const [expandGroups, setExpandGroups] = useState(true);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  // Build set of trait IDs highlighted by the hovered group
  const highlightedTraits = useMemo(() => {
    if (!hoveredGroupId) return new Set<string>();
    const g = groups.find((g) => g.id === hoveredGroupId);
    return new Set(g?.traits ?? []);
  }, [hoveredGroupId, groups]);

  const countLabel = groupCount > 0 ? `${traitCount} + ${groupCount}组` : `${traitCount}`;
  return (
    <div>
      <button
        className="tm-cat-btn"
        onClick={onToggle}
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
          {isCollapsed ? "\u25B6" : "\u25BC"}
        </span>
        {" "}{label} ({countLabel})
      </button>
      {!isCollapsed && (
        <div style={{ padding: "8px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* Trait groups */}
          {groups.length > 0 && (
            <>
              {expandGroups ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {groups.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      definitions={definitions}
                      onEditGroup={() => onEditGroup(g.id)}
                      onHoverChange={(hovered) => setHoveredGroupId(hovered ? g.id : null)}
                    />
                  ))}
                  <button
                    className="tm-accent-btn"
                    onClick={() => setExpandGroups(false)}
                    style={{
                      alignSelf: "flex-end",
                      padding: "4px 10px",
                      backgroundColor: T.bg2,
                      color: T.accent,
                      border: `1px solid ${T.accentDim}`,
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px",
                      transition: "background-color 0.1s, border-color 0.1s",
                    }}
                  >
                    [收起组详情]
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                  {groups.map((g) => (
                    <GroupChip
                      key={g.id}
                      group={g}
                      onEditGroup={() => onEditGroup(g.id)}
                      onHoverChange={(hovered) => setHoveredGroupId(hovered ? g.id : null)}
                    />
                  ))}
                  <button
                    className="tm-accent-btn"
                    onClick={() => setExpandGroups(true)}
                    style={{
                      padding: "4px 10px",
                      backgroundColor: T.bg2,
                      color: T.accent,
                      border: `1px solid ${T.accentDim}`,
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px",
                      transition: "background-color 0.1s, border-color 0.1s",
                    }}
                  >
                    [展开组详情]
                  </button>
                </div>
              )}
              {traits.length > 0 && (
                <div style={{ height: "1px", backgroundColor: T.borderDim }} />
              )}
            </>
          )}
          {/* Individual traits */}
          {traits.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
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

function GroupRow({ group, definitions, onEditGroup, onHoverChange }: {
  group: TraitGroup;
  definitions: GameDefinitions;
  onEditGroup: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const memberNames = group.traits.map((tid) => definitions.traitDefs[tid]?.name ?? tid);

  return (
    <button
      onClick={onEditGroup}
      onMouseEnter={() => { setHovered(true); onHoverChange(true); }}
      onMouseLeave={() => { setHovered(false); onHoverChange(false); }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        width: "100%",
        padding: "5px 10px 5px 13px",
        backgroundColor: hovered ? T.bg2 : T.bg1,
        border: "none",
        borderRadius: "2px",
        cursor: "pointer",
        fontSize: "12px",
        textAlign: "left",
        transition: "background-color 0.1s",
      }}
    >
      <span style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "3px",
        backgroundColor: hovered ? T.accent : T.accentDim,
        borderRadius: "2px 0 0 2px",
        transition: "background-color 0.1s",
      }} />
      <span style={{ color: T.accent, whiteSpace: "nowrap" }}>{group.name}</span>
      <span style={{ color: T.textDim }}>:</span>
      <span style={{ color: hovered ? T.text : T.textSub, flex: 1 }}>
        {memberNames.join(" | ")}
      </span>
    </button>
  );
}

// ── Group Chip (compact mode) ─────────────────────────

function GroupChip({ group, onEditGroup, onHoverChange }: {
  group: TraitGroup;
  onEditGroup: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const count = group.traits.length;

  return (
    <button
      onClick={onEditGroup}
      onMouseEnter={() => { setHovered(true); onHoverChange(true); }}
      onMouseLeave={() => { setHovered(false); onHoverChange(false); }}
      style={{
        position: "relative",
        padding: "4px 10px 4px 12px",
        backgroundColor: hovered ? T.bg2 : T.bg1,
        color: T.accent,
        border: `1px solid ${hovered ? T.accent : T.accentDim}`,
        borderRadius: "3px",
        cursor: "pointer",
        fontSize: "12px",
        transition: "background-color 0.15s, border-color 0.15s",
      }}
    >
      {/* Left accent bar */}
      <span style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "3px",
        backgroundColor: hovered ? T.accent : T.accentDim,
        borderRadius: "3px 0 0 3px",
        transition: "background-color 0.15s",
      }} />
      {group.name}
      <span style={{ color: T.textDim, marginLeft: "4px" }}>({count})</span>
    </button>
  );
}

// ── Trait Chip ──────────────────────────────────────────

function TraitChip({ trait, highlighted, dimmed, onClick }: {
  trait: TraitDefinition;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="tm-trait-chip"
      onClick={onClick}
      style={{
        position: "relative",
        padding: "4px 10px",
        backgroundColor: highlighted ? T.bg3 : T.bg1,
        color: dimmed ? T.textDim : T.text,
        border: `1px solid ${highlighted ? T.accentDim : T.border}`,
        borderRadius: "3px",
        cursor: "pointer",
        fontSize: "12px",
        opacity: dimmed ? 0.45 : 1,
        transition: "background-color 0.15s, border-color 0.15s, opacity 0.15s, color 0.15s",
      }}
    >
      {trait.name || trait.id}
      {trait.source && (
        <span style={{ color: T.textDim, fontSize: "11px" }}> [{trait.source}]</span>
      )}
    </button>
  );
}

// ── Section Divider ────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      margin: "4px 0 2px",
      fontSize: "12px",
      color: T.textDim,
    }}>
      <span style={{ color: T.accent, fontWeight: "bold" }}>{label}</span>
      <span style={{ flex: 1, height: "1px", backgroundColor: T.borderDim }} />
    </div>
  );
}
