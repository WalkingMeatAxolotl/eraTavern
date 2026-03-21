import T from "../../theme";
import { useState, useCallback, useMemo } from "react";
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
import { RawJsonView } from "../shared/RawJsonEditor";
import { SectionDivider } from "../shared/SectionDivider";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import { useTagSystem } from "../shared/useTagSystem";
import { TagManagerPanel } from "../shared/TagManagerPanel";
import { createHoverStyles, btn } from "../shared/styles";

const hoverStyles = createHoverStyles("vm", [
  ["cat-btn", "color"],
  ["item", "border"],
  ["tag-chip", "border"],
  ["action-btn", "border"],
  ["view-tab", "simple"],
]);

// ── Main ──────────────────────────────────────────────

export default function VariableManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [variables, setVariables] = useState<VariableDefinition[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);

  const loadFn = useCallback(async () => {
    const [varList, tagList, defs] = await Promise.all([fetchVariableDefs(), fetchVariableTags(), fetchDefinitions()]);
    setVariables(varList);
    setAllTags(tagList);
    setDefinitions(defs);
  }, []);

  const { editingId, isNew, loading, showJson, setShowJson, handleEdit, handleNew, handleBack } = useManagerState({
    onEditingChange,
    loadFn,
  });

  const { collapsed, toggle: toggleCollapse } = useCollapsibleGroups();

  const readOnly = isReadOnly(selectedAddon);
  const addonFiltered = selectedAddon ? variables.filter((v) => v.source === selectedAddon) : variables;

  const singleVars = addonFiltered.filter((v) => !v.isBidirectional);
  const biVars = addonFiltered.filter((v) => v.isBidirectional);
  const filteredVars = addonFiltered;

  const {
    newTagInput, setNewTagInput, showTagManager, setShowTagManager,
    handleAddTag, handleDeleteTag,
    visibleTags, tagUsage, tagGrouped, untagged, entityTagsMap, tagEntityNames,
    viewMode, setViewMode, viewTabStyle,
  } = useTagSystem({
    filteredItems: filteredVars,
    allTags,
    setAllTags,
    createTagFn: createVariableTag,
    deleteTagFn: deleteVariableTag,
  });

  if (loading) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
  }

  if (showJson && selectedAddon) {
    return <RawJsonView addonId={selectedAddon} filename="variables.json" onClose={() => setShowJson(false)} />;
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
        addonIds={addonIds}
      />
    );
  }

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
              onClick={() => setViewMode("byEntity")}
              style={viewTabStyle(viewMode === "byEntity")}
            >
              {t("btn.byVarView")}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!readOnly && (
            <button className="vm-action-btn" onClick={() => setShowJson(true)} style={btn("neutral", "md")}>
              [JSON]
            </button>
          )}
          {!readOnly && (
            <button
              className="vm-action-btn"
              onClick={() => setShowTagManager((v) => !v)}
              style={btn(showTagManager ? "primary" : "neutral", "md")}
            >
              [{t("btn.tagMgmt")}]
            </button>
          )}
          {!readOnly && (
            <button className="vm-action-btn" onClick={handleNew} style={btn("create", "md")}>
              [{t("btn.newVar")}]
            </button>
          )}
        </div>
      </div>

      {/* Tag manager */}
      {showTagManager && (
        <TagManagerPanel
          allTags={allTags}
          tagUsage={tagUsage}
          newTagInput={newTagInput}
          setNewTagInput={setNewTagInput}
          onAddTag={handleAddTag}
          onDeleteTag={handleDeleteTag}
          btnClassName="vm-action-btn"
          poolLabel={t("var.tagPool")}
          placeholderLabel={t("var.newTagPlaceholder")}
        />
      )}

      {/* Single-direction variables */}
      <SectionDivider label={t("section.uniVars")} margin="8px 0 4px" />
      {singleVars.length === 0 ? (
        <div style={{ color: T.textDim, fontSize: "12px", padding: "4px 0" }}>{t("empty.uniVars")}</div>
      ) : viewMode === "byTag" ? (
        <ByTagView
          visibleTags={visibleTags}
          tagGrouped={tagGrouped}
          untagged={untagged}
          varTagsMap={entityTagsMap}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditVar={handleEdit}
          filterFn={(v) => !v.isBidirectional}
        />
      ) : (
        <ByVarView filteredVars={singleVars} varTagsMap={entityTagsMap} tagVarNames={tagEntityNames} onEditVar={handleEdit} />
      )}

      {/* Bidirectional variables */}
      <SectionDivider label={t("section.biVars")} margin="12px 0 4px" />
      {biVars.length === 0 ? (
        <div style={{ color: T.textDim, fontSize: "12px", padding: "4px 0" }}>{t("empty.biVars")}</div>
      ) : viewMode === "byTag" ? (
        <ByTagView
          visibleTags={visibleTags}
          tagGrouped={tagGrouped}
          untagged={untagged}
          varTagsMap={entityTagsMap}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditVar={handleEdit}
          filterFn={(v) => !!v.isBidirectional}
        />
      ) : (
        <ByVarView filteredVars={biVars} varTagsMap={entityTagsMap} tagVarNames={tagEntityNames} onEditVar={handleEdit} />
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
