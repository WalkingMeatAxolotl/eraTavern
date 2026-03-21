import { useState } from "react";
import { t } from "../../i18n/ui";
import { copyAddonVersion } from "../../api/client";
import T from "../../theme";
import { Overlay, modalBtnStyle } from "../shared/Modal";
import { getBaseVersion, fieldInputStyle } from "./AddonSidebar";

export default function NewVersionModal({
  addonId,
  sourceVersion,
  existingVersions,
  onCreated,
  onCancel,
}: {
  addonId: string;
  sourceVersion: string;
  existingVersions: string[];
  onCreated: (newVersion: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"bump" | "branch">("bump");
  const [version, setVersion] = useState(() => {
    // Auto-suggest next patch version
    const base = getBaseVersion(sourceVersion);
    const parts = base.split(".");
    if (parts.length === 3) {
      parts[2] = String(Number(parts[2]) + 1);
      return parts.join(".");
    }
    return base + ".1";
  });
  const [branchName, setBranchName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetVersion = mode === "bump" ? version : `${getBaseVersion(sourceVersion)}-${branchName}`;
  const valid =
    mode === "bump"
      ? version.trim().length > 0 && /^\d+\.\d+\.\d+$/.test(version.trim())
      : branchName.trim().length > 0 && /^[a-zA-Z0-9_-]+$/.test(branchName.trim());
  const conflict = existingVersions.includes(targetVersion);

  const handleCreate = async () => {
    if (!valid || conflict) return;
    setSaving(true);
    setError("");
    try {
      const forkedFrom = mode === "branch" ? getBaseVersion(sourceVersion) : undefined;
      const result = await copyAddonVersion(addonId, sourceVersion, targetVersion, forkedFrom);
      if (result.success) {
        onCreated(targetVersion);
      } else {
        setError(result.message ?? t("addon.createFailed"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{t("addon.createNewVersion")}</div>
      <div style={{ color: T.textSub, fontSize: "11px" }}>
        {t("addon.basedOn", { source: `${addonId}@${sourceVersion}` })}
      </div>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: "4px" }}>
        {(["bump", "branch"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: "6px",
              fontSize: "12px",
              cursor: "pointer",
              backgroundColor: mode === m ? T.bg3 : T.bg1,
              color: mode === m ? T.text : T.textSub,
              border: `1px solid ${mode === m ? T.borderLight : T.borderDim}`,
              borderRadius: "4px",
            }}
          >
            {m === "bump" ? t("addon.modeBump") : t("addon.modeBranch")}
          </button>
        ))}
      </div>

      {mode === "bump" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ color: T.textSub, fontSize: "11px" }}>{t("addon.bumpHint")}</div>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder={t("addon.egVersion")}
            style={{ ...fieldInputStyle, fontSize: "13px", padding: "6px 8px" }}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ color: T.textSub, fontSize: "11px" }}>{t("addon.branchHint")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: T.textDim, fontSize: "12px" }}>{getBaseVersion(sourceVersion)}-</span>
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="my-branch"
              style={{ ...fieldInputStyle, fontSize: "13px", padding: "6px 8px", flex: 1 }}
            />
          </div>
        </div>
      )}

      {conflict && <div style={{ color: T.danger, fontSize: "11px" }}>{t("addon.versionExists", { version: targetVersion })}</div>}
      {error && <div style={{ color: T.danger, fontSize: "11px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>
          {t("btn.cancel")}
        </button>
        <button
          onClick={handleCreate}
          disabled={!valid || conflict || saving}
          style={{
            ...modalBtnStyle(T.bg2, T.success),
            opacity: !valid || conflict || saving ? 0.5 : 1,
            cursor: !valid || conflict || saving ? "default" : "pointer",
          }}
        >
          {saving ? t("btn.creating") : t("btn.create")}
        </button>
      </div>
    </Overlay>
  );
}
