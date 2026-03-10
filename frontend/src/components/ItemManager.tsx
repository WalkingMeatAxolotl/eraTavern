import { useEffect, useState, useCallback, useMemo } from "react";
import type { ItemDefinition } from "../types/game";
import { fetchItemDefs, fetchItemTags, createItemTag, deleteItemTag } from "../api/client";
import ItemEditor from "./ItemEditor";

export default function ItemManager() {
  const [items, setItems] = useState<ItemDefinition[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newTagInput, setNewTagInput] = useState("");
  const [showTagManager, setShowTagManager] = useState(false);

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

  // Group items by first tag (or "未分类")
  const { tagOrder, grouped } = useMemo(() => {
    const g: Record<string, ItemDefinition[]> = {};
    const order: string[] = [];
    for (const item of items) {
      const tag = (item.tags && item.tags[0]) ?? "__untagged__";
      if (!g[tag]) {
        g[tag] = [];
        order.push(tag);
      }
      g[tag].push(item);
    }
    return { tagOrder: order, grouped: g };
  }, [items]);

  // Count how many items use each tag (for delete safety hint)
  const tagUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const item of items) {
      for (const t of (item.tags ?? [])) {
        usage[t] = (usage[t] || 0) + 1;
      }
    }
    return usage;
  }, [items]);

  if (loading) {
    return (
      <div style={{ color: "#666", fontFamily: "monospace", padding: "20px", textAlign: "center" }}>
        加载中...
      </div>
    );
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
      source: "game",
    };

    return (
      <ItemEditor
        item={isNew ? blank : (existing ?? blank)}
        isNew={isNew}
        allTags={allTags}
        onBack={handleBack}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ddd",
        padding: "12px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: "#e94560", fontWeight: "bold", fontSize: "14px" }}>
          == 物品列表 ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => setShowTagManager((v) => !v)}
            style={{
              padding: "4px 12px",
              backgroundColor: "#16213e",
              color: showTagManager ? "#e94560" : "#888",
              border: "1px solid #333",
              borderRadius: "3px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "13px",
            }}
          >
            [标签管理]
          </button>
          <button
            onClick={handleNew}
            style={{
              padding: "4px 12px",
              backgroundColor: "#16213e",
              color: "#0f0",
              border: "1px solid #333",
              borderRadius: "3px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "13px",
            }}
          >
            [+ 新建物品]
          </button>
        </div>
      </div>

      {/* Tag manager */}
      {showTagManager && (
        <div style={{
          marginBottom: "12px",
          padding: "8px",
          backgroundColor: "#0a0a1a",
          border: "1px solid #333",
          borderRadius: "3px",
        }}>
          <div style={{ color: "#888", fontSize: "11px", marginBottom: "6px" }}>标签池</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
            {allTags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  backgroundColor: "#1a1a2e",
                  border: "1px solid #444",
                  borderRadius: "3px",
                  fontSize: "12px",
                }}
              >
                {tag}
                <span style={{ color: "#666", fontSize: "10px" }}>({tagUsage[tag] || 0})</span>
                <button
                  onClick={() => handleDeleteTag(tag)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#e94560",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              </span>
            ))}
            {allTags.length === 0 && <span style={{ color: "#666" }}>无标签</span>}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              style={{
                flex: 1,
                padding: "4px 8px",
                backgroundColor: "#0a0a1a",
                color: "#ddd",
                border: "1px solid #333",
                borderRadius: "3px",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
              }}
              placeholder="新标签名..."
            />
            <button
              onClick={handleAddTag}
              style={{
                padding: "4px 10px",
                backgroundColor: "#16213e",
                color: "#0f0",
                border: "1px solid #333",
                borderRadius: "3px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            >
              [+]
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {tagOrder.map((tag) => {
          const tagItems = grouped[tag] || [];
          const isCollapsed = collapsed[tag] ?? false;
          const displayTag = tag === "__untagged__" ? "未分类" : tag;
          return (
            <div key={tag}>
              <button
                onClick={() => toggleCollapse(tag)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 12px",
                  backgroundColor: "#16213e",
                  color: "#aaa",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  borderRadius: "3px",
                }}
              >
                {isCollapsed ? "\u25B6" : "\u25BC"} {displayTag} ({tagItems.length})
              </button>
              {!isCollapsed && tagItems.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                  {tagItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleEdit(item.id)}
                      style={{
                        position: "relative",
                        padding: "4px 10px",
                        backgroundColor: "#1a1a2e",
                        color: "#ddd",
                        border: "1px solid #333",
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontFamily: "monospace",
                        fontSize: "12px",
                      }}
                    >
                      {item.name || item.id}
                      {item.source && (
                        <span style={{ color: "#888", fontSize: "11px" }}> [{item.source}]</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ color: "#666", padding: "8px" }}>暂无物品</div>
        )}
      </div>
    </div>
  );
}
