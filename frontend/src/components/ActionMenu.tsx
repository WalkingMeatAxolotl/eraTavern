import { useMemo } from "react";
import type { GameAction } from "../types/game";

interface ActionMenuProps {
  actions: GameAction[];
  onMove: (targetCell: number, targetMap?: string) => void;
  onLook: (targetCell: number, targetMap?: string) => void;
  onAction: (actionId: string, targetId?: string) => void;
  disabled: boolean;
  selectedNpcId: string | null;
}

export default function ActionMenu({
  actions,
  onMove,
  onLook,
  onAction,
  disabled,
  selectedNpcId,
}: ActionMenuProps) {
  // Separate built-in from configured actions; hide npc-targeted actions when no NPC selected
  const moveAction = actions.find((a) => a.type === "move");
  const lookAction = actions.find((a) => a.type === "look");
  const configuredActions = actions.filter(
    (a) => a.type === "configured" && (a.targetType !== "npc" || selectedNpcId)
  );

  // Group configured by category
  const { catOrder, grouped } = useMemo(() => {
    const g: Record<string, GameAction[]> = {};
    const order: string[] = [];
    for (const a of configuredActions) {
      const cat = a.category || "其他";
      if (!g[cat]) {
        g[cat] = [];
        order.push(cat);
      }
      g[cat].push(a);
    }
    return { catOrder: order, grouped: g };
  }, [configuredActions]);

  const btnBase: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "4px 8px",
    marginBottom: "2px",
    border: "1px solid #333",
    fontFamily: "monospace",
    fontSize: "13px",
  };

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ddd",
        backgroundColor: "#1a1a2e",
        padding: "12px",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          color: "#e94560",
          borderBottom: "1px solid #333",
          marginBottom: "8px",
          paddingBottom: "2px",
          fontWeight: "bold",
        }}
      >
        == 行动 ==
      </div>

      {/* Move */}
      {moveAction && moveAction.targets && (
        <div style={{ marginBottom: "8px" }}>
          <div style={{ color: "#aaa", marginBottom: "4px" }}>{moveAction.name}:</div>
          {moveAction.targets.map((target, idx) => (
            <button
              key={`${target.targetMap || ""}-${target.targetCell}`}
              onClick={() => onMove(target.targetCell, target.targetMap)}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? "#222" : "#16213e",
                color: disabled ? "#666" : "#0ff",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              [{idx + 1}]{" "}
              {target.targetMapName ? `${target.targetMapName} - ` : ""}
              {target.targetCellName}
              <span style={{ color: "#888", fontSize: "11px" }}> ({target.travelTime ?? 10}分)</span>
            </button>
          ))}
        </div>
      )}

      {/* Look */}
      {lookAction && lookAction.targets && (
        <div style={{ marginBottom: "8px" }}>
          <div style={{ color: "#aaa", marginBottom: "4px" }}>{lookAction.name}:</div>
          {lookAction.targets.map((target, idx) => (
            <button
              key={`look-${target.targetMap || ""}-${target.targetCell}`}
              onClick={() => onLook(target.targetCell, target.targetMap)}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? "#222" : "#16213e",
                color: disabled ? "#666" : "#6ec6ff",
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
      {catOrder.map((cat) => {
        const catActions = grouped[cat] || [];
        return (
          <div key={cat} style={{ marginBottom: "8px" }}>
            <div style={{ color: "#aaa", marginBottom: "4px" }}>{cat}:</div>
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
                    backgroundColor: isDisabled ? "#222" : "#16213e",
                    color: isDisabled ? "#666" : "#ff0",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  {action.name}
                  {needsNpc && <span style={{ color: "#888", fontSize: "11px" }}> [NPC]</span>}
                  {action.enabled === false && action.disabledReason && (
                    <span style={{ color: "#e94560", fontSize: "11px", marginLeft: "6px" }}>
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
        <div style={{ color: "#666" }}>无可用行动</div>
      )}
    </div>
  );
}
