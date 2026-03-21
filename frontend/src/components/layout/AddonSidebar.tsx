import { useState, useEffect, useCallback, useRef } from "react";
import { t } from "../../i18n/ui";
import type { AddonInfo } from "../../types/game";
import {
  fetchAddons,
  fetchAddonVersions,
  fetchAddonVersionsDetail,
  forkAddon,
  deleteAddonAll,
} from "../../api/client";
import type { AddonVersionInfo } from "../../api/client";
import T from "../../theme";
import { Overlay, ConfirmModal } from "../shared/Modal";
import CreateAddonModal from "./CreateAddonModal";
import DependencyModal from "./DependencyModal";
import NewVersionModal from "./NewVersionModal";
import AddonMetaEditor from "./AddonMetaEditor";
import VersionManagePanel from "./VersionManagePanel";

interface AddonSidebarProps {
  enabledAddons: { id: string; version: string }[];
  stagedAddons: { id: string; version: string }[];
  onStagedChange: (addons: { id: string; version: string }[]) => void;
  worldId: string;
}

/* ── Helpers ───────────────────────────────────────── */

export function getBaseVersion(version: string): string {
  const parts = version.split("-");
  if (parts.length >= 2 && parts[0].includes(".")) return parts[0];
  return version;
}

function isWorldFork(version: string): boolean {
  return getBaseVersion(version) !== version;
}

/* ── Shared style ─────────────────────────────────── */

export const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  fontSize: "11px",
  backgroundColor: T.bg1,
  color: T.text,
  border: `1px solid ${T.borderDim}`,
  borderRadius: "3px",
  outline: "none",
  boxSizing: "border-box",
};

/* ── Toggle Switch ─────────────────────────────────── */

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      style={{
        width: "34px",
        height: "18px",
        borderRadius: "9px",
        border: `1.5px solid ${enabled ? T.accent : T.textFaint}`,
        background: enabled ? `${T.accent}30` : T.bg1,
        position: "relative",
        cursor: "pointer",
        padding: 0,
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          background: enabled ? T.accent : T.textFaint,
          position: "absolute",
          top: "2px",
          left: enabled ? "18px" : "2px",
          transition: "all 0.2s",
        }}
      />
    </button>
  );
}

/* ── Modals ─────────────────────────────────────────── */

function ForkModal({
  addon,
  versions,
  worldId,
  onChoice,
  onCancel,
}: {
  addon: AddonInfo;
  versions: AddonVersionInfo[];
  worldId: string;
  onChoice: (createFork: boolean, selectedVersion: string) => void;
  onCancel: () => void;
}) {
  const defaultVer = addon.version;
  const [selectedVersion, setSelectedVersion] = useState(defaultVer);

  const grouped = groupVersions(versions);
  const choiceBtn: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    textAlign: "left",
    border: "none",
  };
  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{t("addon.enableTitle")}</div>
      <div style={{ color: T.text, fontSize: "12px" }}>
        {t("addon.enableIntroPre")} <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span>
        {t("addon.enableIntroPost")}
      </div>
      {/* Version selector */}
      <div style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: "10px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {grouped.map(({ info, indent }) => (
            <VersionRow
              key={info.version}
              ver={info.version}
              indent={indent}
              isCurrent={info.version === selectedVersion}
              isBase={!info.forkedFrom}
              onClick={() => setSelectedVersion(info.version)}
            />
          ))}
        </div>
      </div>
      <button
        onClick={() => onChoice(true, selectedVersion)}
        style={{ ...choiceBtn, backgroundColor: T.bg3, color: T.success, border: `1px solid ${T.successDim}` }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{t("addon.createFork")}</div>
        <div style={{ color: T.successDim, fontSize: "11px" }}>
          {t("addon.forkDescPre")}{" "}
          <span style={{ color: T.success }}>
            v{selectedVersion}-{worldId}
          </span>
          {t("addon.forkDescPost")}
        </div>
      </button>
      <button
        onClick={() => onChoice(false, selectedVersion)}
        style={{ ...choiceBtn, backgroundColor: T.bg3, color: T.accent, border: `1px solid ${T.accentDim}` }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{t("addon.useExisting")}</div>
        <div style={{ color: T.accentDim, fontSize: "11px" }}>
          {t("addon.useExistingDescPre")} <span style={{ color: T.accent }}>v{selectedVersion}</span>
          {t("addon.useExistingDescPost")}
        </div>
      </button>
      <button
        onClick={onCancel}
        style={{
          ...choiceBtn,
          backgroundColor: "transparent",
          color: T.textSub,
          border: `1px solid ${T.textFaint}`,
          textAlign: "center",
          padding: "8px",
        }}
      >
        {t("btn.cancel")}
      </button>
    </Overlay>
  );
}

