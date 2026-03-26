import { useState } from "react";
import clsx from "clsx";
import { saveSession } from "../../api/client";
import { t } from "../../i18n/ui";
import s from "./FloatingActions.module.css";

interface FloatingActionsProps {
  dirty: boolean;
  hasAddonChanges: boolean;
  stagedAddons: { id: string; version: string }[];
  worldId: string;
  onApplied: () => void;
  onRevert: () => void | Promise<void>;
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

  return (
    <div className={s.bar}>
      <span className={s.hint}>{t("ui.unsavedChanges")}</span>
      <button
        onClick={async () => {
          if (busy) return;
          if (!confirm(t("ui.confirmDiscard"))) return;
          setBusy(true);
          try {
            await onRevert();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className={clsx(s.actionBtn, s.revertBtn, busy && s.actionBtnDisabled)}
        title={t("ui.discardTip")}
      >
        [{t("btn.revert")}]
      </button>
      <button
        onClick={handleSave}
        disabled={busy}
        className={clsx(s.actionBtn, s.saveBtn, busy && s.actionBtnDisabled)}
        title={t("ui.saveTip")}
      >
        {busy ? t("status.saving") : `[${t("btn.saveChanges")}]`}
      </button>
      {message && (
        <span className={message.includes(t("ui.failedKeyword")) ? s.msgError : s.msgSuccess}>{message}</span>
      )}
    </div>
  );
}
