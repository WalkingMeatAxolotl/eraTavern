import T from "../../theme";
import { t } from "../../i18n/ui";
import type { CharacterState } from "../../types/game";

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

  const tabStyle = (tab: DetailTab): React.CSSProperties => ({
    padding: "4px 10px",
    backgroundColor: "transparent",
    color: activeTab === tab ? T.accent : T.textSub,
    border: "none",
    borderBottom: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: activeTab === tab ? "bold" : "normal",
  });

  return (
    <div
      style={{
        fontSize: "13px",
        color: T.text,
        backgroundColor: T.bg1,
        padding: "12px",
        borderRadius: "4px",
        overflowY: "auto",
      }}
    >
      {/* Tab bar */}
      <div style={{ borderBottom: `1px solid ${T.border}`, marginBottom: "8px", display: "flex" }}>
        {TAB_ITEMS.map((item) => (
          <button key={item.key} style={tabStyle(item.key)} onClick={() => onTabChange(item.key)}>
            [{item.label}]
          </button>
        ))}
        <button
          style={{
            ...tabStyle("basic" as DetailTab),
            marginLeft: "auto",
            color: T.textSub,
            borderBottom: "2px solid transparent",
          }}
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
              <div key={key} style={{ marginBottom: "4px" }}>
                <div>
                  {res.label}: {res.value}/{res.max}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "12px",
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
              </div>
            ))}
          </Section>

          <Section title={t("section.clothing")}>
            {clothing.map((slot) => (
              <div key={slot.slot} style={{ color: slot.occluded ? T.textFaint : slot.itemId ? T.text : T.textDim }}>
                {slot.slotLabel}:{" "}
                {slot.occluded ? (
                  t("ui.occluded")
                ) : slot.itemId ? (
                  <>
                    [{slot.itemName}]{slot.state === "halfWorn" && <span style={{ color: T.danger }}> {t("ui.halfWorn")}</span>}
                    {slot.state === "off" && <span style={{ color: T.danger }}> {t("ui.off")}</span>}
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "2px 12px",
              }}
            >
              {abilities.map((ab) => (
                <div key={ab.key}>
                  {ab.label}: {ab.grade} <span style={{ color: T.textSub }}>{ab.exp}</span>
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
                  <div key={exp.key} style={{ marginBottom: "6px" }}>
                    <div>
                      {exp.label}: <span style={{ color: T.accent }}>{exp.count}</span>{t("ui.times")}
                    </div>
                    {exp.first && (
                      <div style={{ color: T.textSub, fontSize: "11px", paddingLeft: "12px" }}>
                        {t("charPanel.firstTime", { time: exp.first.time ?? "" })}
                        {exp.first.location && t("charPanel.atLocation", { location: exp.first.location })}
                        {exp.first.target && t("charPanel.withTarget", { target: exp.first.target })}
                      </div>
                    )}
                  </div>
                ))
            ) : (
              <div style={{ color: T.textDim }}>{t("empty.noExpRecord")}</div>
            )
          ) : (
            <div style={{ color: T.textDim }}>{t("empty.noExpDefShort")}</div>
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
            <div style={{ color: T.textDim }}>{t("ui.none")}</div>
          )}
        </Section>
      )}

      {activeTab === "social" && (
        <Section title={t("section.socialRel")}>
          {favorability && favorability.length > 0 ? (
            favorability.map((fav) => (
              <div key={fav.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ minWidth: "60px" }}>{fav.name}:</span>
                <div
                  style={{
                    flex: 1,
                    height: "12px",
                    backgroundColor: T.border,
                    borderRadius: "2px",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, (fav.value / 1000) * 100))}%`,
                      height: "100%",
                      backgroundColor: T.textSub,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <span style={{ color: T.textSub, fontSize: "12px", minWidth: "30px", textAlign: "right" }}>
                  {fav.value}
                </span>
              </div>
            ))
          ) : (
            <div style={{ color: T.textDim }}>{t("empty.social")}</div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div
        style={{
          color: T.accent,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: "4px",
          paddingBottom: "2px",
          fontWeight: "bold",
        }}
      >
        == {title} ==
      </div>
      {children}
    </div>
  );
}