/* ── Version Switch List (clean, read-only) ───────── */

function VersionSwitchList({
  addonId,
  selectedVersion,
  onSwitch,
}: {
  addonId: string;
  selectedVersion: string;
  onSwitch: (version: string) => void;
}) {
  const [versions, setVersions] = useState<AddonVersionInfo[]>([]);

  useEffect(() => {
    fetchAddonVersionsDetail(addonId).then(setVersions);
  }, [addonId]);

  const grouped = groupVersions(versions);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "2px", fontWeight: "bold" }}>{t("addon.switchVersion")}</div>
      {versions.length === 0 ? (
        <div style={{ fontSize: "11px", color: T.textFaint, padding: "2px 0" }}>{t("addon.noVersions")}</div>
      ) : (
        grouped.map(({ info: vi, indent }) => {
          const ver = vi.version;
          const isCurrent = ver === selectedVersion;
          const isBase = !vi.forkedFrom;
          return (
            <VersionRow
              key={ver}
              ver={ver}
              indent={indent}
              isCurrent={isCurrent}
              isBase={isBase}
              onClick={() => !isCurrent && onSwitch(ver)}
            />
          );
        })
      )}
    </div>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        backgroundColor: active ? T.bg2 : T.bg1,
        color: active ? T.accent : T.textSub,
        border: `1px solid ${active ? T.accent + "60" : T.borderDim}`,
        borderBottom: active ? `2px solid ${T.accent}` : `1px solid ${T.borderDim}`,
        borderRadius: "3px",
      }}
    >
      {label}
    </button>
  );
}

export function MiniBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 8px",
        fontSize: "10px",
        cursor: "pointer",
        backgroundColor: active ? T.bg2 : T.bg1,
        color: active ? T.accent : T.textSub,
        border: `1px solid ${active ? T.accent + "40" : T.borderDim}`,
        borderRadius: "3px",
      }}
    >
      {children}
    </button>
  );
}

/* ── Shared: group versions into tree ─────────────── */

export function groupVersions(versions: AddonVersionInfo[]): { info: AddonVersionInfo; indent: boolean }[] {
  const bases = versions.filter((v) => !v.forkedFrom);
  const branches = versions.filter((v) => v.forkedFrom);
  const grouped: { info: AddonVersionInfo; indent: boolean }[] = [];
  const assigned = new Set<string>();
  for (const base of bases) {
    grouped.push({ info: base, indent: false });
    for (const br of branches.filter((b) => b.forkedFrom === base.version)) {
      grouped.push({ info: br, indent: true });
      assigned.add(br.version);
    }
  }
  for (const br of branches) {
    if (!assigned.has(br.version)) grouped.push({ info: br, indent: true });
  }
  return grouped;
}

/* ── Shared version row (for switch list) ─────────── */

function VersionRow({
  ver,
  indent,
  isCurrent,
  isBase,
  onClick,
}: {
  ver: string;
  indent: boolean;
  isCurrent: boolean;
  isBase: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 8px",
        borderRadius: "4px",
        marginLeft: indent ? "14px" : 0,
        backgroundColor: isCurrent ? T.bg2 : T.bg1,
        border: `1px solid ${isCurrent ? T.borderLight : T.borderDim}`,
        cursor: isCurrent ? "default" : "pointer",
        fontSize: "11px",
      }}
    >
      {indent && <span style={{ color: T.textFaint, fontSize: "10px", marginRight: "-2px" }}>└</span>}
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          flexShrink: 0,
          border: `2px solid ${isCurrent ? T.accent : T.textFaint}`,
          backgroundColor: isCurrent ? T.accent : "transparent",
        }}
      />
      <span
        style={{
          color: T.text,
          fontWeight: isCurrent ? "bold" : "normal",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ver}
      </span>
      {isCurrent && <Tag color={T.accent}>{t("addon.tagCurrent")}</Tag>}
      {isBase && <Tag color={T.successDim}>{t("addon.tagBase")}</Tag>}
      {!isBase && <Tag color="#6ab">{t("addon.tagBranch")}</Tag>}
    </div>
  );
}

