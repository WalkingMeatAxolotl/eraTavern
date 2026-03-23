import { useState } from "react";
import { t } from "../../i18n/ui";
import { copyAddonVersion } from "../../api/client";
import { Overlay, modalBtnStyle } from "../shared/Modal";
import ms from "../shared/Modal.module.css";
import { getBaseVersion } from "./AddonSidebar";
import clsx from "clsx";
import s from "./NewVersionModal.module.css";

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
      <div className={s.title}>{t("addon.createNewVersion")}</div>
      <div className={s.subtitle}>
        {t("addon.basedOn", { source: `${addonId}@${sourceVersion}` })}
      </div>

      {/* Mode tabs */}
      <div className={s.modeTabs}>
        {(["bump", "branch"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(s.modeTab, mode === m ? s.modeTabActive : s.modeTabInactive)}
          >
            {m === "bump" ? t("addon.modeBump") : t("addon.modeBranch")}
          </button>
        ))}
      </div>

      {mode === "bump" ? (
        <div className={s.fieldGroup}>
          <div className={s.hint}>{t("addon.bumpHint")}</div>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder={t("addon.egVersion")}
            className={clsx(s.fieldInput, s.fieldInputLg)}
          />
        </div>
      ) : (
        <div className={s.fieldGroup}>
          <div className={s.hint}>{t("addon.branchHint")}</div>
          <div className={s.branchRow}>
            <span className={s.branchPrefix}>{getBaseVersion(sourceVersion)}-</span>
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="my-branch"
              className={clsx(s.fieldInput, s.fieldInputLg)}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      )}

      {conflict && <div className={s.errorMsg}>{t("addon.versionExists", { version: targetVersion })}</div>}
      {error && <div className={s.errorMsg}>{error}</div>}

      <div className={s.actions}>
        <button onClick={onCancel} className={ms.modalBtn} style={modalBtnStyle("var(--border-dim)", "var(--text-sub)")}>
          {t("btn.cancel")}
        </button>
        <button
          onClick={handleCreate}
          disabled={!valid || conflict || saving}
          className={ms.modalBtn}
          style={{
            ...modalBtnStyle("var(--bg2)", "var(--success)"),
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
