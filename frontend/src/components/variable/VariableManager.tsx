import T from "../../theme";
import { useEffect, useState, useCallback, useMemo } from "react";
import { t } from "../../i18n/ui";
import type { VariableDefinition, GameDefinitions } from "../../types/game";
import {
  fetchVariableDefs,
  fetchVariableTags,
  createVariableTag,
  deleteVariableTag,
  fetchDefinitions,
} from "../../api/client";
import VariableEditor from "./VariableEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";
import { Tooltip } from "../shared/Tooltip";

const hoverStyles = `
  .vm-cat-btn:hover { background-color: ${T.bg3} !important; color: ${T.text} !important; }
  .vm-item:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .vm-tag-chip:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .vm-action-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .vm-view-tab:hover { background-color: ${T.bg3} !important; }
`;

type ViewMode = "byTag" | "byVar";

// ── Main ──────────────────────────────────────────────

export default function VariableManager({
  selectedAddon,
  onEditingChange,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [variables, setVariables] = useState<VariableDefinition[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    onEditingChange?.(editingId !== null);
  }, [editingId, onEditingChange]);
  const [viewMode, setViewMode] = useState<ViewMode>("byTag");
  const [newTagInput, setNewTagInput] = useState("");
  const [showTagManager, setShowTagManager] = useState(false);
  const { collapsed, toggle: toggleCollapse } = useCollapsibleGroups();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [varList, tagList, defs] = await Promise.all([fetchVariableDefs(), fetchVariableTags(), fetchDefinitions()]);
    setVariables(varList);
    setAllTags(tagList);
    setDefinitions(defs);
    setLoading(false);
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

  const handleAddTag = async () => {
    const t = newTagInput.trim();
    if (!t) return;
    const result = await createVariableTag(t);
    if (result.success) {
      setAllTags((prev) => [...prev, t]);
      setNewTagInput("");
    }
  };

  const handleDeleteTag = async (tag: string) => {
    const result = await deleteVariableTag(tag);
    if (result.success) {
      setAllTags((prev) => prev.filter((t) => t !== tag));
    }
  };

  const readOnly = selectedAddon === null;
  const addonFiltered = selectedAddon ? variables.filter((v) => v.source === selectedAddon) : variables;
  const singleVars = addonFiltered.filter((v) => !v.isBidirectional);
  const biVars = addonFiltered.filter((v) => v.isBidirectional);
  const filteredVars = addonFiltered;

  // Auto-collect tags from variables
  const visibleTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const v of filteredVars) {
      for (const t of v.tags ?? []) tagSet.add(t);
    }
    const poolSet = new Set(allTags);
    const fromPool = allTags.filter((t) => tagSet.has(t));
    const extra = [...tagSet].filter((t) => !poolSet.has(t)).sort();
    return [...fromPool, ...extra];
  }, [filteredVars, allTags]);

  // Tag usage count
  const tagUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const v of filteredVars) {
      for (const t of v.tags ?? []) usage[t] = (usage[t] || 0) + 1;
    }
    return usage;
  }, [filteredVars]);

  // Group: tag → variables (many-to-many)
  const { tagGrouped, untagged } = useMemo(() => {
    const g: Record<string, VariableDefinition[]> = {};
    const noTag: VariableDefinition[] = [];
    for (const v of filteredVars) {
      const vTags = v.tags ?? [];
      if (vTags.length === 0) {
        noTag.push(v);
        continue;
      }
      for (const t of vTags) {
        if (!g[t]) g[t] = [];
        g[t].push(v);
      }
    }
    return { tagGrouped: g, untagged: noTag };
  }, [filteredVars]);

  // Reverse: var → tags
  const varTagsMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const v of filteredVars) {
      m[v.id] = v.tags ?? [];
    }
    return m;
  }, [filteredVars]);

  // Reverse: tag → var names
  const tagVarNames = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const tag of visibleTags) {
      m[tag] = (tagGrouped[tag] ?? []).map((v) => v.name || v.id);
    }
    return m;
  }, [visibleTags, tagGrouped]);

  if (loading) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
  }

  // Editor view
  if (editingId !== null) {
    const existing = variables.find((v) => v.id === editingId);
    const blank: VariableDefinition = {
      id: "",
      name: "",
      description: "",
      tags: [],
      steps: [],
      isBidirectional: undefined,
      source: selectedAddon ?? "",
    };
    return (
      <VariableEditor
        variable={isNew ? blank : (existing ?? blank)}
        isNew={isNew}
        allTags={allTags}
        allVariables={variables}
        definitions={definitions}
        onBack={handleBack}
      />
    );
  }

  const viewTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    backgroundColor: active ? T.bg3 : T.bg1,
    color: active ? T.accent : T.textDim,
    border: `1px solid ${active ? T.accent : T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
    transition: "background-color 0.1s, border-color 0.1s, color 0.1s",
  });

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <style>{hoverStyles}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.derivedVars")} ==</span>
          {/* View toggle */}
          <div style={{ display: "flex", gap: "2px" }}>
            <button
              className="vm-view-tab"
              onClick={() => setViewMode("byTag")}
              style={viewTabStyle(viewMode === "byTag")}
            >
              {t("btn.byTagView")}
            </button>
            <button
              className="vm-view-tab"
              onClick={() => setViewMode("byVar")}
              style={viewTabStyle(viewMode === "byVar")}
            >
              {t("btn.byVarView")}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!readOnly && (
            <button
              className="vm-action-btn"
              onClick={() => setShowTagManager((v) => !v)}
              style={{
                padding: "4px 12px",
                backgroundColor: T.bg2,
                color: showTagManager ? T.accent : T.textSub,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "13px",
                transition: "background-color 0.1s, border-color 0.1s",
              }}
            >
              [{t("btn.tagMgmt")}]
            </button>
          )}
          {!readOnly && (
            <button
              className="vm-action-btn"
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
              [{t("btn.newVar")}]
            </button>
          )}
        </div>
      </div>

      {/* Tag manager */}
      {showTagManager && (
        <div
          style={{
            marginBottom: "12px",
            padding: "8px",
            backgroundColor: T.bg1,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
          }}
        >
          <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "6px" }}>{t("var.tagPool")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
            {allTags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  backgroundColor: T.bg1,
                  border: `1px solid ${T.borderLight}`,
                  borderRadius: "3px",
                  fontSize: "12px",
                }}
              >
                {tag}
                <span style={{ color: T.textDim, fontSize: "11px" }}>({tagUsage[tag] || 0})</span>
                <button
                  onClick={() => handleDeleteTag(tag)}
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
              </span>
            ))}
            {allTags.length === 0 && <span style={{ color: T.textDim }}>{t("empty.noTags")}</span>}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              style={{
                flex: 1,
                padding: "4px 8px",
                backgroundColor: T.bg1,
                color: T.text,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                fontSize: "12px",
              }}
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder={t("var.newTagPlaceholder")}
            />
            <button
              className="vm-action-btn"
              onClick={handleAddTag}
              style={{
                padding: "4px 10px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "12px",
                transition: "background-color 0.1s, border-color 0.1s",
              }}
            >
              [+]
            </button>
          </div>
        </div>
      )}

      {/* Single-direction variables */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          margin: "8px 0 4px",
          fontSize: "12px",
          color: T.textDim,
        }}
      >
        <span style={{ color: T.accent, fontWeight: "bold" }}>{t("section.uniVars")}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${T.border}` }} />
      </div>
      {singleVars.length === 0 ? (
        <div style={{ color: T.textDim, fontSize: "12px", padding: "4px 0" }}>{t("empty.uniVars")}</div>
      ) : viewMode === "byTag" ? (
        <ByTagView
          visibleTags={visibleTags}
          tagGrouped={tagGrouped}
          untagged={untagged}
          varTagsMap={varTagsMap}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditVar={handleEdit}
          filterFn={(v) => !v.isBidirectional}
        />
      ) : (
        <ByVarView filteredVars={singleVars} varTagsMap={varTagsMap} tagVarNames={tagVarNames} onEditVar={handleEdit} />
      )}

      {/* Bidirectional variables */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          margin: "12px 0 4px",
          fontSize: "12px",
          color: T.textDim,
        }}
      >
        <span style={{ color: T.accent, fontWeight: "bold" }}>{t("section.biVars")}</span>
        <div style={{ flex: 1, borderBottom: `1px solid ${T.border}` }} />
      </div>
      {biVars.length === 0 ? (
        <div style={{ color: T.textDim, fontSize: "12px", padding: "4px 0" }}>{t("empty.biVars")}</div>
      ) : viewMode === "byTag" ? (
        <ByTagView
          visibleTags={visibleTags}
          tagGrouped={tagGrouped}
          untagged={untagged}
          varTagsMap={varTagsMap}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditVar={handleEdit}
          filterFn={(v) => !!v.isBidirectional}
        />
      ) : (
        <ByVarView filteredVars={biVars} varTagsMap={varTagsMap} tagVarNames={tagVarNames} onEditVar={handleEdit} />
      )}
    </div>
  );
}

