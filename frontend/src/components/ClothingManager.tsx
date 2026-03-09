import { useEffect, useState, useCallback } from "react";
import type { GameDefinitions, ClothingDefinition } from "../types/game";
import { fetchDefinitions, fetchClothingDefs } from "../api/client";
import ClothingEditor from "./ClothingEditor";

const SLOT_LABELS: Record<string, string> = {
  hat: "帽子",
  upperBody: "上半身",
  upperUnderwear: "上半身内衣",
  lowerBody: "下半身",
  lowerUnderwear: "下半身内衣",
  hands: "手",
  feet: "脚",
  shoes: "鞋子",
  accessory: "装饰品",
  accessory1: "装饰品1",
  accessory2: "装饰品2",
  accessory3: "装饰品3",
};

export default function ClothingManager() {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [clothing, setClothing] = useState<ClothingDefinition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    const [defs, clothingList] = await Promise.all([
      fetchDefinitions(),
      fetchClothingDefs(),
    ]);
    setDefinitions(defs);
    setClothing(clothingList);
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

  if (!definitions) {
    return (
      <div style={{ color: "#666", fontFamily: "monospace", padding: "20px", textAlign: "center" }}>
        加载中...
      </div>
    );
  }

  // Editor view
  if (editingId !== null) {
    const existing = clothing.find((c) => c.id === editingId);
    const blank: ClothingDefinition = {
      id: "",
      name: "",
      slot: definitions.template.clothingSlots[0] ?? "",
      occlusion: [],
      effects: [],
      source: "game",
    };

    return (
      <ClothingEditor
        clothing={isNew ? blank : (existing ?? blank)}
        definitions={definitions}
        isNew={isNew}
        onBack={handleBack}
      />
    );
  }

  // Group clothing by slot — deduplicate accessory1/2/3 into "accessory"
  const rawSlots = definitions.template.clothingSlots;
  const slots = [...new Set(rawSlots.map((s) =>
    s.startsWith("accessory") ? "accessory" : s
  ))];
  const grouped: Record<string, ClothingDefinition[]> = {};
  for (const s of slots) {
    grouped[s] = [];
  }
  for (const c of clothing) {
    const key = c.slot.startsWith("accessory") ? "accessory" : c.slot;
    if (grouped[key]) {
      grouped[key].push(c);
    } else {
      if (!grouped["__other__"]) grouped["__other__"] = [];
      grouped["__other__"].push(c);
    }
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
          == 服装列表 ==
        </span>
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
          [+ 新建服装]
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {slots.map((slotKey) => {
          const items = grouped[slotKey] || [];
          const isCollapsed = collapsed[slotKey] ?? false;
          return (
            <div key={slotKey}>
              <button
                onClick={() => toggleCollapse(slotKey)}
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
                {isCollapsed ? "\u25B6" : "\u25BC"} {SLOT_LABELS[slotKey] ?? slotKey} ({items.length})
              </button>
              {!isCollapsed && items.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                  {items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleEdit(c.id)}
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
                      {c.name || c.id}
                      {c.source === "builtin" && (
                        <span
                          style={{
                            position: "absolute",
                            top: "-2px",
                            right: "-2px",
                            fontSize: "8px",
                            color: "#888",
                          }}
                          title="内置服装"
                        >
                          &#x1F512;
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Uncategorized */}
        {grouped["__other__"] && grouped["__other__"].length > 0 && (
          <div>
            <button
              onClick={() => toggleCollapse("__other__")}
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
              {collapsed["__other__"] ? "\u25B6" : "\u25BC"} 未分类 ({grouped["__other__"].length})
            </button>
            {!collapsed["__other__"] && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                {grouped["__other__"].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleEdit(c.id)}
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
                    {c.name || c.id}
                    {c.source === "builtin" && (
                      <span
                        style={{
                          position: "absolute",
                          top: "-2px",
                          right: "-2px",
                          fontSize: "8px",
                          color: "#888",
                        }}
                        title="内置服装"
                      >
                        &#x1F512;
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
