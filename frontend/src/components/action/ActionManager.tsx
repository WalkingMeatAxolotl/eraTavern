import T from "../../theme";
import { useState, useCallback, useMemo } from "react";
import type { ActionDefinition, GameDefinitions } from "../../types/game";
import { fetchActionDefs, fetchDefinitions } from "../../api/client";
import { t } from "../../i18n/ui";
import ActionEditor from "./ActionEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";
import { RawJsonView } from "../shared/RawJsonEditor";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import { createHoverStyles, btn } from "../shared/styles";

const hoverStyles = createHoverStyles("am", [
  ["cat-btn", "color"],
  ["item", "border"],
  ["action-btn", "border"],
]);

export default function ActionManager({
  selectedAddon,
  onEditingChange,
  addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  const [actions, setActions] = useState<ActionDefinition[]>([]);
  const [defs, setDefs] = useState<GameDefinitions | null>(null);

  const loadFn = useCallback(async () => {
    const [actionList, definitions] = await Promise.all([fetchActionDefs(), fetchDefinitions()]);
    setActions(actionList);
    setDefs(definitions);
  }, []);

  const { editingId, isNew, loading, showJson, setShowJson, handleEdit, handleNew, handleBack } = useManagerState({
    onEditingChange,
    loadFn,
  });

  const { isCollapsed, toggle } = useCollapsibleGroups();

  const readOnly = isReadOnly(selectedAddon);
  const filteredActions = selectedAddon ? actions.filter((a) => a.source === selectedAddon) : actions;

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
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
  }

  if (showJson && selectedAddon) {
    return <RawJsonView addonId={selectedAddon} filename="actions.json" onClose={() => setShowJson(false)} />;
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
      <ActionEditor action={isNew ? blank : (existing ?? blank)} isNew={isNew} definitions={defs} onBack={handleBack} addonIds={addonIds} />
    );
  }

  return (
    <div
      style={{
        fontSize: "13px",
        color: T.text,
        padding: "12px 0",
      }}
    >
      <style>{hoverStyles}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== {t("header.actionList")} ==</span>
        {!readOnly && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="am-action-btn" onClick={() => setShowJson(true)} style={btn("neutral", "md")}>
              [JSON]
            </button>
            <button className="am-action-btn" onClick={handleNew} style={btn("create", "md")}>
              [{t("btn.newAction")}]
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {catOrder.map((cat) => {
          const catActions = grouped[cat] || [];
          const catCollapsed = isCollapsed(cat);
          const displayCat = cat === "__uncategorized__" ? t("label.uncategorized") : cat;
          return (
            <div key={cat}>
              <button
                className="am-cat-btn"
                onClick={() => toggle(cat)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 12px",
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
                  {catCollapsed ? "\u25B6" : "\u25BC"}
                </span>{" "}
                {displayCat} ({catActions.length})
              </button>
              {!catCollapsed && catActions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", padding: "6px 8px" }}>
                  {catActions.map((action) => (
                    <button
                      className="am-item"
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
                        fontSize: "12px",
                        transition: "background-color 0.15s, border-color 0.15s",
                      }}
                    >
                      {action.name || action.id}
                      {action.source && <span style={{ color: T.textSub, fontSize: "11px" }}> [{action.source}]</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {actions.length === 0 && <div style={{ color: T.textDim, padding: "8px" }}>{t("empty.actions")}</div>}
      </div>

    </div>
  );
}
