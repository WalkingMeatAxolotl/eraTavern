import { useState } from "react";
import { rebuildSession, saveSession } from "../api/client";

interface FloatingActionsProps {
  dirty: boolean;
  hasAddonChanges: boolean;
  stagedAddons: { id: string; version: string }[];
  worldId: string;
  onApplied: () => void;
}

export default function FloatingActions({
  dirty,
  hasAddonChanges,
  stagedAddons,
  worldId,
  onApplied,
}: FloatingActionsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const visible = (dirty || hasAddonChanges) && !!worldId;
  if (!visible) return null;

  const handleRebuild = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await rebuildSession(
        hasAddonChanges ? stagedAddons : undefined,
      );
      setMessage(result.success ? result.message : result.message);
      onApplied();
    } catch (e) {
      setMessage(`应用失败: ${e}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      // If addon list changed, update refs before save
      if (hasAddonChanges) {
        // Save will call rebuild() internally, but we need to pass addon changes
        // Use rebuild first with addon changes, then save
        await rebuildSession(stagedAddons);
      }
      const result = await saveSession();
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
        onClick={handleRebuild}
        disabled={busy}
        style={{
          ...btnStyle,
          backgroundColor: "#1a2a1a",
          color: "#0f0",
          borderColor: "#2a4a2a",
        }}
      >
        {busy ? "处理中..." : "[应用世界变更]"}
      </button>
      <button
        onClick={handleSave}
        disabled={busy}
        style={{
          ...btnStyle,
          backgroundColor: "#16213e",
          color: "#e94560",
          borderColor: "#333",
        }}
      >
        [应用并保存世界变更]
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