export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "11px",
        padding: "1px 6px",
        borderRadius: "3px",
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
        lineHeight: 1.4,
        fontWeight: "bold",
      }}
    >
      {children}
    </span>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function AddonSidebar({ enabledAddons, stagedAddons, onStagedChange, worldId }: AddonSidebarProps) {
  const [allAddons, setAllAddons] = useState<AddonInfo[]>([]);
  const [coverRefresh, setCoverRefresh] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forkPrompt, setForkPrompt] = useState<{ addon: AddonInfo; versions: AddonVersionInfo[] } | null>(null);
  const [disablePrompt, setDisablePrompt] = useState<{ addon: AddonInfo } | null>(null);
  const [depPrompt, setDepPrompt] = useState<{ addon: AddonInfo; missing: AddonInfo[]; action: "enable" } | null>(null);
  const [depDisablePrompt, setDepDisablePrompt] = useState<{
    addon: AddonInfo;
    dependents: AddonInfo[];
    action: "disable";
  } | null>(null);
  const [newVersionPrompt, setNewVersionPrompt] = useState<{
    addonId: string;
    sourceVersion: string;
    existingVersions: string[];
  } | null>(null);
  const [editingMetaId, setEditingMetaId] = useState<string | null>(null);
  const [versionManageId, setVersionManageId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteAddonConfirm, setDeleteAddonConfirm] = useState<AddonInfo | null>(null);
  // Track pending version switch while dep prompt is shown
  const pendingVersionSwitch = useRef<{ addonId: string; newVersion: string } | null>(null);

  const refresh = useCallback(() => {
    fetchAddons().then((addons) => {
      const enabledMap = new Map(enabledAddons.map((a) => [a.id, a.version]));
      const byId = new Map<string, AddonInfo>();
      for (const addon of addons) {
        const existing = byId.get(addon.id);
        if (!existing) {
          byId.set(addon.id, addon);
        } else {
          const enabledVer = enabledMap.get(addon.id);
          if (enabledVer === addon.version) {
            byId.set(addon.id, addon);
          } else if (!enabledVer) {
            const existingBase = getBaseVersion(existing.version);
            if (existingBase !== existing.version && getBaseVersion(addon.version) === addon.version) {
              byId.set(addon.id, addon);
            }
          }
        }
      }
      setAllAddons(Array.from(byId.values()));
    });
  }, [enabledAddons]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isStagedEnabled = (addonId: string) => stagedAddons.some((a) => a.id === addonId);

  // ── Dependency helpers ──

  /** Recursively collect all missing dependencies for an addon */
  const collectMissingDeps = (addon: AddonInfo, staged: { id: string }[]): AddonInfo[] => {
    const stagedIds = new Set(staged.map((a) => a.id));
    const collected = new Map<string, AddonInfo>();
    const visit = (a: AddonInfo) => {
      for (const dep of a.dependencies ?? []) {
        if (stagedIds.has(dep.id) || collected.has(dep.id)) continue;
        const depAddon = allAddons.find((x) => x.id === dep.id);
        if (depAddon) {
          collected.set(dep.id, depAddon);
          visit(depAddon); // recurse into dependency's dependencies
        }
      }
    };
    visit(addon);
    return Array.from(collected.values());
  };

  /** Find all staged addons that depend on the given addon (recursively) */
  const collectDependents = (addonId: string, staged: { id: string }[]): AddonInfo[] => {
    const toDisable = new Set<string>();
    const visit = (id: string) => {
      for (const s of staged) {
        if (toDisable.has(s.id) || s.id === addonId) continue;
        const info = allAddons.find((x) => x.id === s.id);
        if (info?.dependencies?.some((d) => d.id === id)) {
          toDisable.add(s.id);
          visit(s.id); // recurse: addons depending on this dependent
        }
      }
    };
    visit(addonId);
    return Array.from(toDisable)
      .map((id) => allAddons.find((x) => x.id === id)!)
      .filter(Boolean);
  };

  // ── Toggle handler ──

  const handleToggle = async (addon: AddonInfo) => {
    if (isStagedEnabled(addon.id)) {
      // Disabling — check dependents
      const dependents = collectDependents(addon.id, stagedAddons);
      if (dependents.length > 0) {
        setDepDisablePrompt({ addon, dependents, action: "disable" });
      } else {
        setDisablePrompt({ addon });
      }
      return;
    }

    // Enabling — check missing dependencies
    const missing = collectMissingDeps(addon, stagedAddons);
    if (missing.length > 0) {
      setDepPrompt({ addon, missing, action: "enable" });
    } else {
      // No missing deps, proceed directly
      await startEnableAddon(addon);
    }
  };

  /** Start enabling an addon (check fork, show fork prompt if needed) */
  const startEnableAddon = async (addon: AddonInfo) => {
    const versionsDetail = await fetchAddonVersionsDetail(addon.id);
    const versionNames = versionsDetail.map((v) => v.version);
    const baseVer = getBaseVersion(addon.version);
    const forkVersion = `${baseVer}-${worldId}`;
    if (versionNames.includes(forkVersion)) {
      onStagedChange([...stagedAddons, { id: addon.id, version: forkVersion }]);
    } else {
      setForkPrompt({ addon: { ...addon, version: baseVer }, versions: versionsDetail });
    }
  };

  /** Handle "chain enable" — auto-fork & enable all missing deps, then enable main addon */
  /** Apply the main addon after deps are resolved (enable or version switch) */
  const applyMainAddon = (addon: AddonInfo, newStaged: { id: string; version: string }[]) => {
    const vsRef = pendingVersionSwitch.current;
    if (vsRef) {
      // Version switch: replace version in staged
      pendingVersionSwitch.current = null;
      onStagedChange(newStaged.map((a) => (a.id === vsRef.addonId ? { ...a, version: vsRef.newVersion } : a)));
    } else {
      // New enable: add addon (already in newStaged or needs fork prompt)
      onStagedChange(newStaged);
    }
  };

  const handleChainEnable = async () => {
    if (!depPrompt) return;
    const { addon, missing } = depPrompt;
    setDepPrompt(null);

    // Auto-enable all deps: use existing fork or create one automatically
    let newStaged = [...stagedAddons];
    for (const dep of missing) {
      if (newStaged.some((s) => s.id === dep.id)) continue; // already staged
      const versions = await fetchAddonVersions(dep.id);
      const baseVer = getBaseVersion(dep.version);
      const forkVersion = `${baseVer}-${worldId}`;
      if (versions.includes(forkVersion)) {
        newStaged = [...newStaged, { id: dep.id, version: forkVersion }];
      } else {
        const result = await forkAddon(dep.id, baseVer, worldId);
        if (result.success && result.newVersion) {
          newStaged = [...newStaged, { id: dep.id, version: result.newVersion }];
        } else {
          newStaged = [...newStaged, { id: dep.id, version: baseVer }];
        }
      }
    }

    if (pendingVersionSwitch.current) {
      // Version switch: just apply with deps enabled
      applyMainAddon(addon, newStaged);
    } else {
      // New enable: handle main addon fork
      const versionsDetail = await fetchAddonVersionsDetail(addon.id);
      const versionNames = versionsDetail.map((v) => v.version);
      const baseVer = getBaseVersion(addon.version);
      const forkVersion = `${baseVer}-${worldId}`;
      if (versionNames.includes(forkVersion)) {
        newStaged = [...newStaged, { id: addon.id, version: forkVersion }];
        onStagedChange(newStaged);
      } else {
        onStagedChange(newStaged);
        setForkPrompt({ addon: { ...addon, version: baseVer }, versions: versionsDetail });
      }
    }
    refresh();
  };

  /** Handle "enable/switch only this" — skip deps */
  const handleEnableOnly = async () => {
    if (!depPrompt) return;
    const { addon } = depPrompt;
    setDepPrompt(null);
    if (pendingVersionSwitch.current) {
      const vsRef = pendingVersionSwitch.current;
      pendingVersionSwitch.current = null;
      onStagedChange(stagedAddons.map((a) => (a.id === vsRef.addonId ? { ...a, version: vsRef.newVersion } : a)));
    } else {
      await startEnableAddon(addon);
    }
  };

  const handleForkChoice = async (createFork: boolean, selectedVersion: string) => {
    if (!forkPrompt) return;
    const { addon } = forkPrompt;
    if (createFork) {
      const result = await forkAddon(addon.id, selectedVersion, worldId);
      if (result.success && result.newVersion) {
        onStagedChange([...stagedAddons, { id: addon.id, version: result.newVersion }]);
        refresh();
      } else {
        alert(result.message ?? "Fork failed");
      }
    } else {
      onStagedChange([...stagedAddons, { id: addon.id, version: selectedVersion }]);
    }
    setForkPrompt(null);
  };

  const handleDisableConfirm = () => {
    if (!disablePrompt) return;
    onStagedChange(stagedAddons.filter((a) => a.id !== disablePrompt.addon.id));
    setDisablePrompt(null);
  };

  const handleDeleteAddon = async () => {
    if (!deleteAddonConfirm) return;
    const addon = deleteAddonConfirm;
    setDeleteAddonConfirm(null);
    const result = await deleteAddonAll(addon.id);
    if (!result.success) {
      alert(result.message);
      return;
    }
    setExpandedId(null);
    refresh();
  };

  /** Handle "chain disable" — disable addon + all its dependents */
  const handleChainDisable = () => {
    if (!depDisablePrompt) return;
    const { addon, dependents } = depDisablePrompt;
    const removeIds = new Set([addon.id, ...dependents.map((d) => d.id)]);
    onStagedChange(stagedAddons.filter((a) => !removeIds.has(a.id)));
    setDepDisablePrompt(null);
  };

  /** Handle "disable only this" — skip dependents */
  const handleDisableOnly = () => {
    if (!depDisablePrompt) return;
    onStagedChange(stagedAddons.filter((a) => a.id !== depDisablePrompt.addon.id));
    setDepDisablePrompt(null);
  };

  const handleVersionSwitch = async (addonId: string, newVersion: string) => {
    // Fetch all addons to get the target version's dependency info
    const allVersions = await fetchAddons();
    const targetAddon = allVersions.find((a) => a.id === addonId && a.version === newVersion);
    if (targetAddon) {
      // Check dependencies of the new version against currently staged addons
      // (exclude the addon being switched itself from staged for the check)
      const stagedWithoutSelf = stagedAddons.filter((a) => a.id !== addonId);
      const missing = collectMissingDeps(targetAddon, stagedWithoutSelf);
      if (missing.length > 0) {
        // Reuse enable dep prompt — but the action is just switching version
        setDepPrompt({ addon: targetAddon, missing, action: "enable" });
        // Override handlers: chain enable deps, then switch version
        pendingVersionSwitch.current = { addonId, newVersion };
        return;
      }
    }
    onStagedChange(stagedAddons.map((a) => (a.id === addonId ? { ...a, version: newVersion } : a)));
  };

  return (
    <>
      {forkPrompt && (
        <ForkModal
          addon={forkPrompt.addon}
          versions={forkPrompt.versions}
          worldId={worldId}
          onChoice={handleForkChoice}
          onCancel={() => setForkPrompt(null)}
        />
      )}
      {disablePrompt && (
        <ConfirmModal
          title={t("addon.disableTitle")}
          message={t("addon.disableMsg", { name: disablePrompt.addon.name })}
          confirmLabel={t("addon.confirmDisable")}
          danger
          onConfirm={handleDisableConfirm}
          onCancel={() => setDisablePrompt(null)}
        />
      )}

      {depPrompt && (
        <DependencyModal
          action="enable"
          addon={depPrompt.addon}
          related={depPrompt.missing}
          onChain={handleChainEnable}
          onOnly={handleEnableOnly}
          onCancel={() => {
            setDepPrompt(null);
            pendingVersionSwitch.current = null;
          }}
        />
      )}

      {depDisablePrompt && (
        <DependencyModal
          action="disable"
          addon={depDisablePrompt.addon}
          related={depDisablePrompt.dependents}
          onChain={handleChainDisable}
          onOnly={handleDisableOnly}
          onCancel={() => setDepDisablePrompt(null)}
        />
      )}

      {newVersionPrompt && (
        <NewVersionModal
          addonId={newVersionPrompt.addonId}
          sourceVersion={newVersionPrompt.sourceVersion}
          existingVersions={newVersionPrompt.existingVersions}
          onCreated={(newVer) => {
            setNewVersionPrompt(null);
            refresh();
            // If currently enabled, switch to the new version
            const stagedRef = stagedAddons.find((a) => a.id === newVersionPrompt.addonId);
            if (stagedRef) {
              onStagedChange(
                stagedAddons.map((a) => (a.id === newVersionPrompt.addonId ? { ...a, version: newVer } : a)),
              );
            }
          }}
          onCancel={() => setNewVersionPrompt(null)}
        />
      )}

      {showCreateModal && (
        <CreateAddonModal
          onCreated={() => {
            setShowCreateModal(false);
            refresh();
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
      {deleteAddonConfirm && (
        <ConfirmModal
          title={t("addon.deleteTitle")}
          message={t("addon.deleteMsg", { name: deleteAddonConfirm.name, id: deleteAddonConfirm.id })}
          confirmLabel={t("addon.confirmDelete")}
          danger
          onConfirm={handleDeleteAddon}
          onCancel={() => setDeleteAddonConfirm(null)}
        />
      )}

      <div
        style={{
          width: "100%",
          height: "100vh",
          borderLeft: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          fontSize: "12px",
          overflow: "hidden",
          paddingTop: 40,
          boxSizing: "border-box",
          backgroundColor: T.bg0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${T.borderDim}`,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ color: T.accent, fontSize: "13px", fontWeight: "bold" }}>Add-on</span>
          <span style={{ color: T.textDim, fontSize: "11px" }}>({allAddons.length})</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              background: "none",
              border: `1px solid ${T.textFaint}`,
              borderRadius: "3px",
              color: T.textSub,
              cursor: "pointer",
              padding: "1px 7px",
              fontSize: "13px",
              lineHeight: 1.2,
            }}
          >
            +
          </button>
        </div>

        {/* Addon cards */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "scroll",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {allAddons.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: "11px", padding: "16px 8px", textAlign: "center" }}>
              {t("addon.noAddons")}
            </div>
          ) : (
            allAddons.map((addon) => {
              const enabled = isStagedEnabled(addon.id);
              const expanded = expandedId === addon.id;
              const stagedRef = stagedAddons.find((a) => a.id === addon.id);
              const displayVersion = stagedRef?.version ?? addon.version;
              const isFork = isWorldFork(displayVersion);

              return (
                <div
                  key={`${addon.id}@${addon.version}`}
                  style={{
                    borderRadius: "6px",
                    border: `1px solid ${enabled ? T.borderLight : T.borderDim}`,
                  }}
                >
                  {/* Card header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      backgroundColor: enabled ? T.bg1 : T.bg1,
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedId(expanded ? null : addon.id)}
                  >
                    {addon.cover ? (
                      <img
                        src={`/assets/${addon.id}/covers/${addon.cover}?t=${coverRefresh}`}
                        alt=""
                        style={{
                          width: "64px",
                          height: "64px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          border: `1px solid ${T.borderDim}`,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "4px",
                          border: `1px solid ${T.borderDim}`,
                          flexShrink: 0,
                          backgroundColor: T.bg2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "24px",
                          fontWeight: "bold",
                          color: T.textDim,
                        }}
                      >
                        {(addon.name || addon.id || "?")[0]}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: enabled ? T.text : T.textSub,
                          fontWeight: "bold",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {addon.name}
                      </div>
                      <div style={{ fontSize: "11px", color: T.textSub, marginTop: "2px" }}>{addon.id}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                        <span style={{ fontSize: "11px", color: T.text }}>v{displayVersion}</span>
                        {isFork && <Tag color="#6ab">{t("addon.tagBranch")}</Tag>}
                      </div>
                    </div>

                    <ToggleSwitch enabled={enabled} onChange={() => handleToggle(addon)} />
                    <span style={{ color: T.textDim, fontSize: "11px", flexShrink: 0 }}>
                      {expanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </div>

                  {/* Expanded panel */}
                  {expanded && (
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: T.bg0,
                        borderTop: `1px solid ${T.borderDim}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        fontSize: "11px",
                      }}
                    >
                      {addon.description && (
                        <div style={{ color: T.textSub, lineHeight: 1.5 }}>{addon.description}</div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {addon.author && <InfoRow label={t("field.author")} value={addon.author} />}
                        {addon.categories && addon.categories.length > 0 && (
                          <InfoRow label={t("field.contents")} value={addon.categories.join(", ")} />
                        )}
                        {addon.dependencies && addon.dependencies.length > 0 && (
                          <InfoRow label={t("field.dependencies")} value={addon.dependencies.map((d) => d.id).join(", ")} />
                        )}
                      </div>

                      {/* Toggle buttons */}
                      <div style={{ display: "flex", gap: "4px" }}>
                        <ToggleBtn
                          label={t("btn.editInfo")}
                          active={editingMetaId === addon.id}
                          onClick={() => {
                            setEditingMetaId(editingMetaId === addon.id ? null : addon.id);
                            setVersionManageId(null);
                          }}
                        />
                        <ToggleBtn
                          label={t("addon.versionMgmt")}
                          active={versionManageId === addon.id}
                          onClick={() => {
                            setVersionManageId(versionManageId === addon.id ? null : addon.id);
                            setEditingMetaId(null);
                          }}
                        />
                        <span style={{ flex: 1 }} />
                        {!enabled && (
                          <button
                            onClick={() => setDeleteAddonConfirm(addon)}
                            style={{
                              padding: "3px 8px",
                              fontSize: "11px",
                              cursor: "pointer",
                              backgroundColor: T.bg2,
                              color: T.danger,
                              border: `1px solid ${T.border}`,
                              borderRadius: "3px",
                            }}
                          >
                            [{t("btn.delete")}]
                          </button>
                        )}
                      </div>

                      {/* Edit meta panel */}
                      {editingMetaId === addon.id && (
                        <div style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: "10px" }}>
                          <AddonMetaEditor
                            addon={addon}
                            displayVersion={displayVersion}
                            onUpdated={() => { refresh(); setCoverRefresh(Date.now()); }}
                            onClose={() => setEditingMetaId(null)}
                          />
                        </div>
                      )}

                      {/* Version management panel */}
                      {versionManageId === addon.id && (
                        <div style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: "10px" }}>
                          <VersionManagePanel
                            addonId={addon.id}
                            selectedVersion={displayVersion}
                            onNewVersion={async () => {
                              const vers = await fetchAddonVersions(addon.id);
                              setNewVersionPrompt({
                                addonId: addon.id,
                                sourceVersion: displayVersion,
                                existingVersions: vers,
                              });
                            }}
                            onRefresh={refresh}
                          />
                        </div>
                      )}

                      {/* Version switch list (when management panel is closed) */}
                      {enabled && versionManageId !== addon.id && (
                        <div style={{ borderTop: `1px solid ${T.borderDim}`, paddingTop: "8px" }}>
                          <VersionSwitchList
                            addonId={addon.id}
                            selectedVersion={displayVersion}
                            onSwitch={(ver) => handleVersionSwitch(addon.id, ver)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
      <span style={{ color: T.textSub, width: "30px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.text }}>{value}</span>
    </div>
  );
}
