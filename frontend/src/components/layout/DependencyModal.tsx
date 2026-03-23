import { t } from "../../i18n/ui";
import type { AddonInfo } from "../../types/game";
import { Overlay, modalBtnStyle } from "../shared/Modal";
import ms from "../shared/Modal.module.css";
import clsx from "clsx";
import s from "./DependencyModal.module.css";

export default function DependencyModal({
  action,
  addon,
  related,
  onChain,
  onOnly,
  onCancel,
}: {
  action: "enable" | "disable";
  addon: AddonInfo;
  related: AddonInfo[];
  onChain: () => void;
  onOnly: () => void;
  onCancel: () => void;
}) {
  const isEnable = action === "enable";
  return (
    <Overlay onClose={onCancel}>
      <div className={s.title}>{isEnable ? t("addon.depCheck") : t("addon.depWarning")}</div>
      <div className={s.description}>
        {isEnable ? (
          <>
            {t("addon.depNeeded", { name: <span className={s.accentName}>{addon.name}</span> })}
          </>
        ) : (
          <>
            {t("addon.depBy", { name: <span className={s.accentName}>{addon.name}</span> })}
          </>
        )}
      </div>
      <div className={s.listPanel}>
        {related.map((r) => (
          <div key={r.id} className={s.listRow}>
            <span className={isEnable ? s.rowNameEnable : s.rowNameDisable}>{r.name}</span>
            <span className={s.rowId}>({r.id})</span>
          </div>
        ))}
      </div>
      <div className={s.btnGroup}>
        <button
          onClick={onChain}
          className={clsx(ms.modalBtn, s.fullBtn)}
          style={modalBtnStyle(isEnable ? "var(--bg2)" : "var(--danger-bg)", isEnable ? "var(--success)" : "var(--danger)")}
        >
          {isEnable ? t("addon.enableAll", { count: related.length + 1 }) : t("addon.disableAll", { count: related.length + 1 })}
        </button>
        <button
          onClick={onOnly}
          className={clsx(ms.modalBtn, s.fullBtn)}
          style={modalBtnStyle("var(--bg2)", "var(--accent)")}
        >
          {isEnable ? t("addon.enableOnly", { name: addon.name }) : t("addon.disableOnly", { name: addon.name })}
        </button>
        <button
          onClick={onCancel}
          className={clsx(ms.modalBtn, s.fullBtn)}
          style={{ ...modalBtnStyle("transparent", "var(--text-sub)"), border: "1px solid var(--text-faint)" }}
        >
          {t("btn.cancel")}
        </button>
      </div>
    </Overlay>
  );
}
