import { useState, useCallback, useMemo } from "react";
import type { ItemDefinition } from "../../types/game";
import { fetchItemDefs, fetchItemTags, createItemTag, deleteItemTag } from "../../api/client";
import { t } from "../../i18n/ui";
import ItemEditor from "./ItemEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";
import { Tooltip } from "../shared/Tooltip";
import { RawJsonView } from "../shared/RawJsonEditor";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import { useTagSystem } from "../shared/useTagSystem";
import { TagManagerPanel } from "../shared/TagManagerPanel";
import { btnClass } from "../shared/buttons";
import s from "./ItemManager.module.css";

// ── Main ──────────────────────────────────────────────

export default function ItemManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [items, setItems] = useState<ItemDefinition[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const loadFn = useCallback(async () => {
    const [itemList, tagList] = await Promise.all([fetchItemDefs(), fetchItemTags()]);
    setItems(itemList);
    setAllTags(tagList);
  }, []);

  const { editingId, isNew, loading, showJson, setShowJson, handleEdit, handleNew, handleBack } = useManagerState({
    onEditingChange,
    loadFn,
  });

  const { collapsed, toggle: toggleCollapse } = useCollapsibleGroups();

  const readOnly = isReadOnly(selectedAddon);
  const filteredItems = selectedAddon ? items.filter((i) => i.source === selectedAddon) : items;

  const {
    newTagInput, setNewTagInput, showTagManager, setShowTagManager,
    handleAddTag, handleDeleteTag,
    visibleTags, tagUsage, tagGrouped, untagged, entityTagsMap, tagEntityNames,
    viewMode, setViewMode, viewTabStyle,
  } = useTagSystem({
    filteredItems,
    allTags,
    setAllTags,
    createTagFn: createItemTag,
    deleteTagFn: deleteItemTag,
  });

  if (loading) {
    return <div className={s.loading}>{t("status.loading")}</div>;
  }

  if (showJson && selectedAddon) {
    return <RawJsonView addonId={selectedAddon} filename="items.json" onClose={() => setShowJson(false)} />;
  }

  // Editor view
  if (editingId !== null) {
    const existing = items.find((i) => i.id === editingId);
    const blank: ItemDefinition = {
      id: "",
      name: "",
      tags: [],
      description: "",
      maxStack: 1,
      sellable: true,
      price: 0,
      source: selectedAddon ?? "",
    };
    return (
      <ItemEditor item={isNew ? blank : (existing ?? blank)} isNew={isNew} allTags={allTags} onBack={handleBack} addonIds={addonIds} />
    );
  }

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.title}>== {t("header.itemList")} ==</span>
          {/* View toggle */}
          <div className={s.viewTabs}>
            <button
              onClick={() => setViewMode("byTag")}
              style={viewTabStyle(viewMode === "byTag")}
            >
              {t("btn.byTag")}
            </button>
            <button
              onClick={() => setViewMode("byEntity")}
              style={viewTabStyle(viewMode === "byEntity")}
            >
              {t("btn.byItem")}
            </button>
          </div>
        </div>
        <div className={s.btnRow}>
          {!readOnly && (
            <button className={btnClass("neutral", "md")} onClick={() => setShowJson(true)}>
              [JSON]
            </button>
          )}
          {!readOnly && (
            <button
              className={btnClass(showTagManager ? "primary" : "neutral", "md")}
              onClick={() => setShowTagManager((v) => !v)}
            >
              [{t("btn.tagMgmt")}]
            </button>
          )}
          {!readOnly && (
            <button className={btnClass("create", "md")} onClick={handleNew}>
              [{t("btn.newItem")}]
            </button>
          )}
        </div>
      </div>

      {/* Tag manager (admin) */}
      {showTagManager && (
        <TagManagerPanel
          allTags={allTags}
          tagUsage={tagUsage}
          newTagInput={newTagInput}
          setNewTagInput={setNewTagInput}
          onAddTag={handleAddTag}
          onDeleteTag={handleDeleteTag}
        />
      )}

      {/* View content */}
      {viewMode === "byTag" ? (
        <ByTagView
          visibleTags={visibleTags}
          tagGrouped={tagGrouped}
          untagged={untagged}
          itemTagsMap={entityTagsMap}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditItem={handleEdit}
        />
      ) : (
        <ByItemView
          filteredItems={filteredItems}
          itemTagsMap={entityTagsMap}
          tagItemNames={tagEntityNames}
          onEditItem={handleEdit}
        />
      )}

      {filteredItems.length === 0 && <div className={s.emptyMsg}>{t("empty.items")}</div>}
    </div>
  );
}

// ── By Tag View ───────────────────────────────────────
// Tag groups -> item chips. Hover item -> tooltip shows all its tags.

