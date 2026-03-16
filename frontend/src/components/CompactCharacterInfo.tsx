import T from "../theme";
import type { CharacterState } from "../types/game";

type CompactTab = "basic" | "clothing";

interface Props {
  character: CharacterState;
  playerId: string;
  activeTab: CompactTab;
  onTabChange: (tab: CompactTab) => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}

export default function CompactCharacterInfo({ character, playerId, activeTab, onTabChange, detailOpen, onToggleDetail }: Props) {
  const { basicInfo, resources, clothing, favorability } = character;
  const isPlayer = character.id === playerId;
  const favToPlayer = !isPlayer ? favorability?.find((f) => f.id === playerId)?.value : undefined;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    backgroundColor: "transparent",
    color: active ? T.accent : T.textSub,
    border: "none",
    borderBottom: active ? `2px solid ${T.accent}` : "2px solid transparent",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: active ? "bold" : "normal",
  });

  return (
    <div
      style={{
        fontSize: "13px",
        color: T.text,
        backgroundColor: T.bg1,
        padding: "8px",
        borderRadius: "4px",
      }}
    >
      {/* Tab bar */}
      <div style={{ borderBottom: `1px solid ${T.border}`, marginBottom: "6px", display: "flex" }}>
        <button style={tabStyle(activeTab === "basic" && !detailOpen)} onClick={() => onTabChange("basic")}>
          [基本]
        </button>
        <button style={tabStyle(activeTab === "clothing" && !detailOpen)} onClick={() => onTabChange("clothing")}>
          [服装]
        </button>
        <button
          style={{
            ...tabStyle(detailOpen),
            marginLeft: "auto",
          }}
          onClick={onToggleDetail}
        >
          [详细{detailOpen ? "▲" : "▼"}]
        </button>
      </div>

      {activeTab === "basic" && (
        <>
          {/* Basic info - inline */}
          <div style={{ marginBottom: "6px" }}>
            {Object.entries(basicInfo).map(([key, field]) => (
              <span key={key} style={{ marginRight: "10px" }}>
                {field.label}: <span style={{ color: T.text }}>{field.value}</span>
              </span>
            ))}
            {favToPlayer !== undefined && (
              <span style={{ marginRight: "10px" }}>
                好感度: <span style={{ color: T.text }}>{favToPlayer}</span>
              </span>
            )}
          </div>

          {/* Resources - compact bars */}
          {Object.entries(resources).map(([key, res]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
              <span style={{ minWidth: "32px", fontSize: "11px", color: T.textSub }}>{res.label}</span>
              <div
                style={{
                  flex: 1,
                  height: "10px",
                  backgroundColor: T.border,
                  borderRadius: "2px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(res.value / res.max) * 100}%`,
                    height: "100%",
                    backgroundColor: res.color,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span style={{ fontSize: "11px", color: T.textSub, minWidth: "50px", textAlign: "right" }}>
                {res.value}/{res.max}
              </span>
            </div>
          ))}
        </>
      )}

      {activeTab === "clothing" && (
        <div>
          {clothing.map((slot) => (
            <div key={slot.slot} style={{ fontSize: "12px", color: slot.occluded ? T.textFaint : slot.itemId ? T.text : T.textDim }}>
              {slot.slotLabel}:{" "}
              {slot.occluded ? (
                "【？？？】"
              ) : slot.itemId ? (
                <>
                  [{slot.itemName}]
                  {slot.state === "halfWorn" && (
                    <span style={{ color: T.danger }}> (半穿)</span>
                  )}
                  {slot.state === "off" && (
                    <span style={{ color: T.danger }}> (脱下)</span>
                  )}
                </>
              ) : (
                "无"
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
