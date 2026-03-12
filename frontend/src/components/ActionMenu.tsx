import T from "../theme";
import { useMemo, useState } from "react";
import type { GameAction } from "../types/game";

interface ActionMenuProps {
  actions: GameAction[];
  onMove: (targetCell: number, targetMap?: string) => void;
  onLook: (targetCell: number, targetMap?: string) => void;
  onAction: (actionId: string, targetId?: string) => void;
  disabled: boolean;
  selectedNpcId: string | null;
}

const ALL_TAB = "__all__";

export default function ActionMenu({
  actions,
  onMove,
  onLook,
  onAction,
  disabled,
  selectedNpcId,
}: ActionMenuProps) {
  const [activeTab, setActiveTab] = useState(ALL_TAB);

  const moveAction = actions.find((a) => a.type === "move");
  const lookAction = actions.find((a) => a.type === "look");
  const configuredActions = actions.filter(
    (a) => a.type === "configured" && (a.targetType !== "npc" || selectedNpcId)
  );

  // Build category list and grouped actions
  const { tabs, grouped } = useMemo(() => {
    const builtinTabs: string[] = [];
    if (moveAction) builtinTabs.push("移动");
    if (lookAction) builtinTabs.push("查看");

    const g: Record<string, GameAction[]> = {};
    const configTabs: string[] = [];
    for (const a of configuredActions) {
      const cat = a.category || "其他";
      if (!g[cat]) {
        g[cat] = [];
        configTabs.push(cat);
      }
      g[cat].push(a);
    }
    return { tabs: [...builtinTabs, ...configTabs], grouped: g };
  }, [moveAction, lookAction, configuredActions]);

  // Whether a tab should show move/look
  const showMove = activeTab === ALL_TAB || activeTab === "移动";
  const showLook = activeTab === ALL_TAB || activeTab === "查看";

  // Filter configured categories
  const visibleCats = activeTab === ALL_TAB
    ? Object.keys(grouped)
    : grouped[activeTab] ? [activeTab] : [];

  const btnBase: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "4px 8px",
    marginBottom: "2px",
    border: `1px solid ${T.border}`,
    fontFamily: "monospace",
    fontSize: "13px",
  };

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: "3px 8px",
    backgroundColor: "transparent",
    color: activeTab === tab ? T.accent : T.textSub,
    border: "none",
    borderBottom: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "12px",
    fontWeight: activeTab === tab ? "bold" : "normal",
  });

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: T.text,
        backgroundColor: T.bg1,
        padding: "12px",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          color: T.accent,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: "4px",
          paddingBottom: "2px",
          fontWeight: "bold",
        }}
      >
        == 行动 ==
      </div>

      {/* Category tabs */}
      {tabs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, marginBottom: "8px" }}>
          <button style={tabStyle(ALL_TAB)} onClick={() => setActiveTab(ALL_TAB)}>
            [全部]
          </button>
          {tabs.map((tab) => (
            <button key={tab} style={tabStyle(tab)} onClick={() => setActiveTab(tab)}>
              [{tab}]
            </button>
          ))}
        </div>
      )}

      {/* Move */}
      {showMove && moveAction && moveAction.targets && (
        <div style={{ marginBottom: "8px" }}>
          {activeTab === ALL_TAB && <div style={{ color: T.textSub, marginBottom: "4px" }}>移动:</div>}
          {moveAction.targets.map((target, idx) => (
            <button
              key={`${target.targetMap || ""}-${target.targetCell}`}
              onClick={() => onMove(target.targetCell, target.targetMap)}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? T.borderDim : T.bg2,
                color: disabled ? T.textDim : T.actionMove,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              [{idx + 1}]{" "}
              {target.targetMapName ? `${target.targetMapName} - ` : ""}
              {target.targetCellName}
              <span style={{ color: T.textSub, fontSize: "11px" }}> ({target.travelTime ?? 10}分)</span>
            </button>
          ))}
        </div>
      )}

      {/* Look */}
      {showLook && lookAction && lookAction.targets && (
        <div style={{ marginBottom: "8px" }}>
          {activeTab === ALL_TAB && <div style={{ color: T.textSub, marginBottom: "4px" }}>查看:</div>}
          {lookAction.targets.map((target, idx) => (
            <button
              key={`look-${target.targetMap || ""}-${target.targetCell}`}
              onClick={() => onLook(target.targetCell, target.targetMap)}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? T.borderDim : T.bg2,
                color: disabled ? T.textDim : T.actionLook,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              [{idx + 1}]{" "}
              {target.targetMapName ? `${target.targetMapName} - ` : ""}
              {target.targetCellName}
            </button>
          ))}
        </div>
      )}

      {/* Configured actions by category */}
      {visibleCats.map((cat) => {
        const catActions = grouped[cat] || [];
        return (
          <div key={cat} style={{ marginBottom: "8px" }}>
            {activeTab === ALL_TAB && <div style={{ color: T.textSub, marginBottom: "4px" }}>{cat}:</div>}
            {catActions.map((action) => {
              const needsNpc = action.targetType === "npc";
              const isDisabled = disabled || action.enabled === false || (needsNpc && !selectedNpcId);
              let tooltip = "";
              if (action.enabled === false && action.disabledReason) {
                tooltip = action.disabledReason;
              } else if (needsNpc && !selectedNpcId) {
                tooltip = "请先选择目标NPC";
              }

              return (
                <button
                  key={action.id}
                  onClick={() => onAction(action.id, needsNpc ? (selectedNpcId ?? undefined) : undefined)}
                  disabled={isDisabled}
                  title={tooltip}
                  style={{
                    ...btnBase,
                    backgroundColor: isDisabled ? T.borderDim : T.bg2,
                    color: isDisabled ? T.textDim : T.actionConfigured,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {action.name}
                  {needsNpc && <span style={{ color: T.textSub, fontSize: "11px" }}> [NPC]</span>}
                  {action.enabled === false && action.disabledReason && (
                    <span style={{ color: T.danger, fontSize: "11px", marginLeft: "6px" }}>
                      ({action.disabledReason})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {actions.length === 0 && (
        <div style={{ color: T.textDim }}>无可用行动</div>
      )}
    </div>
  );
}
