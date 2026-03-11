import { useState } from "react";
import { saveSession } from "../api/client";

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
      setMessage(`保存失败: ${e}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    border: "1px solid #333",
    borderRadius: "3px",
    cursor: busy ? "not-allowed" : "pointer",
    fontFamily: "monospace",
    fontSize: "12px",
    opacity: busy ? 0.6 : 1,
    backgroundColor: "#16213e",
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
        backgroundColor: "#0a0a1aee",
        border: "1px solid #333",
        borderRadius: "6px",
        zIndex: 90,
        fontFamily: "monospace",
        fontSize: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <button
        onClick={onRevert}
        disabled={busy}
        style={{ ...btnStyle, color: "#888" }}
      >
        [撤销变更]
      </button>
      <button
        onClick={handleSave}
        disabled={busy}
        style={{ ...btnStyle, color: "#e94560" }}
      >
        {busy ? "保存中..." : "[保存变更]"}
      </button>
      {message && (
        <span
          style={{
            color: message.includes("失败") ? "#e94560" : "#0f0",
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
