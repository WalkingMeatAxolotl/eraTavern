import clsx from "clsx";
import s from "./NavBar.module.css";
import { t } from "../../i18n/ui";

type NavPage =
  | "characters"
  | "traits"
  | "clothing"
  | "items"
  | "actions"
  | "variables"
  | "events"
  | "lorebook"
  | "maps"
  | "settings"
  | "llm"
  | "system";

interface NavBarProps {
  navPage: NavPage | null;
  onNavChange: (page: NavPage | null) => void;
  worldName: string;
  maxWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  aiOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleAi: () => void;
}

type NavItem = { key: NavPage; label: string };

const worldTabs: NavItem[] = [
  { key: "characters", label: t("nav.characters") },
  { key: "traits", label: t("nav.traits") },
  { key: "clothing", label: t("nav.clothing") },
  { key: "items", label: t("nav.items") },
  { key: "actions", label: t("nav.actions") },
  { key: "variables", label: t("nav.variables") },
  { key: "events", label: t("nav.events") },
  { key: "lorebook", label: t("nav.lorebook") },
  { key: "maps", label: t("nav.maps") },
  { key: "settings", label: t("nav.settings") },
];

const globalTabs: NavItem[] = [
  { key: "llm", label: t("nav.llm") },
  { key: "system", label: t("nav.system") },
];

export default function NavBar({
  navPage,
  onNavChange,
  worldName,
  maxWidth,
  leftOpen,
  rightOpen,
  aiOpen,
  onToggleLeft,
  onToggleRight,
  onToggleAi,
}: NavBarProps) {
  return (
    <div className={s.bar}>
      <div className={s.barInner} style={{ maxWidth }}>
        {/* Left: world toggle + world name + separator + nav tabs */}
        <div className={s.leftSection}>
          <button className={clsx(s.sideToggle, leftOpen && s.sideToggleActive)} onClick={onToggleLeft} data-label={`[${t("btn.world")}]`}>
            [{t("btn.world")}]
          </button>
          {worldName && <span className={s.worldName}>{worldName}</span>}
          <span className={s.separator}>|</span>
          {worldTabs.map((item) => (
            <button
              key={item.key}
              className={clsx(s.navBtn, navPage === item.key && s.navBtnActive)}
              onClick={() => onNavChange(navPage === item.key ? null : item.key)}
              data-label={`[${item.label}]`}
            >
              [{item.label}]
            </button>
          ))}
        </div>

        {/* Right: global tabs + addon toggle */}
        <div className={s.rightSection}>
          {globalTabs.map((item) => (
            <button
              key={item.key}
              className={clsx(s.navBtn, navPage === item.key && s.navBtnActive)}
              onClick={() => onNavChange(navPage === item.key ? null : item.key)}
              data-label={`[${item.label}]`}
            >
              [{item.label}]
            </button>
          ))}
          <span className={s.separator}>|</span>
          <button className={clsx(s.sideToggle, aiOpen && s.sideToggleActive)} onClick={onToggleAi} data-label={`[${t("btn.ai")}]`}>
            [{t("btn.ai")}]
          </button>
          <button className={clsx(s.sideToggle, rightOpen && s.sideToggleActive)} onClick={onToggleRight} data-label={`[${t("btn.addon")}]`}>
            [{t("btn.addon")}]
          </button>
        </div>
      </div>
    </div>
  );
}
