import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import { t } from "../../i18n/ui";
import { useConfirm } from "../shared/useConfirm";
import { fetchAddonVersionsDetail, overwriteAddonVersion, deleteAddon } from "../../api/client";
import type { AddonVersionInfo } from "../../api/client";
import { modalBtnStyle } from "../shared/Modal";
import { groupVersions, MiniBtn, Tag } from "./AddonSidebar";
import T from "../../theme";
import s from "./VersionManagePanel.module.css";

export default function VersionManagePanel({
  addonId,
  selectedVersion,
  onNewVersion,
  onRefresh,
}: {
  addonId: string;
  selectedVersion: string;
  onNewVersion: () => void;
  onRefresh: () => void;
}) {
  const [versions, setVersions] = useState<AddonVersionInfo[]>([]);
  const [copySource, setCopySource] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUI, showConfirm] = useConfirm();

  const loadVersions = useCallback(() => {
    fetchAddonVersionsDetail(addonId).then(setVersions);
  }, [addonId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const grouped = groupVersions(versions);

  const handleCopy = (target: string) => {
    if (!copySource || copySource === target) return;
    showConfirm(
      { title: t("confirm.title"), message: t("confirm.overwriteAddonVer", { source: copySource, target }), confirmLabel: t("btn.overwrite"), danger: true },
      async () => {
        setBusy(true);
        const result = await overwriteAddonVersion(addonId, copySource, target);
        setBusy(false);
        if (!result.success) {
          alert(result.message);
          return;
        }
        setCopySource(null);
        loadVersions();
        onRefresh();
      },
    );
  };

  const handleDelete = async (ver: string) => {
    setDeleteConfirm(null);
    setBusy(true);
    const result = await deleteAddon(addonId, ver);
    setBusy(false);
    if (!result.success) {
      alert(result.message);
      return;
    }
    loadVersions();
    onRefresh();
  };

  return (
    <div className={s.container}>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <MiniBtn onClick={onNewVersion}>{t("addon.newVersion")}</MiniBtn>
        <MiniBtn active={copySource !== null} onClick={() => setCopySource(copySource ? null : selectedVersion)}>
          {copySource ? t("addon.cancelCopy") : t("addon.copyContent")}
        </MiniBtn>
      </div>

      {copySource && (
        <div className={s.copySourceBanner}>
          {t("addon.copySource", { source: copySource })}
        </div>
      )}

      {/* Version list */}
      {grouped.map(({ info: vi, indent }) => {
        const ver = vi.version;
        const isCurrent = ver === selectedVersion;
        const isBase = !vi.forkedFrom;
        const isCopyTarget = copySource !== null && copySource !== ver;

        return (
          <div
            key={ver}
            className={clsx(
              s.versionItem,
              indent && s.versionItemIndent,
              isCopyTarget && s.versionItemCopyTarget,
            )}
            style={{ opacity: busy ? 0.5 : 1 }}
            onClick={() => isCopyTarget && handleCopy(ver)}
          >
            {indent && <span className={s.indentArrow}>{"\u2514"}</span>}

            <span className={clsx(s.versionLabel, isCurrent && s.versionLabelCurrent)}>
              {ver}
            </span>

            {isCurrent && <Tag color={T.accent}>{t("addon.tagCurrent")}</Tag>}
            {isBase && <Tag color={T.successDim}>{t("addon.tagBase")}</Tag>}
            {!isBase && <Tag color="#6ab">{t("addon.tagBranch")}</Tag>}

            {isCopyTarget && <span className={s.pasteHint}>{t("addon.paste")}</span>}

            {/* Copy source selector (when in copy mode, click to change source) */}
            {copySource && copySource === ver && <Tag color={T.accent}>{t("addon.tagSource")}</Tag>}

            {/* Delete — only non-current */}
            {!copySource && !isCurrent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirm(ver);
                }}
                className={s.deleteItemBtn}
              >
                {t("btn.delete")}
              </button>
            )}
          </div>
        );
      })}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className={s.deleteConfirm}>
          <div>
            {t("addon.confirmDeleteVer", { version: deleteConfirm })}
          </div>
          <div className={s.deleteConfirmActions}>
            <button
              onClick={() => setDeleteConfirm(null)}
              style={{ ...modalBtnStyle("var(--bg2)", "var(--text-sub)"), padding: "3px 10px", fontSize: "11px" }}
            >
              {t("btn.cancel")}
            </button>
            <button
              onClick={() => handleDelete(deleteConfirm)}
              style={{ ...modalBtnStyle("var(--danger-bg)", "var(--danger)"), padding: "3px 10px", fontSize: "11px" }}
            >
              {t("btn.delete")}
            </button>
          </div>
        </div>
      )}
      {confirmUI}
    </div>
  );
}
