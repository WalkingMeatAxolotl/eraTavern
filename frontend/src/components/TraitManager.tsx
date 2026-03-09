import { useEffect, useState, useCallback } from "react";
import type { GameDefinitions, TraitDefinition, TraitGroup } from "../types/game";
import { fetchDefinitions, fetchTraitDefs, fetchTraitGroups } from "../api/client";
import TraitEditor from "./TraitEditor";
import TraitGroupEditor from "./TraitGroupEditor";

export default function TraitManager() {
  const [definitions, setDefinitions] = useState<GameDefinitions | null>(null);
  const [traits, setTraits] = useState<TraitDefinition[]>([]);
  const [traitGroups, setTraitGroups] = useState<TraitGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
      <div style={{ color: "#666", fontFamily: "monospace", padding: "20px", textAlign: "center" }}>
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
      source: "game",
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
      source: "game",
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

  // Build traitId -> groupName lookup + groups by category
  const traitGroupName: Record<string, string> = {};
  const groupsByCategory: Record<string, TraitGroup[]> = {};
  for (const g of traitGroups) {
    for (const tid of g.traits) {
      traitGroupName[tid] = g.name;
    }
    if (!groupsByCategory[g.category]) groupsByCategory[g.category] = [];
    groupsByCategory[g.category].push(g);
  }

  // Group traits by category
  const categories = definitions.template.traits;
  const grouped: Record<string, TraitDefinition[]> = {};
  for (const cat of categories) {
    grouped[cat.key] = [];
  }
  // Add an "uncategorized" bucket
  for (const t of traits) {
    if (grouped[t.category]) {
      grouped[t.category].push(t);
    } else {
      if (!grouped["__other__"]) grouped["__other__"] = [];
      grouped["__other__"].push(t);
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
          == 特质列表 ==
        </span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={handleNewGroup}
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
            [+ 新建特质组]
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
            [+ 新建特质]
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {categories.map((cat) => {
          const items = grouped[cat.key] || [];
          const isCollapsed = collapsed[cat.key] ?? false;
          return (
            <div key={cat.key}>
              <button
                onClick={() => toggleCollapse(cat.key)}
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
                {isCollapsed ? "\u25B6" : "\u25BC"} {cat.label} ({items.length}{(groupsByCategory[cat.key]?.length ?? 0) > 0 ? ` + ${groupsByCategory[cat.key].length}组` : ""})
              </button>
              {!isCollapsed && (
                <div style={{ padding: "6px 8px" }}>
                  {/* Trait groups in this category */}
                  {(groupsByCategory[cat.key] ?? []).map((g) => {
                    const memberNames = g.traits.map((tid) => definitions.traitDefs[tid]?.name ?? tid);
                    return (
                      <button
                        key={`group-${g.id}`}
                        onClick={() => handleEditGroup(g.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          width: "100%",
                          padding: "4px 10px",
                          marginBottom: "4px",
                          backgroundColor: "#1a1a2e",
                          color: "#ddd",
                          border: "1px dashed #555",
                          borderRadius: "3px",
                          cursor: "pointer",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ color: "#e94560" }}>{g.name}</span>
                        <span style={{ color: "#888" }}>: {memberNames.join(" | ")}</span>
                        {g.source === "builtin" && (
                          <span style={{ fontSize: "8px", color: "#888", marginLeft: "auto" }} title="内置">
                            &#x1F512;
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* Individual traits */}
                  {items.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {items.map((t) => {
                        const gName = traitGroupName[t.id];
                        const isAbility = t.category === "ability";
                        const gradeLabel = isAbility ? (() => {
                          const grades = ["G", "F", "E", "D", "C", "B", "A", "S"];
                          const v = t.defaultValue ?? 0;
                          return grades[Math.max(0, Math.min(Math.floor(v / 1000), grades.length - 1))];
                        })() : null;
                        return (
                          <button
                            key={t.id}
                            onClick={() => handleEdit(t.id)}
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
                            {gName ? <><span style={{ color: "#888" }}>{gName} - </span>{t.name || t.id}</> : (t.name || t.id)}
                            {isAbility && (
                              <span style={{ color: "#888", marginLeft: "4px" }}>
                                [{gradeLabel}]
                                {t.decay && <span style={{ color: "#e89a19", marginLeft: "2px" }} title="有回落">&#x21E3;</span>}
                              </span>
                            )}
                            {t.source === "builtin" && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: "-2px",
                                  right: "-2px",
                                  fontSize: "8px",
                                  color: "#888",
                                }}
                                title="内置特质"
                              >
                                &#x1F512;
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                {grouped["__other__"].map((t) => {
                  const gName = traitGroupName[t.id];
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleEdit(t.id)}
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
                      {gName ? <><span style={{ color: "#888" }}>{gName} - </span>{t.name || t.id}</> : (t.name || t.id)}
                      {t.source === "builtin" && (
                        <span
                          style={{
                            position: "absolute",
                            top: "-2px",
                            right: "-2px",
                            fontSize: "8px",
                            color: "#888",
                          }}
                          title="内置特质"
                        >
                          &#x1F512;
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
