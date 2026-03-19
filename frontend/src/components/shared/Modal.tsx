import T from "../../theme";
import { t } from "../../i18n/ui";

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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: T.bg2,
          border: `1px solid ${T.textFaint}`,
          borderRadius: "8px",
          padding: "24px",
          width: "380px",
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
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
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{title}</div>
      <div style={{ color: T.text, fontSize: "12px", lineHeight: 1.6 }}>{message}</div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>
          {t("btn.modalCancel")}
        </button>
        <button onClick={onConfirm} style={modalBtnStyle(danger ? T.dangerBg : T.bg2, danger ? T.danger : T.success)}>
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}
