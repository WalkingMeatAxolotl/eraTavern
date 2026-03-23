import T from "../../theme";
import { t } from "../../i18n/ui";
import s from "./Modal.module.css";

export function modalBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: "7px 16px",
    backgroundColor: bg,
    color,
    border: `1px solid ${T.textFaint}`,
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
  };
}

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} className={s.backdrop}>
      <div onClick={(e) => e.stopPropagation()} className={s.modal}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <div className={s.modalTitle}>{title}</div>
      <div className={s.modalBody}>{message}</div>
      <div className={s.modalActions}>
        <button
          onClick={onCancel}
          className={s.modalBtn}
          style={{ backgroundColor: T.borderDim, color: T.textSub }}
        >
          {t("btn.modalCancel")}
        </button>
        <button
          onClick={onConfirm}
          className={s.modalBtn}
          style={{ backgroundColor: danger ? T.dangerBg : T.bg2, color: danger ? T.danger : T.success }}
        >
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}
