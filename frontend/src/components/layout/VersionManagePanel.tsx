import { useState, useEffect, useCallback } from "react";
import { t } from "../../i18n/ui";
import { fetchAddonVersionsDetail, overwriteAddonVersion, deleteAddon } from "../../api/client";
import type { AddonVersionInfo } from "../../api/client";
import T from "../../theme";
import { modalBtnStyle } from "../shared/Modal";
import { groupVersions, MiniBtn, Tag } from "./AddonSidebar";

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

  const loadVersions = useCallback(() => {
    fetchAddonVersionsDetail(addonId).then(setVersions);
  }, [addonId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const grouped = groupVersions(versions);

  const handleCopy = async (target: string) => {
    if (!copySource || copySource === target) return;
    if (!confirm(t("confirm.overwriteAddonVer", { source: copySource, target }))) return;
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
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        <MiniBtn onClick={onNewVersion}>{t("addon.newVersion")}</MiniBtn>
        <MiniBtn active={copySource !== null} onClick={() => setCopySource(copySource ? null : selectedVersion)}>
          {copySource ? t("addon.cancelCopy") : t("addon.copyContent")}
        </MiniBtn>
      </div>

      {copySource && (
        <div
          style={{
            padding: "4px 8px",
            backgroundColor: `${T.accent}15`,
            borderRadius: "3px",
            fontSize: "10px",
            color: T.accent,
          }}
        >
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "4px",
              marginLeft: indent ? "14px" : 0,
              backgroundColor: isCopyTarget ? `${T.accent}10` : T.bg1,
              border: `1px solid ${isCopyTarget ? T.accent + "40" : T.borderDim}`,
              cursor: isCopyTarget ? "pointer" : "default",
              fontSize: "11px",
              opacity: busy ? 0.5 : 1,
            }}
            onClick={() => isCopyTarget && handleCopy(ver)}
          >
            {indent && <span style={{ color: T.textFaint, fontSize: "10px", marginRight: "-2px" }}>└</span>}

            <span
              style={{
                flex: 1,
                color: T.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: isCurrent ? "bold" : "normal",
              }}
            >
              {ver}
            </span>

            {isCurrent && <Tag color={T.accent}>{t("addon.tagCurrent")}</Tag>}
            {isBase && <Tag color={T.successDim}>{t("addon.tagBase")}</Tag>}
            {!isBase && <Tag color="#6ab">{t("addon.tagBranch")}</Tag>}

            {isCopyTarget && <span style={{ color: T.accent, fontSize: "10px", flexShrink: 0 }}>{t("addon.paste")}</span>}

            {/* Copy source selector (when in copy mode, click to change source) */}
            {copySource && copySource === ver && <Tag color={T.accent}>{t("addon.tagSource")}</Tag>}

            {/* Delete — only non-current */}
            {!copySource && !isCurrent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirm(ver);
                }}
                style={{
                  background: "none",
                  border: `1px solid ${T.danger}30`,
                  padding: "1px 5px",
                  color: T.danger,
                  cursor: "pointer",
                  fontSize: "10px",
                  borderRadius: "3px",
                  flexShrink: 0,
                  opacity: 0.6,
                }}
              >
                {t("btn.delete")}
              </button>
            )}
          </div>
        );
      })}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          style={{
            padding: "6px 8px",
            backgroundColor: T.dangerBg,
            borderRadius: "4px",
            border: `1px solid ${T.danger}40`,
            fontSize: "11px",
            color: T.text,
          }}
        >
          <div>
            {t("addon.confirmDeleteVer", { version: deleteConfirm })}
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", justifyContent: "flex-end" }}>
            <button
              onClick={() => setDeleteConfirm(null)}
              style={{ ...modalBtnStyle(T.bg2, T.textSub), padding: "3px 10px", fontSize: "11px" }}
            >
              {t("btn.cancel")}
            </button>
            <button
              onClick={() => handleDelete(deleteConfirm)}
              style={{ ...modalBtnStyle(T.dangerBg, T.danger), padding: "3px 10px", fontSize: "11px" }}
            >
              {t("btn.delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
