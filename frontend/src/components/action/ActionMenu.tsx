import T from "../../theme";
import { useMemo, useState } from "react";
import { t, SLOT_LABELS } from "../../i18n/ui";
import type { GameAction, OutfitTarget } from "../../types/game";
import { ActionType, TargetType } from "../../constants";

interface ActionMenuProps {
  actions: GameAction[];
  onMove: (targetCell: number, targetMap?: string) => void;
  onLook: (targetCell: number, targetMap?: string) => void;
  onAction: (actionId: string, targetId?: string) => void;
  onChangeOutfit: (outfitId: string, selections: Record<string, string>) => void;
  disabled: boolean;
  selectedNpcId: string | null;
}

const ALL_TAB = "__all__";
const BASIC_TAB = t("label.basic");

type MenuMode = "normal" | "moveDetail" | "lookDetail" | "outfitSelect" | "outfitDetail";

export default function ActionMenu({
  actions,
  onMove,
  onLook,
  onAction,
  onChangeOutfit,
  disabled,
  selectedNpcId,
}: ActionMenuProps) {
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [menuMode, setMenuMode] = useState<MenuMode>("normal");
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitTarget | null>(null);
  const [slotSelections, setSlotSelections] = useState<Record<string, string>>({});

  const moveAction = actions.find((a) => a.type === ActionType.MOVE);
  const lookAction = actions.find((a) => a.type === ActionType.LOOK);
  const outfitAction = actions.find((a) => a.type === ActionType.CHANGE_OUTFIT);
  const hasBasic = moveAction || lookAction || outfitAction;
  const configuredActions = actions.filter((a) => a.type === ActionType.CONFIGURED && (a.targetType !== TargetType.NPC || selectedNpcId));

  const { tabs, grouped } = useMemo(() => {
    const builtinTabs: string[] = [];
    if (hasBasic) builtinTabs.push(BASIC_TAB);

    const g: Record<string, GameAction[]> = {};
    const configTabs: string[] = [];
    for (const a of configuredActions) {
      const cat = a.category || t("ui.other");
      if (!g[cat]) {
        g[cat] = [];
        configTabs.push(cat);
      }
      g[cat].push(a);
    }
    return { tabs: [...builtinTabs, ...configTabs], grouped: g };
  }, [hasBasic, configuredActions]);

  const showBasic = activeTab === ALL_TAB || activeTab === BASIC_TAB;
  const visibleCats = activeTab === ALL_TAB ? Object.keys(grouped) : grouped[activeTab] ? [activeTab] : [];

  const btnBase: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "4px 8px",
    marginBottom: "2px",
    border: `1px solid ${T.border}`,
    fontSize: "13px",
  };

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: "3px 8px",
    backgroundColor: "transparent",
    color: activeTab === tab ? T.accent : T.textSub,
    border: "none",
    borderBottom: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: activeTab === tab ? "bold" : "normal",
  });

  const subHeader = (title: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: `1px solid ${T.border}`,
        marginBottom: "8px",
        paddingBottom: "2px",
      }}
    >
      <span style={{ color: T.accent, fontWeight: "bold" }}>== {title} ==</span>
      <button
        onClick={() => setMenuMode("normal")}
        style={{
          background: "none",
          border: `1px solid ${T.border}`,
          color: T.textSub,
          cursor: "pointer",
          padding: "2px 8px",
          borderRadius: "3px",
          fontSize: "12px",
        }}
      >
        [{t("btn.return")}]
      </button>
    </div>
  );

  const container: React.CSSProperties = {
    fontSize: "13px",
    color: T.text,
    backgroundColor: T.bg1,
    padding: "12px",
    borderRadius: "4px",
  };

  // ─── Move detail ───
  if (menuMode === "moveDetail" && moveAction?.targets) {
    return (
      <div style={container}>
        {subHeader(t("menu.move"))}
        {moveAction.targets.map((target, idx) => (
          <button
            key={`${target.targetMap || ""}-${target.targetCell}`}
            onClick={() => {
              onMove(target.targetCell, target.targetMap);
              setMenuMode("normal");
            }}
            disabled={disabled}
            style={{
              ...btnBase,
              backgroundColor: disabled ? T.borderDim : T.bg2,
              color: disabled ? T.textDim : T.actionMove,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            [{idx + 1}] {target.targetMapName ? `${target.targetMapName} - ` : ""}
            {target.targetCellName}
            <span style={{ color: T.textSub, fontSize: "11px" }}> ({target.travelTime ?? 10}{t("ui.minutes")})</span>
          </button>
        ))}
      </div>
    );
  }

  // ─── Look detail ───
  if (menuMode === "lookDetail" && lookAction?.targets) {
    return (
      <div style={container}>
        {subHeader(t("menu.look"))}
        {lookAction.targets.map((target, idx) => (
          <button
            key={`look-${target.targetMap || ""}-${target.targetCell}`}
            onClick={() => {
              onLook(target.targetCell, target.targetMap);
              setMenuMode("normal");
            }}
            disabled={disabled}
            style={{
              ...btnBase,
              backgroundColor: disabled ? T.borderDim : T.bg2,
              color: disabled ? T.textDim : T.actionLook,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            [{idx + 1}] {target.targetMapName ? `${target.targetMapName} - ` : ""}
            {target.targetCellName}
          </button>
        ))}
      </div>
    );
  }

  // ─── Outfit select (step 1) ───
  if (menuMode === "outfitSelect" && outfitAction?.outfitTargets) {
    return (
      <div style={container}>
        {subHeader(t("menu.changeOutfit"))}
        {outfitAction.outfitTargets.map((ot) => (
          <button
            key={ot.outfitId}
            onClick={() => {
              setSelectedOutfit(ot);
              const init: Record<string, string> = {};
              for (const [slot, items] of Object.entries(ot.slots || {})) {
                if (items.length > 0) init[slot] = items[0].id;
              }
              setSlotSelections(init);
              setMenuMode("outfitDetail");
            }}
            disabled={disabled}
            style={{
              ...btnBase,
              backgroundColor: disabled ? T.borderDim : T.bg2,
              color: disabled ? T.textDim : T.accent,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {ot.outfitName}
            {ot.current && <span style={{ color: T.textDim, fontSize: "11px", marginLeft: "6px" }}>({t("ui.current")})</span>}
          </button>
        ))}
      </div>
    );
  }

  // ─── Outfit detail (step 2) ───
  if (menuMode === "outfitDetail" && selectedOutfit) {
    const slotsWithItems = Object.entries(selectedOutfit.slots).filter(([, items]) => items.length > 0);
    return (
      <div style={container}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${T.border}`,
            marginBottom: "8px",
            paddingBottom: "2px",
          }}
        >
          <span style={{ color: T.accent, fontWeight: "bold" }}>== {selectedOutfit.outfitName} ==</span>
          <button
            onClick={() => setMenuMode("outfitSelect")}
            style={{
              background: "none",
              border: `1px solid ${T.border}`,
              color: T.textSub,
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "3px",
              fontSize: "12px",
            }}
          >
            [{t("btn.return")}]
          </button>
        </div>
        {slotsWithItems.map(([slot, items]) => (
          <div key={slot} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span style={{ minWidth: "90px", color: T.textSub, fontSize: "12px" }}>{SLOT_LABELS[slot] ?? slot}:</span>
            {items.length === 1 ? (
              <span style={{ color: T.text, fontSize: "12px" }}>{items[0].name}</span>
            ) : (
              <select
                style={{
                  padding: "2px 6px",
                  backgroundColor: T.bg3,
                  color: T.text,
                  border: `1px solid ${T.borderLight}`,
                  borderRadius: "3px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
                value={slotSelections[slot] ?? items[0].id}
                onChange={(e) => setSlotSelections((prev) => ({ ...prev, [slot]: e.target.value }))}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        {slotsWithItems.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "12px", marginBottom: "8px" }}>{t("menu.emptyOutfit")}</div>
        )}
        <button
          onClick={() => {
            onChangeOutfit(selectedOutfit.outfitId, slotSelections);
            setMenuMode("normal");
            setSelectedOutfit(null);
          }}
          disabled={disabled || slotsWithItems.length === 0}
          style={{
            ...btnBase,
            backgroundColor: disabled ? T.borderDim : T.bg2,
            color: disabled ? T.textDim : T.successDim,
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: "center",
            marginTop: "6px",
          }}
        >
          [{t("btn.confirmOutfit")}] <span style={{ color: T.textSub, fontSize: "11px" }}>(5{t("ui.minutes")})</span>
        </button>
      </div>
    );
  }

  // ─── Normal view ───
  return (
    <div style={container}>
      <div
        style={{
          color: T.accent,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: "4px",
          paddingBottom: "2px",
          fontWeight: "bold",
        }}
      >
        == {t("menu.actions")} ==
      </div>

      {/* Category tabs */}
      {tabs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, marginBottom: "8px" }}>
          <button style={tabStyle(ALL_TAB)} onClick={() => setActiveTab(ALL_TAB)}>
            [{t("menu.all")}]
          </button>
          {tabs.map((tab) => (
            <button key={tab} style={tabStyle(tab)} onClick={() => setActiveTab(tab)}>
              [{tab}]
            </button>
          ))}
        </div>
      )}

      {/* Basic: move, look, outfit as entry buttons */}
      {showBasic && (
        <div style={{ marginBottom: "8px" }}>
          {activeTab === ALL_TAB && <div style={{ color: T.textSub, marginBottom: "4px" }}>{t("label.basic")}:</div>}
          {moveAction && (
            <button
              onClick={() => setMenuMode("moveDetail")}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? T.borderDim : T.bg2,
                color: disabled ? T.textDim : T.actionMove,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              [{t("menu.moveEllipsis")}]
              <span style={{ color: T.textSub, fontSize: "11px" }}> ({t("menu.moveTargets", { count: moveAction.targets?.length ?? 0 })})</span>
            </button>
          )}
          {lookAction && (
            <button
              onClick={() => setMenuMode("lookDetail")}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? T.borderDim : T.bg2,
                color: disabled ? T.textDim : T.actionLook,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              [{t("menu.lookEllipsis")}]
              <span style={{ color: T.textSub, fontSize: "11px" }}> ({t("menu.lookTargets", { count: lookAction.targets?.length ?? 0 })})</span>
            </button>
          )}
          {outfitAction && (
            <button
              onClick={() => setMenuMode("outfitSelect")}
              disabled={disabled}
              style={{
                ...btnBase,
                backgroundColor: disabled ? T.borderDim : T.bg2,
                color: disabled ? T.textDim : T.accent,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              [{t("menu.outfitEllipsis")}]
            </button>
          )}
        </div>
      )}

      {/* Configured actions by category */}
      {visibleCats.map((cat) => {
        const catActions = grouped[cat] || [];
        return (
          <div key={cat} style={{ marginBottom: "8px" }}>
            {activeTab === ALL_TAB && <div style={{ color: T.textSub, marginBottom: "4px" }}>{cat}:</div>}
            {catActions.map((action) => {
              const needsNpc = action.targetType === TargetType.NPC;
              const isDisabled = disabled || action.enabled === false || (needsNpc && !selectedNpcId);
              let tooltip = "";
              if (action.enabled === false && action.disabledReason) {
                tooltip = action.disabledReason;
              } else if (needsNpc && !selectedNpcId) {
                tooltip = t("msg.selectTargetNpc");
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

      {actions.length === 0 && <div style={{ color: T.textDim }}>{t("empty.noActions")}</div>}
    </div>
  );
}
