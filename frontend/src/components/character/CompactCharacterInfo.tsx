import clsx from "clsx";
import { t } from "../../i18n/ui";
import type { CharacterState } from "../../types/game";
import s from "./CompactCharacterInfo.module.css";

type CompactTab = "basic" | "clothing";

interface Props {
  character: CharacterState;
  playerId: string;
  activeTab: CompactTab;
  onTabChange: (tab: CompactTab) => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}

export default function CompactCharacterInfo({
  character,
  playerId,
  activeTab,
  onTabChange,
  detailOpen,
  onToggleDetail,
}: Props) {
  const { basicInfo, resources, clothing, favorability } = character;
  const isPlayer = character.id === playerId;
  const favToPlayer = !isPlayer ? favorability?.find((f) => f.id === playerId)?.value : undefined;

  return (
    <div className={s.wrapper}>
      {/* Tab bar */}
      <div className={s.tabBar}>
        <button
          className={clsx(s.tab, activeTab === "basic" && !detailOpen && s.tabActive)}
          onClick={() => onTabChange("basic")}
        >
          [{t("charInfo.basic")}]
        </button>
        <button
          className={clsx(s.tab, activeTab === "clothing" && !detailOpen && s.tabActive)}
          onClick={() => onTabChange("clothing")}
        >
          [{t("charInfo.clothing")}]
        </button>
        <button
          className={clsx(s.tab, s.tabDetail, detailOpen && s.tabActive)}
          onClick={onToggleDetail}
        >
          [{detailOpen ? t("btn.detailClose") : t("btn.detailOpen")}]
        </button>
      </div>

      {activeTab === "basic" && (
        <>
          {/* Basic info - inline */}
          <div className={s.basicRow}>
            {Object.entries(basicInfo).map(([key, field]) => (
              <span key={key} className={s.infoSpan}>
                {field.label}: <span className={s.infoValue}>{field.value}</span>
              </span>
            ))}
            {favToPlayer !== undefined && (
              <span className={s.infoSpan}>
                {t("charInfo.favorability")} <span className={s.infoValue}>{favToPlayer}</span>
              </span>
            )}
          </div>

          {/* Resources - compact bars */}
          {Object.entries(resources).map(([key, res]) => (
            <div key={key} className={s.resRow}>
              <span className={s.resLabel}>{res.label}</span>
              <div className={s.resTrack}>
                <div
                  className={s.resFill}
                  style={{
                    width: `${(res.value / res.max) * 100}%`,
                    backgroundColor: res.color,
                  }}
                />
              </div>
              <span className={s.resValue}>
                {res.value}/{res.max}
              </span>
            </div>
          ))}
        </>
      )}

      {activeTab === "clothing" && (
        <div>
          {clothing.map((slot) => (
            <div
              key={slot.slot}
              className={clsx(
                s.clothingSlot,
                slot.occluded ? s.clothingOccluded : slot.itemId ? s.clothingEquipped : s.clothingEmpty,
              )}
            >
              {slot.slotLabel}:{" "}
              {slot.occluded ? (
                t("ui.occluded")
              ) : slot.itemId ? (
                <>
                  [{slot.itemName}]{slot.state === "halfWorn" && <span className={s.stateDanger}> {t("ui.halfWorn")}</span>}
                  {slot.state === "off" && <span className={s.stateDanger}> {t("ui.off")}</span>}
                </>
              ) : (
                t("ui.none")
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
