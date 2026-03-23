import { useMemo, useState } from "react";
import clsx from "clsx";
import { t, SLOT_LABELS } from "../../i18n/ui";
import type { GameAction, OutfitTarget } from "../../types/game";
import { ActionType, TargetType } from "../../constants";
import s from "./ActionMenu.module.css";

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

  const subHeader = (title: string) => (
    <div className={s.subHeader}>
      <span className={s.subHeaderTitle}>== {title} ==</span>
      <button onClick={() => setMenuMode("normal")} className={s.returnBtn}>
        [{t("btn.return")}]
      </button>
    </div>
  );

  // ─── Move detail ───
  if (menuMode === "moveDetail" && moveAction?.targets) {
    return (
      <div className={s.container}>
        {subHeader(t("menu.move"))}
        {moveAction.targets.map((target, idx) => (
          <button
            key={`${target.targetMap || ""}-${target.targetCell}`}
            onClick={() => {
              onMove(target.targetCell, target.targetMap);
              setMenuMode("normal");
            }}
            disabled={disabled}
            className={clsx(s.actionBtn, s.actionMove)}
          >
            [{idx + 1}] {target.targetMapName ? `${target.targetMapName} - ` : ""}
            {target.targetCellName}
            <span className={s.hint}> ({target.travelTime ?? 10}{t("ui.minutes")})</span>
          </button>
        ))}
      </div>
    );
  }

  // ─── Look detail ───
  if (menuMode === "lookDetail" && lookAction?.targets) {
    return (
      <div className={s.container}>
        {subHeader(t("menu.look"))}
        {lookAction.targets.map((target, idx) => (
          <button
            key={`look-${target.targetMap || ""}-${target.targetCell}`}
            onClick={() => {
              onLook(target.targetCell, target.targetMap);
              setMenuMode("normal");
            }}
            disabled={disabled}
            className={clsx(s.actionBtn, s.actionLook)}
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
      <div className={s.container}>
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
            className={clsx(s.actionBtn, s.actionAccent)}
          >
            {ot.outfitName}
            {ot.current && <span className={s.currentTag}>({t("ui.current")})</span>}
          </button>
        ))}
      </div>
    );
  }

  // ─── Outfit detail (step 2) ───
  if (menuMode === "outfitDetail" && selectedOutfit) {
    const slotsWithItems = Object.entries(selectedOutfit.slots).filter(([, items]) => items.length > 0);
    return (
      <div className={s.container}>
        <div className={s.subHeader}>
          <span className={s.subHeaderTitle}>== {selectedOutfit.outfitName} ==</span>
          <button onClick={() => setMenuMode("outfitSelect")} className={s.returnBtn}>
            [{t("btn.return")}]
          </button>
        </div>
        {slotsWithItems.map(([slot, items]) => (
          <div key={slot} className={s.slotRow}>
            <span className={s.slotLabel}>{SLOT_LABELS[slot] ?? slot}:</span>
            {items.length === 1 ? (
              <span className={s.slotText}>{items[0].name}</span>
            ) : (
              <select
                className={s.slotSelect}
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
          <div className={s.emptyOutfit}>{t("menu.emptyOutfit")}</div>
        )}
        <button
          onClick={() => {
            onChangeOutfit(selectedOutfit.outfitId, slotSelections);
            setMenuMode("normal");
            setSelectedOutfit(null);
          }}
          disabled={disabled || slotsWithItems.length === 0}
          className={clsx(s.actionBtn, s.actionSuccess)}
        >
          [{t("btn.confirmOutfit")}] <span className={s.hint}>(5{t("ui.minutes")})</span>
        </button>
      </div>
    );
  }

  // ─── Normal view ───
  return (
    <div className={s.container}>
      <div className={s.sectionHeader}>
        == {t("menu.actions")} ==
      </div>

      {/* Category tabs */}
      {tabs.length > 0 && (
        <div className={s.tabBar}>
          <button className={clsx(s.tab, activeTab === ALL_TAB && s.tabActive)} onClick={() => setActiveTab(ALL_TAB)}>
            [{t("menu.all")}]
          </button>
          {tabs.map((tab) => (
            <button key={tab} className={clsx(s.tab, activeTab === tab && s.tabActive)} onClick={() => setActiveTab(tab)}>
              [{tab}]
            </button>
          ))}
        </div>
      )}

      {/* Basic: move, look, outfit as entry buttons */}
      {showBasic && (
        <div className={s.categorySection}>
          {activeTab === ALL_TAB && <div className={s.categoryLabel}>{t("label.basic")}:</div>}
          {moveAction && (
            <button
              onClick={() => setMenuMode("moveDetail")}
              disabled={disabled}
              className={clsx(s.actionBtn, s.actionMove)}
            >
              [{t("menu.moveEllipsis")}]
              <span className={s.hint}> ({t("menu.moveTargets", { count: moveAction.targets?.length ?? 0 })})</span>
            </button>
          )}
          {lookAction && (
            <button
              onClick={() => setMenuMode("lookDetail")}
              disabled={disabled}
              className={clsx(s.actionBtn, s.actionLook)}
            >
              [{t("menu.lookEllipsis")}]
              <span className={s.hint}> ({t("menu.lookTargets", { count: lookAction.targets?.length ?? 0 })})</span>
            </button>
          )}
          {outfitAction && (
            <button
              onClick={() => setMenuMode("outfitSelect")}
              disabled={disabled}
              className={clsx(s.actionBtn, s.actionAccent)}
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
          <div key={cat} className={s.categorySection}>
            {activeTab === ALL_TAB && <div className={s.categoryLabel}>{cat}:</div>}
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
                  className={s.actionBtn}
                >
                  {action.name}
                  {needsNpc && <span className={s.npcTag}> [NPC]</span>}
                  {action.enabled === false && action.disabledReason && (
                    <span className={s.disabledReason}>
                      ({action.disabledReason})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {actions.length === 0 && <div className={s.noActions}>{t("empty.noActions")}</div>}
    </div>
  );
}
