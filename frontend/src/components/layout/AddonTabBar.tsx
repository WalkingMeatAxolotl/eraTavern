import clsx from "clsx";
import s from "./AddonTabBar.module.css";
import { t } from "../../i18n/ui";

interface AddonTabBarProps {
  addons: { id: string; version: string }[];
  selectedAddon: string | null; // null = "全部(只读)"
  onSelect: (addonId: string | null) => void;
}

export default function AddonTabBar({ addons, selectedAddon, onSelect }: AddonTabBarProps) {
  if (addons.length === 0) return null;

  return (
    <div className={s.container}>
      <button onClick={() => onSelect(null)} className={clsx(s.tab, selectedAddon === null && s.tabActive)}>
        [{t("addon.allReadOnly")}]
      </button>
      {addons.map((a) => (
        <button key={a.id} onClick={() => onSelect(a.id)} className={clsx(s.tab, selectedAddon === a.id && s.tabActive)}>
          {a.id}
        </button>
      ))}
    </div>
  );
}