function ByTagView({
  visibleTags,
  tagGrouped,
  untagged,
  itemTagsMap,
  collapsed,
  onToggleCollapse,
  onEditItem,
}: {
  visibleTags: string[];
  tagGrouped: Record<string, ItemDefinition[]>;
  untagged: ItemDefinition[];
  itemTagsMap: Record<string, string[]>;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (key: string) => void;
  onEditItem: (id: string) => void;
}) {
  const [tooltipInfo, setTooltipInfo] = useState<{ text: string; el: HTMLElement } | null>(null);

  const showItemTooltip = (item: ItemDefinition, el: HTMLElement) => {
    const tags = itemTagsMap[item.id] ?? [];
    if (tags.length > 0) {
      setTooltipInfo({ text: `${t("field.tags")}: ${tags.join(", ")}`, el });
    }
  };

  return (
    <div className={s.tagContainer}>
      {tooltipInfo && <Tooltip text={tooltipInfo.text} anchorRef={tooltipInfo.el} />}
      {visibleTags.map((tag) => {
        const tagItems = tagGrouped[tag] ?? [];
        if (tagItems.length === 0) return null;
        const isCollapsed = collapsed[`tag:${tag}`] ?? false;
        return (
          <div key={tag}>
            <button className={s.catBtn} onClick={() => onToggleCollapse(`tag:${tag}`)}>
              <span className={s.catArrow}>{isCollapsed ? "\u25B6" : "\u25BC"}</span>{" "}
              {tag}
              <span className={s.catCount}>({tagItems.length})</span>
            </button>
            {!isCollapsed && (
              <div className={s.itemGrid}>
                {tagItems.map((item) => (
                  <button
                    className={s.item}
                    key={item.id}
                    onClick={() => onEditItem(item.id)}
                    onMouseEnter={(e) => showItemTooltip(item, e.currentTarget)}
                    onMouseLeave={() => setTooltipInfo(null)}
                  >
                    {item.name || item.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Untagged */}
      {untagged.length > 0 && (
        <div>
          <button className={s.catBtnDim} onClick={() => onToggleCollapse("tag:__untagged__")}>
            <span className={s.catArrow}>
              {(collapsed["tag:__untagged__"] ?? false) ? "\u25B6" : "\u25BC"}
            </span>{" "}
            {t("label.uncategorized")}
            <span className={s.catCount}>({untagged.length})</span>
          </button>
          {!(collapsed["tag:__untagged__"] ?? false) && (
            <div className={s.itemGrid}>
              {untagged.map((item) => (
                <button
                  className={s.item}
                  key={item.id}
                  onClick={() => onEditItem(item.id)}
                >
                  {item.name || item.id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── By Item View ──────────────────────────────────────
// Item rows -> tag chips. Hover tag -> tooltip shows items with that tag.

function ByItemView({
  filteredItems,
  itemTagsMap,
  tagItemNames,
  onEditItem,
}: {
  filteredItems: ItemDefinition[];
  itemTagsMap: Record<string, string[]>;
  tagItemNames: Record<string, string[]>;
  onEditItem: (id: string) => void;
}) {
  const [tooltipInfo, setTooltipInfo] = useState<{ text: string; el: HTMLElement } | null>(null);

  const showTagTooltip = (tag: string, el: HTMLElement) => {
    const names = tagItemNames[tag] ?? [];
    if (names.length > 0) {
      const display = names.length > 8 ? names.slice(0, 8).join(", ") + ` ... (${names.length})` : names.join(", ");
      setTooltipInfo({ text: display, el });
    }
  };

  // Group items alphabetically by first character for structure
  const groups = useMemo(() => {
    const tagged: ItemDefinition[] = [];
    const untagged: ItemDefinition[] = [];
    for (const item of filteredItems) {
      if ((item.tags ?? []).length > 0) tagged.push(item);
      else untagged.push(item);
    }
    return { tagged, untagged };
  }, [filteredItems]);

  return (
    <div className={s.itemList}>
      {tooltipInfo && <Tooltip text={tooltipInfo.text} anchorRef={tooltipInfo.el} />}
      {groups.tagged.map((item) => {
        const tags = itemTagsMap[item.id] ?? [];
        return (
          <ItemRow
            key={item.id}
            item={item}
            tags={tags}
            onEdit={() => onEditItem(item.id)}
            onTagHover={(tag, el) => showTagTooltip(tag, el)}
            onTagLeave={() => setTooltipInfo(null)}
          />
        );
      })}

      {/* Untagged items */}
      {groups.untagged.length > 0 && (
        <>
          <div className={s.uncatHeader}>
            <span>{t("label.uncategorized")}</span>
            <span className={s.uncatLine} />
          </div>
          {groups.untagged.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              tags={[]}
              onEdit={() => onEditItem(item.id)}
              onTagHover={() => {}}
              onTagLeave={() => {}}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Item Row (byItem view) ────────────────────────────
// Left accent bar + item name : tag chips

function ItemRow({
  item,
  tags,
  onEdit,
  onTagHover,
  onTagLeave,
}: {
  item: ItemDefinition;
  tags: string[];
  onEdit: () => void;
  onTagHover: (tag: string, el: HTMLElement) => void;
  onTagLeave: () => void;
}) {
  return (
    <button className={s.itemRow} onClick={onEdit}>
      {/* Left accent bar */}
      <span className={s.accentBar} />
      <span className={s.itemName}>{item.name || item.id}</span>
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
