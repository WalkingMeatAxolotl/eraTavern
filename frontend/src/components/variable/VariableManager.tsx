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
import { btnClass } from "../shared/buttons";
import sh from "../shared/shared.module.css";
import s from "./VariableManager.module.css";

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
    return <div className={s.loading}>{t("status.loading")}</div>;
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
    <div className={s.wrapper}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={sh.editorTitle}>== {t("header.derivedVars")} ==</span>
          {/* View toggle */}
          <div className={s.viewTabs}>
            <button
              onClick={() => setViewMode("byTag")}
              style={viewTabStyle(viewMode === "byTag")}
            >
              {t("btn.byTagView")}
            </button>
            <button
              onClick={() => setViewMode("byEntity")}
              style={viewTabStyle(viewMode === "byEntity")}
            >
              {t("btn.byVarView")}
            </button>
          </div>
        </div>
        <div className={s.btnRow}>
          {!readOnly && (
            <button onClick={() => setShowJson(true)} className={btnClass("neutral", "md")}>
              [JSON]
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowTagManager((v) => !v)}
              className={btnClass(showTagManager ? "primary" : "neutral", "md")}
            >
              [{t("btn.tagMgmt")}]
            </button>
          )}
          {!readOnly && (
            <button onClick={handleNew} className={btnClass("create", "md")}>
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
          poolLabel={t("var.tagPool")}
          placeholderLabel={t("var.newTagPlaceholder")}
        />
      )}

      {/* Single-direction variables */}
      <SectionDivider label={t("section.uniVars")} margin="8px 0 4px" />
      {singleVars.length === 0 ? (
        <div className={s.emptyMsg}>{t("empty.uniVars")}</div>
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
        <div className={s.emptyMsg}>{t("empty.biVars")}</div>
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
    <div className={s.tagContainer}>
      {tooltipInfo && <Tooltip text={tooltipInfo.text} anchorRef={tooltipInfo.el} />}
      {visibleTags.map((tag) => {
        const tagVars = (tagGrouped[tag] ?? []).filter((v) => !filterFn || filterFn(v));
        if (tagVars.length === 0) return null;
        const isCollapsed = collapsed[`tag:${tag}`] ?? false;
        return (
          <div key={tag} className={s.card}>
            <button
              className={s.catBtn}
              onClick={() => onToggleCollapse(`tag:${tag}`)}
            >
              <span className={s.catArrow}>
                {isCollapsed ? "\u25B6" : "\u25BC"}
              </span>{" "}
              {tag}
              <span className={s.catCount}>({tagVars.length})</span>
            </button>
            {!isCollapsed && (
              <div className={s.cardContent}>
                <div className={s.itemGrid}>
                  {tagVars.map((v) => (
                    <button
                      className={s.item}
                      key={v.id}
                      onClick={() => onEditVar(v.id)}
                      onMouseEnter={(e) => showVarTooltip(v, e.currentTarget)}
                      onMouseLeave={() => setTooltipInfo(null)}
                    >
                      {v.name || v.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Untagged */}
      {untagged.filter((v) => !filterFn || filterFn(v)).length > 0 && (
        <div className={s.card}>
          <button
            className={s.catBtnDim}
            onClick={() => onToggleCollapse("tag:__untagged__")}
          >
            <span className={s.catArrow}>
              {(collapsed["tag:__untagged__"] ?? false) ? "\u25B6" : "\u25BC"}
            </span>{" "}
            {t("label.uncategorized")}
            <span className={s.catCount}>
              ({untagged.filter((v) => !filterFn || filterFn(v)).length})
            </span>
          </button>
          {!(collapsed["tag:__untagged__"] ?? false) && (
            <div className={s.cardContent}>
              <div className={s.itemGrid}>
                {untagged
                  .filter((v) => !filterFn || filterFn(v))
                  .map((v) => (
                    <button
                      className={s.item}
                      key={v.id}
                      onClick={() => onEditVar(v.id)}
                    >
                      {v.name || v.id}
                    </button>
                  ))}
              </div>
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
    <div className={s.itemList}>
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
          <div className={s.uncatHeader}>
            <span>{t("label.uncategorized")}</span>
            <span className={s.uncatLine} />
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
  return (
    <button
      onClick={onEdit}
      className={s.itemRow}
    >
      <span className={s.itemName}>{variable.name || variable.id}</span>
      {tags.length > 0 && (
        <>
          <span className={s.tagSep}>:</span>
          <span className={s.tagChips}>
            {tags.map((tag) => (
              <span
                key={tag}
                className={s.tagChip}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  onTagHover(tag, e.currentTarget);
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  onTagLeave();
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
