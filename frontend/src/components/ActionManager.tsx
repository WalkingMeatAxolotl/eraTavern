import T from "../theme";
import { useEffect, useState, useCallback, useMemo } from "react";
import type { ActionDefinition, GameDefinitions } from "../types/game";
import { fetchActionDefs, fetchDefinitions } from "../api/client";
import ActionEditor from "./ActionEditor";

export default function ActionManager({ selectedAddon }: { selectedAddon: string | null }) {
  const [actions, setActions] = useState<ActionDefinition[]>([]);
  const [defs, setDefs] = useState<GameDefinitions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [actionList, definitions] = await Promise.all([fetchActionDefs(), fetchDefinitions()]);
    setActions(actionList);
    setDefs(definitions);
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

  const readOnly = selectedAddon === null;
  const filteredActions = selectedAddon ? actions.filter(a => a.source === selectedAddon) : actions;

  // Group actions by category
  const { catOrder, grouped } = useMemo(() => {
    const g: Record<string, ActionDefinition[]> = {};
    const order: string[] = [];
    for (const action of filteredActions) {
      const cat = action.category || "__uncategorized__";
      if (!g[cat]) {
        g[cat] = [];
        order.push(cat);
      }
      g[cat].push(action);
    }
    return { catOrder: order, grouped: g };
  }, [filteredActions]);

  if (loading || !defs) {
    return (
      <div style={{ color: T.textDim, fontFamily: "monospace", padding: "20px", textAlign: "center" }}>
        加载中...
      </div>
    );
  }

  // Editor view
  if (editingId !== null) {
    const existing = actions.find((a) => a.id === editingId);
    const blank: ActionDefinition = {
      id: "",
      name: "",
      category: "",
      targetType: "none",
      triggerLLM: false,
      timeCost: 10,
      conditions: [],
      costs: [],
      outcomes: [],
      outputTemplate: "",
      source: selectedAddon ?? "",
    };

    return (
      <ActionEditor
        action={isNew ? blank : (existing ?? blank)}
        isNew={isNew}
        definitions={defs}
        onBack={handleBack}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: T.text,
        padding: "12px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == 行动列表 ==
        </span>
        {!readOnly && (
          <button
            onClick={handleNew}
            style={{
              padding: "4px 12px",
              backgroundColor: T.bg2,
              color: T.successDim,
              border: `1px solid ${T.border}`,
              borderRadius: "3px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "13px",
            }}
          >
            [+ 新建行动]
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {catOrder.map((cat) => {
          const catActions = grouped[cat] || [];
          const isCollapsed = collapsed[cat] ?? false;
          const displayCat = cat === "__uncategorized__" ? "未分类" : cat;
          return (
            <div key={cat}>
              <button
                onClick={() => toggleCollapse(cat)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 12px",
                  backgroundColor: T.bg2,
                  color: T.textSub,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  borderRadius: "3px",
                }}
              >
                {isCollapsed ? "\u25B6" : "\u25BC"} {displayCat} ({catActions.length})
              </button>
              {!isCollapsed && catActions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                  {catActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleEdit(action.id)}
                      style={{
                        position: "relative",
                        padding: "4px 10px",
                        backgroundColor: T.bg1,
                        color: T.text,
                        border: `1px solid ${T.border}`,
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontFamily: "monospace",
                        fontSize: "12px",
                      }}
                    >
                      {action.name || action.id}
                      {action.source && (
                        <span style={{ color: T.textSub, fontSize: "11px" }}> [{action.source}]</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {actions.length === 0 && (
          <div style={{ color: T.textDim, padding: "8px" }}>暂无行动</div>
        )}
      </div>
    </div>
  );
}
