import T from "../theme";
import { useEffect, useState, useCallback, useMemo } from "react";
import type { ItemDefinition } from "../types/game";
import { fetchItemDefs, fetchItemTags, createItemTag, deleteItemTag } from "../api/client";
import ItemEditor from "./ItemEditor";

const hoverStyles = `
  .im-item:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .im-tag-chip:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .im-action-btn:hover { background-color: ${T.bg3} !important; border-color: ${T.borderLight} !important; }
  .im-cat-btn:hover { background-color: ${T.bg3} !important; color: ${T.text} !important; }
  .im-view-tab:hover { background-color: ${T.bg3} !important; }
`;

type ViewMode = "byTag" | "byItem";

// ── Tooltip ───────────────────────────────────────────

function Tooltip({ text, anchorRef }: { text: string; anchorRef: HTMLElement | null }) {
  if (!anchorRef || !text) return null;
  const rect = anchorRef.getBoundingClientRect();
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.top - 4,
        transform: "translate(-50%, -100%)",
        padding: "4px 10px",
        backgroundColor: T.bg3,
        color: T.text,
        border: `1px solid ${T.borderLight}`,
        borderRadius: "3px",
        fontSize: "11px",
        whiteSpace: "nowrap",
        maxWidth: "320px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {text}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────

export default function ItemManager({
  selectedAddon,
  onEditingChange,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [items, setItems] = useState<ItemDefinition[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    onEditingChange?.(editingId !== null);
  }, [editingId, onEditingChange]);
  const [viewMode, setViewMode] = useState<ViewMode>("byTag");
  const [newTagInput, setNewTagInput] = useState("");
  const [showTagManager, setShowTagManager] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [itemList, tagList] = await Promise.all([fetchItemDefs(), fetchItemTags()]);
    setItems(itemList);
    setAllTags(tagList);
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

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddTag = async () => {
    const t = newTagInput.trim();
    if (!t) return;
    const result = await createItemTag(t);
    if (result.success) {
      setAllTags((prev) => [...prev, t]);
      setNewTagInput("");
    }
  };

  const handleDeleteTag = async (tag: string) => {
    const result = await deleteItemTag(tag);
    if (result.success) {
      setAllTags((prev) => prev.filter((t) => t !== tag));
    }
  };

  const readOnly = selectedAddon === null;
  const filteredItems = selectedAddon ? items.filter((i) => i.source === selectedAddon) : items;

  // Auto-collect tags from items
  const visibleTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of filteredItems) {
      for (const t of item.tags ?? []) tagSet.add(t);
    }
    const poolSet = new Set(allTags);
    const fromPool = allTags.filter((t) => tagSet.has(t));
    const extra = [...tagSet].filter((t) => !poolSet.has(t)).sort();
    return [...fromPool, ...extra];
  }, [filteredItems, allTags]);

  // Tag usage count
  const tagUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const item of filteredItems) {
      for (const t of item.tags ?? []) usage[t] = (usage[t] || 0) + 1;
    }
    return usage;
  }, [filteredItems]);

  // Group: tag → items (many-to-many)
  const { tagGrouped, untagged } = useMemo(() => {
    const g: Record<string, ItemDefinition[]> = {};
    const noTag: ItemDefinition[] = [];
    for (const item of filteredItems) {
      const itemTags = item.tags ?? [];
      if (itemTags.length === 0) {
        noTag.push(item);
        continue;
      }
      for (const t of itemTags) {
        if (!g[t]) g[t] = [];
        g[t].push(item);
      }
    }
    return { tagGrouped: g, untagged: noTag };
  }, [filteredItems]);

  // Reverse: item → tags (for byItem view tooltip)
  const itemTagsMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const item of filteredItems) {
      m[item.id] = item.tags ?? [];
    }
    return m;
  }, [filteredItems]);

  // Reverse: tag → item names (for byItem view tooltip)
  const tagItemNames = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const tag of visibleTags) {
      m[tag] = (tagGrouped[tag] ?? []).map((i) => i.name || i.id);
    }
    return m;
  }, [visibleTags, tagGrouped]);

  if (loading) {
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>加载中...</div>;
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
      <ItemEditor item={isNew ? blank : (existing ?? blank)} isNew={isNew} allTags={allTags} onBack={handleBack} />
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
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== 物品列表 ==</span>
          {/* View toggle */}
          <div style={{ display: "flex", gap: "2px" }}>
            <button
              className="im-view-tab"
              onClick={() => setViewMode("byTag")}
              style={viewTabStyle(viewMode === "byTag")}
            >
              按标签
            </button>
            <button
              className="im-view-tab"
              onClick={() => setViewMode("byItem")}
              style={viewTabStyle(viewMode === "byItem")}
            >
              按物品
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!readOnly && (
            <button
              className="im-action-btn"
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
              [标签管理]
            </button>
          )}
          {!readOnly && (
            <button
              className="im-action-btn"
              onClick={handleNew}
              style={{
                padding: "4px 12px",
                backgroundColor: T.bg2,
                color: T.successDim,
                border: `1px solid ${T.border}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "13px",
                transition: "background-color 0.1s, border-color 0.1s",
              }}
            >
              [+ 新建物品]
            </button>
          )}
        </div>
      </div>

      {/* Tag manager (admin) */}
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
          <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "6px" }}>标签池</div>
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
            {allTags.length === 0 && <span style={{ color: T.textDim }}>无标签</span>}
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
              placeholder="新标签名..."
            />
            <button
              className="im-action-btn"
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

      {/* View content */}
      {viewMode === "byTag" ? (
        <ByTagView
          visibleTags={visibleTags}
          tagGrouped={tagGrouped}
          untagged={untagged}
          itemTagsMap={itemTagsMap}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditItem={handleEdit}
        />
      ) : (
        <ByItemView
          filteredItems={filteredItems}
          visibleTags={visibleTags}
          itemTagsMap={itemTagsMap}
          tagItemNames={tagItemNames}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onEditItem={handleEdit}
        />
      )}

      {filteredItems.length === 0 && <div style={{ color: T.textDim, padding: "8px" }}>暂无物品</div>}
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
      setTooltipInfo({ text: `标签: ${tags.join(", ")}`, el });
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
            未分类
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
      const display = names.length > 8 ? names.slice(0, 8).join(", ") + ` ... 共${names.length}个` : names.join(", ");
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
            <span>未分类</span>
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
