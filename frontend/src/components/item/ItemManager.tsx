import T from "../../theme";
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
import { createHoverStyles, btn } from "../shared/styles";

const hoverStyles = createHoverStyles("im", [
  ["item", "border"],
  ["tag-chip", "border"],
  ["action-btn", "border"],
  ["cat-btn", "color"],
  ["view-tab", "simple"],
]);

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
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
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
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <style>{hoverStyles}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.itemList")} ==</span>
          {/* View toggle */}
          <div style={{ display: "flex", gap: "2px" }}>
            <button
              className="im-view-tab"
              onClick={() => setViewMode("byTag")}
              style={viewTabStyle(viewMode === "byTag")}
            >
              {t("btn.byTag")}
            </button>
            <button
              className="im-view-tab"
              onClick={() => setViewMode("byEntity")}
              style={viewTabStyle(viewMode === "byEntity")}
            >
              {t("btn.byItem")}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!readOnly && (
            <button className="im-action-btn" onClick={() => setShowJson(true)} style={btn("neutral", "md")}>
              [JSON]
            </button>
          )}
          {!readOnly && (
            <button
              className="im-action-btn"
              onClick={() => setShowTagManager((v) => !v)}
              style={btn(showTagManager ? "primary" : "neutral", "md")}
            >
              [{t("btn.tagMgmt")}]
            </button>
          )}
          {!readOnly && (
            <button className="im-action-btn" onClick={handleNew} style={btn("create", "md")}>
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
          btnClassName="im-action-btn"
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

      {filteredItems.length === 0 && <div style={{ color: T.textDim, padding: "8px" }}>{t("empty.items")}</div>}

    </div>
  );
}

// ── By Tag View ───────────────────────────────────────
// Tag groups → item chips. Hover item → tooltip shows all its tags.

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
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {tooltipInfo && <Tooltip text={tooltipInfo.text} anchorRef={tooltipInfo.el} />}
      {visibleTags.map((tag) => {
        const tagItems = tagGrouped[tag] ?? [];
        if (tagItems.length === 0) return null;
        const isCollapsed = collapsed[`tag:${tag}`] ?? false;
        return (
          <div key={tag}>
            <button
              className="im-cat-btn"
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
              <span style={{ color: T.textDim, marginLeft: "4px", fontSize: "11px" }}>({tagItems.length})</span>
            </button>
            {!isCollapsed && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "6px 8px" }}>
                {tagItems.map((item) => (
                  <button
                    className="im-item"
                    key={item.id}
                    onClick={() => onEditItem(item.id)}
                    onMouseEnter={(e) => showItemTooltip(item, e.currentTarget)}
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
          <button
            className="im-cat-btn"
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
            <span style={{ color: T.textDim, marginLeft: "4px", fontSize: "11px" }}>({untagged.length})</span>
          </button>
          {!(collapsed["tag:__untagged__"] ?? false) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "6px 8px" }}>
              {untagged.map((item) => (
                <button
                  className="im-item"
                  key={item.id}
                  onClick={() => onEditItem(item.id)}
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
// Item rows → tag chips. Hover tag → tooltip shows items with that tag.

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
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
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
// Left accent bar + item name : tag chips — like TraitManager GroupRow

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
      <span style={{ color: T.text, whiteSpace: "nowrap" }}>{item.name || item.id}</span>
      {tags.length > 0 && (
        <>
          <span style={{ color: T.textDim }}>:</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {tags.map((tag) => (
              <span
                key={tag}
                className="im-tag-chip"
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
