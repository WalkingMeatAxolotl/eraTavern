import { useState } from "react";
import { saveSession } from "../../api/client";
import { t } from "../../i18n/ui";
import T from "../../theme";

interface FloatingActionsProps {
  dirty: boolean;
  hasAddonChanges: boolean;
  stagedAddons: { id: string; version: string }[];
  worldId: string;
  onApplied: () => void;
  onRevert: () => void;
}

export default function FloatingActions({
  dirty,
  hasAddonChanges,
  stagedAddons,
  worldId,
  onApplied,
  onRevert,
}: FloatingActionsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const visible = (dirty || hasAddonChanges) && !!worldId;
  if (!visible) return null;

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await saveSession(hasAddonChanges ? stagedAddons : undefined);
      setMessage(result.success ? result.message : result.message);
      onApplied();
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    cursor: busy ? "not-allowed" : "pointer",
    fontSize: "12px",
    opacity: busy ? 0.6 : 1,
    backgroundColor: T.bg2,
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        backgroundColor: T.bgFloat,
        border: `1px solid ${T.border}`,
        borderRadius: "6px",
        zIndex: 90,
        fontSize: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <span style={{ color: T.textDim, fontSize: "11px", whiteSpace: "nowrap" }}>{t("ui.unsavedChanges")}</span>
      <button
        onClick={onRevert}
        disabled={busy}
        style={{ ...btnStyle, color: T.textSub }}
        title={t("ui.discardTip")}
      >
        [{t("btn.revert")}]
      </button>
      <button
        onClick={handleSave}
        disabled={busy}
        style={{ ...btnStyle, color: T.accent }}
        title={t("ui.saveTip")}
      >
        {busy ? t("status.saving") : `[${t("btn.saveChanges")}]`}
      </button>
      {message && (
        <span
          style={{
            color: message.includes(t("ui.failedKeyword")) ? T.danger : T.success,
            fontSize: "11px",
            whiteSpace: "nowrap",
          }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