// ── By Tag View ───────────────────────────────────────
// Tag groups → variable chips. Hover variable → tooltip shows all its tags.

function ByTagView({
  visibleTags,
  tagGrouped,
  untagged,
  varTagsMap,
  collapsed,
  onToggleCollapse,
  onEditVar,
  filterFn,
}: {
  visibleTags: string[];
  tagGrouped: Record<string, VariableDefinition[]>;
  untagged: VariableDefinition[];
  varTagsMap: Record<string, string[]>;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (key: string) => void;
  onEditVar: (id: string) => void;
  filterFn?: (v: VariableDefinition) => boolean;
}) {
  const [tooltipInfo, setTooltipInfo] = useState<{ text: string; el: HTMLElement } | null>(null);

  const showVarTooltip = (v: VariableDefinition, el: HTMLElement) => {
    const tags = varTagsMap[v.id] ?? [];
    if (tags.length > 0) {
      setTooltipInfo({ text: t("var.tagsLabel", { tags: tags.join(", ") }), el });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {tooltipInfo && <Tooltip text={tooltipInfo.text} anchorRef={tooltipInfo.el} />}
      {visibleTags.map((tag) => {
        const tagVars = (tagGrouped[tag] ?? []).filter((v) => !filterFn || filterFn(v));
        if (tagVars.length === 0) return null;
        const isCollapsed = collapsed[`tag:${tag}`] ?? false;
        return (
          <div key={tag}>
            <button
              className="vm-cat-btn"
              onClick={() => onToggleCollapse(`tag:${tag}`)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "5px 12px",
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
              </span>{" "}
              {tag}
              <span style={{ color: T.textDim, marginLeft: "4px", fontSize: "11px" }}>({tagVars.length})</span>
            </button>
            {!isCollapsed && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "6px 8px" }}>
                {tagVars.map((v) => (
                  <button
                    className="vm-item"
                    key={v.id}
                    onClick={() => onEditVar(v.id)}
                    onMouseEnter={(e) => showVarTooltip(v, e.currentTarget)}
                    onMouseLeave={() => setTooltipInfo(null)}
                    style={{
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
                    {v.name || v.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Untagged */}
      {untagged.filter((v) => !filterFn || filterFn(v)).length > 0 && (
        <div>
          <button
            className="vm-cat-btn"
            onClick={() => onToggleCollapse("tag:__untagged__")}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "5px 12px",
              backgroundColor: T.bg2,
              color: T.textDim,
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              borderRadius: "3px",
              transition: "background-color 0.1s, color 0.1s",
            }}
          >
            <span style={{ display: "inline-block", width: "1.2em", textAlign: "center", fontSize: "11px" }}>
              {(collapsed["tag:__untagged__"] ?? false) ? "\u25B6" : "\u25BC"}
            </span>{" "}
            {t("label.uncategorized")}
            <span style={{ color: T.textDim, marginLeft: "4px", fontSize: "11px" }}>
              ({untagged.filter((v) => !filterFn || filterFn(v)).length})
            </span>
          </button>
          {!(collapsed["tag:__untagged__"] ?? false) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "6px 8px" }}>
              {untagged
                .filter((v) => !filterFn || filterFn(v))
                .map((v) => (
                  <button
                    className="vm-item"
                    key={v.id}
                    onClick={() => onEditVar(v.id)}
                    style={{
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
                    {v.name || v.id}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── By Variable View ──────────────────────────────────
// Variable rows → tag chips. Hover tag → tooltip shows variables with that tag.

function ByVarView({
  filteredVars,
  varTagsMap,
  tagVarNames,
  onEditVar,
}: {
  filteredVars: VariableDefinition[];
  varTagsMap: Record<string, string[]>;
  tagVarNames: Record<string, string[]>;
  onEditVar: (id: string) => void;
}) {
  const [tooltipInfo, setTooltipInfo] = useState<{ text: string; el: HTMLElement } | null>(null);

  const showTagTooltip = (tag: string, el: HTMLElement) => {
    const names = tagVarNames[tag] ?? [];
    if (names.length > 0) {
      const display = names.length > 8 ? names.slice(0, 8).join(", ") + ` ... ${t("var.totalCount", { count: names.length })}` : names.join(", ");
      setTooltipInfo({ text: display, el });
    }
  };

  const groups = useMemo(() => {
    const tagged: VariableDefinition[] = [];
    const untagged: VariableDefinition[] = [];
    for (const v of filteredVars) {
      if ((v.tags ?? []).length > 0) tagged.push(v);
      else untagged.push(v);
    }
    return { tagged, untagged };
  }, [filteredVars]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      {tooltipInfo && <Tooltip text={tooltipInfo.text} anchorRef={tooltipInfo.el} />}
      {groups.tagged.map((v) => {
        const tags = varTagsMap[v.id] ?? [];
        return (
          <VarRow
            key={v.id}
            variable={v}
            tags={tags}
            onEdit={() => onEditVar(v.id)}
            onTagHover={(tag, el) => showTagTooltip(tag, el)}
            onTagLeave={() => setTooltipInfo(null)}
          />
        );
      })}

      {/* Untagged variables */}
      {groups.untagged.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: "6px 0 2px",
              fontSize: "11px",
              color: T.textDim,
            }}
          >
            <span>{t("label.uncategorized")}</span>
            <span style={{ flex: 1, height: "1px", backgroundColor: T.borderDim }} />
          </div>
          {groups.untagged.map((v) => (
            <VarRow
              key={v.id}
              variable={v}
              tags={[]}
              onEdit={() => onEditVar(v.id)}
              onTagHover={() => {}}
              onTagLeave={() => {}}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Variable Row (byVar view) ────────────────────────
// Left accent bar + variable name : tag chips

function VarRow({
  variable,
  tags,
  onEdit,
  onTagHover,
  onTagLeave,
}: {
  variable: VariableDefinition;
  tags: string[];
  onEdit: () => void;
  onTagHover: (tag: string, el: HTMLElement) => void;
  onTagLeave: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "5px 10px 5px 14px",
        backgroundColor: hovered ? T.bg2 : T.bg1,
        border: "none",
        borderRadius: "2px",
        cursor: "pointer",
        fontSize: "12px",
        textAlign: "left",
        transition: "background-color 0.1s",
      }}
    >
      {/* Left accent bar */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "3px",
          backgroundColor: hovered ? T.accent : T.accentDim,
          borderRadius: "2px 0 0 2px",
          transition: "background-color 0.1s",
        }}
      />
      <span style={{ color: T.text, whiteSpace: "nowrap" }}>{variable.name || variable.id}</span>
      {tags.length > 0 && (
        <>
          <span style={{ color: T.textDim }}>:</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {tags.map((tag) => (
              <span
                key={tag}
                className="vm-tag-chip"
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  onTagHover(tag, e.currentTarget);
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  onTagLeave();
                }}
                style={{
                  padding: "1px 7px",
                  backgroundColor: hovered ? T.bg3 : T.bg2,
                  color: T.textSub,
                  border: `1px solid ${T.border}`,
                  borderRadius: "3px",
                  fontSize: "11px",
                  transition: "background-color 0.15s, border-color 0.15s",
                }}
              >
                {tag}
              </span>
            ))}
          </span>
        </>
      )}
    </button>
  );
}
