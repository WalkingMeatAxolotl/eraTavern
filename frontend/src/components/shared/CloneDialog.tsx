import { useState } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { Overlay, modalBtnStyle } from "./Modal";

/**
 * Self-contained clone button + dialog.
 *
 * Usage in any editor:
 *   <CloneButton
 *     addonIds={addonIds}
 *     defaultAddon={entity.source}
 *     getData={() => ({ name, tags, ... })}   // current editor fields (no id/source)
 *     createFn={(data) => createItemDef(data)} // API call
 *     onSuccess={onBack}
 *   />
 */

interface CloneButtonProps {
  addonIds: string[];
  defaultAddon: string;
  /** Return current editor data WITHOUT id and source — those come from the dialog. */
  getData: () => Record<string, unknown>;
  /** API create function. Receives { ...getData(), id: localId, source: addonId }. */
  createFn: (data: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
  onSuccess: () => void;
  /** Optional custom button style */
  buttonStyle?: React.CSSProperties;
  /** Optional button className */
  className?: string;
}

export default function CloneButton({
  addonIds,
  defaultAddon,
  getData,
  createFn,
  onSuccess,
  buttonStyle,
  className,
}: CloneButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <button
        className={className}
        onClick={() => { setOpen(true); setError(""); }}
        style={buttonStyle ?? {
          padding: "5px 16px",
          backgroundColor: T.bg2,
          color: T.accent,
          border: `1px solid ${T.border}`,
          borderRadius: "3px",
          cursor: "pointer",
          fontSize: "13px",
        }}
      >
        [{t("btn.clone")}]
      </button>
      {open && (
        <CloneDialog
          addonIds={addonIds}
          defaultAddon={defaultAddon}
          error={error}
          onCancel={() => setOpen(false)}
          onConfirm={async (addonId, localId) => {
            const data = { ...getData(), id: localId, source: addonId };
            const result = await createFn(data);
            if (result.success) {
              setOpen(false);
              onSuccess();
            } else {
              setError(result.message);
            }
          }}
        />
      )}
    </>
  );
}

/* ── Dialog (internal) ────────────────────────────── */

function CloneDialog({
  addonIds,
  defaultAddon,
  error,
  onConfirm,
  onCancel,
}: {
  addonIds: string[];
  defaultAddon: string;
  error: string;
  onConfirm: (addonId: string, localId: string) => void;
  onCancel: () => void;
}) {
  const [addon, setAddon] = useState(defaultAddon);
  const [localId, setLocalId] = useState("");

  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{t("clone.title")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div>
          <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "4px" }}>{t("clone.addonLabel")}</div>
          <select
            value={addon}
            onChange={(e) => setAddon(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              backgroundColor: T.bg3,
              color: T.text,
              border: `1px solid ${T.borderLight}`,
              borderRadius: "3px",
              fontSize: "12px",
              boxSizing: "border-box",
            }}
          >
            {addonIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "4px" }}>{t("clone.idLabel")}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span
              style={{
                padding: "6px 2px 6px 8px",
                backgroundColor: T.bg2,
                color: T.textDim,
                border: `1px solid ${T.borderLight}`,
                borderRight: "none",
                borderRadius: "3px 0 0 3px",
                fontSize: "12px",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {addon}.
            </span>
            <input
              autoFocus
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && localId.trim()) onConfirm(addon, localId.trim());
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                backgroundColor: T.bg3,
                color: T.text,
                border: `1px solid ${T.borderLight}`,
                borderRadius: "0 3px 3px 0",
                fontSize: "12px",
                boxSizing: "border-box",
                minWidth: 0,
              }}
            />
          </div>
        </div>
      </div>
      {error && <div style={{ color: T.danger, fontSize: "12px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>
          [{t("btn.cancel")}]
        </button>
        <button
          onClick={() => localId.trim() && onConfirm(addon, localId.trim())}
          disabled={!localId.trim()}
          style={{
            ...modalBtnStyle(T.bg2, T.accent),
            cursor: localId.trim() ? "pointer" : "not-allowed",
          }}
        >
          [{t("btn.confirm")}]
        </button>
      </div>
    </Overlay>
  );
}
