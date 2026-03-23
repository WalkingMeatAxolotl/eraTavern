import clsx from "clsx";
import { t } from "../../i18n/ui";
import type { CharacterState } from "../../types/game";
import s from "./CharacterPanel.module.css";

export type DetailTab = "basic" | "ability" | "experience" | "inventory" | "social";

interface CharacterPanelProps {
  character: CharacterState;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
}

const TAB_ITEMS: { key: DetailTab; label: string }[] = [
  { key: "basic", label: t("charPanel.basic") },
  { key: "ability", label: t("charPanel.ability") },
  { key: "experience", label: t("charPanel.experience") },
  { key: "inventory", label: t("charPanel.inventory") },
  { key: "social", label: t("charPanel.social") },
];

export default function CharacterPanel({ character, activeTab, onTabChange, onClose }: CharacterPanelProps) {
  const { basicInfo, resources, clothing, traits, abilities, experiences, inventory, favorability } = character;

  return (
    <div className={s.wrapper}>
      {/* Tab bar */}
      <div className={s.tabBar}>
        {TAB_ITEMS.map((item) => (
          <button
            key={item.key}
            className={clsx(s.tab, activeTab === item.key && s.tabActive)}
            onClick={() => onTabChange(item.key)}
          >
            [{item.label}]
          </button>
        ))}
        <button
          className={clsx(s.tab, s.closeBtn)}
          onClick={onClose}
        >
          [{t("btn.closeDetail")}]
        </button>
      </div>

      {activeTab === "basic" && (
        <>
          <Section title={t("section.basicInfo")}>
            {Object.entries(basicInfo).map(([key, field]) => (
              <div key={key}>
                {field.label}: {field.value}
              </div>
            ))}
          </Section>

          <Section title={t("section.resources")}>
            {Object.entries(resources).map(([key, res]) => (
              <div key={key} className={s.resRow}>
                <div>
                  {res.label}: {res.value}/{res.max}
                </div>
                <div className={s.resTrack}>
                  <div
                    className={s.resFill}
                    style={{
                      width: `${(res.value / res.max) * 100}%`,
                      backgroundColor: res.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </Section>

          <Section title={t("section.clothing")}>
            {clothing.map((slot) => (
              <div
                key={slot.slot}
                className={clsx(
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
          </Section>
        </>
      )}

      {activeTab === "ability" && (
        <>
          <Section title={t("section.traits")}>
            {traits.map((trait) => (
              <div key={trait.key}>
                {trait.label}: {trait.values.length > 0 ? trait.values.map((v) => `[${v}]`).join(" ") : t("ui.none")}
              </div>
            ))}
          </Section>

          <Section title={t("section.abilities")}>
            <div className={s.abilityGrid}>
              {abilities.map((ab) => (
                <div key={ab.key}>
                  {ab.label}: {ab.grade} <span className={s.abilityExp}>{ab.exp}</span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {activeTab === "experience" && (
        <Section title={t("section.expRecord")}>
          {experiences && experiences.length > 0 ? (
            experiences.filter((exp) => exp.count > 0).length > 0 ? (
              experiences
                .filter((exp) => exp.count > 0)
                .map((exp) => (
                  <div key={exp.key} className={s.expEntry}>
                    <div>
                      {exp.label}: <span className={s.expCount}>{exp.count}</span>{t("ui.times")}
                    </div>
                    {exp.first && (
                      <div className={s.expDetail}>
                        {t("charPanel.firstTime", { time: exp.first.time ?? "" })}
                        {exp.first.location && t("charPanel.atLocation", { location: exp.first.location })}
                        {exp.first.target && t("charPanel.withTarget", { target: exp.first.target })}
                      </div>
                    )}
                  </div>
                ))
            ) : (
              <div className={s.emptyText}>{t("empty.noExpRecord")}</div>
            )
          ) : (
            <div className={s.emptyText}>{t("empty.noExpDefShort")}</div>
          )}
        </Section>
      )}

      {activeTab === "inventory" && (
        <Section title={t("section.inventory")}>
          {inventory.length > 0 ? (
            inventory.map((inv) => (
              <div key={inv.itemId}>
                {inv.name}
                {inv.amount > 1 ? ` x${inv.amount}` : ""}
              </div>
            ))
          ) : (
            <div className={s.emptyText}>{t("ui.none")}</div>
          )}
        </Section>
      )}

      {activeTab === "social" && (
        <Section title={t("section.socialRel")}>
          {favorability && favorability.length > 0 ? (
            favorability.map((fav) => (
              <div key={fav.id} className={s.favRow}>
                <span className={s.favName}>{fav.name}:</span>
                <div className={s.favTrack}>
                  <div
                    className={s.favFill}
                    style={{
                      width: `${Math.min(100, Math.max(0, (fav.value / 1000) * 100))}%`,
                    }}
                  />
                </div>
                <span className={s.favValue}>
                  {fav.value}
                </span>
              </div>
            ))
          ) : (
            <div className={s.emptyText}>{t("empty.social")}</div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={s.section}>
      <div className={s.sectionTitle}>
        == {title} ==
      </div>
      {children}
    </div>
  );
}
