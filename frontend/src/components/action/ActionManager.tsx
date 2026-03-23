import { useState, useCallback, useMemo } from "react";
import type { ActionDefinition, GameDefinitions } from "../../types/game";
import { fetchActionDefs, fetchDefinitions } from "../../api/client";
import { t } from "../../i18n/ui";
import ActionEditor from "./ActionEditor";
import { useCollapsibleGroups } from "../shared/useCollapsibleGroups";
import { RawJsonView } from "../shared/RawJsonEditor";
import { useManagerState, isReadOnly } from "../shared/useManagerState";
import { btnClass } from "../shared/buttons";
import s from "./ActionManager.module.css";

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
    return <div className={s.loading}>{t("status.loading")}</div>;
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
    <div className={s.wrapper}>
      <div className={s.header}>
        <span className={s.title}>== {t("header.actionList")} ==</span>
        {!readOnly && (
          <div className={s.btnRow}>
            <button className={btnClass("neutral", "md")} onClick={() => setShowJson(true)}>
              [JSON]
            </button>
            <button className={btnClass("create", "md")} onClick={handleNew}>
              [{t("btn.newAction")}]
            </button>
          </div>
        )}
      </div>

      <div className={s.catContainer}>
        {catOrder.map((cat) => {
          const catActions = grouped[cat] || [];
          const catCollapsed = isCollapsed(cat);
          const displayCat = cat === "__uncategorized__" ? t("label.uncategorized") : cat;
          return (
            <div key={cat}>
              <button
                className={s.catBtn}
                onClick={() => toggle(cat)}
              >
                <span className={s.catArrow}>
                  {catCollapsed ? "\u25B6" : "\u25BC"}
                </span>{" "}
                {displayCat} ({catActions.length})
              </button>
              {!catCollapsed && catActions.length > 0 && (
                <div className={s.itemGrid}>
                  {catActions.map((action) => (
                    <button
                      className={s.item}
                      key={action.id}
                      onClick={() => handleEdit(action.id)}
                    >
                      {action.name || action.id}
                      {action.source && <span className={s.sourceSpan}> [{action.source}]</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {actions.length === 0 && <div className={s.emptyMsg}>{t("empty.actions")}</div>}
      </div>

    </div>
  );
}
