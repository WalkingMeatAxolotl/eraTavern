import { useState, useEffect, useCallback, useRef } from "react";
import type { AddonInfo } from "../types/game";
import { fetchAddons, fetchAddonVersions, forkAddon } from "../api/client";
import T from "../theme";

interface AddonSidebarProps {
  enabledAddons: { id: string; version: string }[];
  stagedAddons: { id: string; version: string }[];
  onStagedChange: (addons: { id: string; version: string }[]) => void;
  worldId: string;
}

/* ── Helpers ───────────────────────────────────────── */

function getBaseVersion(version: string): string {
  const parts = version.split("-");
  if (parts.length >= 2 && parts[0].includes(".")) return parts[0];
  return version;
}

function isWorldFork(version: string): boolean {
  return getBaseVersion(version) !== version;
}

function getForkWorldId(version: string): string | null {
  if (!isWorldFork(version)) return null;
  return version.slice(getBaseVersion(version).length + 1);
}

/* ── Toggle Switch ─────────────────────────────────── */

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{
        width: "34px", height: "18px", borderRadius: "9px",
        border: `1.5px solid ${enabled ? T.accent : T.textFaint}`,
        background: enabled ? `${T.accent}30` : T.bg1,
        position: "relative", cursor: "pointer", padding: 0,
        transition: "all 0.2s",
      }}
    >
      <div style={{
        width: "12px", height: "12px", borderRadius: "50%",
        background: enabled ? T.accent : T.textFaint,
        position: "absolute", top: "2px",
        left: enabled ? "18px" : "2px",
        transition: "all 0.2s",
      }} />
    </button>
  );
}

/* ── Modals ─────────────────────────────────────────── */

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: T.bg2, border: `1px solid ${T.textFaint}`, borderRadius: "8px",
          padding: "24px", width: "380px", maxWidth: "90vw",
          display: "flex", flexDirection: "column", gap: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{title}</div>
      <div style={{ color: T.text, fontSize: "12px", lineHeight: 1.6 }}>{message}</div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>取消</button>
        <button onClick={onConfirm} style={modalBtnStyle(danger ? T.dangerBg : T.bg2, danger ? T.danger : T.success)}>
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

function ForkModal({ addon, worldId, onChoice, onCancel }: {
  addon: AddonInfo; worldId: string;
  onChoice: (createFork: boolean) => void; onCancel: () => void;
}) {
  const choiceBtn: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: "6px", cursor: "pointer",
    fontSize: "12px", textAlign: "left", border: "none",
  };
  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>
        启用 Add-on
      </div>
      <div style={{ color: T.text, fontSize: "12px" }}>
        首次在此世界启用 <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span>
      </div>
      <button onClick={() => onChoice(true)}
        style={{ ...choiceBtn, backgroundColor: T.bg3, color: T.success, border: `1px solid ${T.successDim}` }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>创建世界专属分支</div>
        <div style={{ color: T.successDim, fontSize: "11px" }}>
          复制为 <span style={{ color: T.success }}>v{addon.version}-{worldId}</span>，修改不影响其他世界
        </div>
      </button>
      <button onClick={() => onChoice(false)}
        style={{ ...choiceBtn, backgroundColor: T.bg3, color: T.accent, border: `1px solid ${T.accentDim}` }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>直接使用原版本</div>
        <div style={{ color: T.accentDim, fontSize: "11px" }}>
          使用 <span style={{ color: T.accent }}>v{addon.version}</span>，修改会影响所有使用此版本的世界
        </div>
      </button>
      <button onClick={onCancel}
        style={{ ...choiceBtn, backgroundColor: "transparent", color: T.textSub, border: `1px solid ${T.textFaint}`, textAlign: "center", padding: "8px" }}
      >
        取消
      </button>
    </Overlay>
  );
}

function modalBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: "7px 16px", backgroundColor: bg, color, border: `1px solid ${T.textFaint}`,
    borderRadius: "4px", cursor: "pointer", fontSize: "12px",
  };
}

function DependencyModal({ action, addon, related, onChain, onOnly, onCancel }: {
  action: "enable" | "disable";
  addon: AddonInfo;
  related: AddonInfo[];
  onChain: () => void;
  onOnly: () => void;
  onCancel: () => void;
}) {
  const isEnable = action === "enable";
  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>
        {isEnable ? "依赖检查" : "依赖警告"}
      </div>
      <div style={{ color: T.text, fontSize: "12px", lineHeight: 1.6 }}>
        {isEnable
          ? <>启用 <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span> 需要以下依赖：</>
          : <>以下 Add-on 依赖 <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span>：</>
        }
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: "4px",
        padding: "8px", backgroundColor: T.bg1, borderRadius: "4px",
        maxHeight: "200px", overflowY: "auto",
      }}>
        {related.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <span style={{ color: isEnable ? T.accent : T.danger, fontWeight: "bold" }}>{r.name}</span>
            <span style={{ color: T.textDim, fontSize: "11px" }}>({r.id})</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button onClick={onChain}
          style={{
            ...modalBtnStyle(isEnable ? T.bg2 : T.dangerBg, isEnable ? T.success : T.danger),
            width: "100%", textAlign: "center",
          }}>
          {isEnable
            ? `全部启用 (${related.length + 1} 个)`
            : `全部禁用 (${related.length + 1} 个)`
          }
        </button>
        <button onClick={onOnly}
          style={{
            ...modalBtnStyle(T.bg2, T.accent),
            width: "100%", textAlign: "center",
          }}>
          {isEnable ? `仅启用 ${addon.name}` : `仅禁用 ${addon.name}`}
        </button>
        <button onClick={onCancel}
          style={{
            ...modalBtnStyle("transparent", T.textSub),
            width: "100%", textAlign: "center", border: `1px solid ${T.textFaint}`,
          }}>
          取消
        </button>
      </div>
    </Overlay>
  );
}

/* ── Version Branches ──────────────────────────────── */

const VERSIONS_PER_PAGE = 5;

function VersionBranches({ addonId, committedVersion, selectedVersion, onSwitch }: {
  addonId: string;
  committedVersion: string;
  selectedVersion: string;
  onSwitch: (version: string) => void;
}) {
  const [versions, setVersions] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchAddonVersions(addonId).then(setVersions);
  }, [addonId, committedVersion]);

  if (versions.length <= 1) return null;

  const baseVer = getBaseVersion(committedVersion);

  const sorted = [...versions].sort((a, b) => {
    const aIsBase = a === baseVer;
    const bIsBase = b === baseVer;
    if (aIsBase !== bIsBase) return aIsBase ? -1 : 1;
    return a.localeCompare(b);
  });

  const totalPages = Math.ceil(sorted.length / VERSIONS_PER_PAGE);
  const paged = sorted.slice(page * VERSIONS_PER_PAGE, (page + 1) * VERSIONS_PER_PAGE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "2px", fontWeight: "bold" }}>
        切换版本
      </div>
      {paged.map((ver) => {
        const isCurrent = ver === selectedVersion;
        const isBase = ver === baseVer && !isWorldFork(ver);
        const isForkVer = isWorldFork(ver);

        return (
          <div
            key={ver}
            onClick={() => !isCurrent && onSwitch(ver)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "5px 8px", borderRadius: "4px",
              backgroundColor: isCurrent ? T.bg2 : T.bg1,
              border: `1px solid ${isCurrent ? T.borderLight : T.borderDim}`,
              cursor: isCurrent ? "default" : "pointer",
              fontSize: "11px",
            }}
          >
            {/* Radio-style indicator */}
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
              border: `2px solid ${isCurrent ? T.accent : T.textFaint}`,
              backgroundColor: isCurrent ? T.accent : "transparent",
            }} />

            {/* Version string */}
            <span style={{
              color: isCurrent ? T.text : T.text,
              fontWeight: isCurrent ? "bold" : "normal",
              flex: 1,
            }}>
              {ver}
            </span>

            {/* Tag */}
            {isCurrent && <Tag color={T.accent}>当前</Tag>}
            {isBase && !isCurrent && <Tag color={T.textSub}>本体</Tag>}
            {isForkVer && !isCurrent && !isBase && <Tag color="#6ab">分支</Tag>}
          </div>
        );
      })}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center", marginTop: "4px" }}>
          <PagerBtn disabled={page === 0} onClick={() => setPage(p => p - 1)}>&lt;</PagerBtn>
          <span style={{ color: T.textSub, fontSize: "11px" }}>{page + 1} / {totalPages}</span>
          <PagerBtn disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>&gt;</PagerBtn>
        </div>
      )}
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: "11px", padding: "1px 6px", borderRadius: "3px",
      backgroundColor: `${color}20`, color, border: `1px solid ${color}40`,
      lineHeight: 1.4, fontWeight: "bold",
    }}>
      {children}
    </span>
  );
}

function PagerBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled} onClick={onClick}
      style={{
        background: "none", border: `1px solid ${T.textFaint}`,
        color: disabled ? T.border : T.textSub,
        cursor: disabled ? "default" : "pointer",
        padding: "2px 8px", borderRadius: "3px",
        fontSize: "11px",
      }}
    >
      {children}
    </button>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function AddonSidebar({ enabledAddons, stagedAddons, onStagedChange, worldId }: AddonSidebarProps) {
  const [allAddons, setAllAddons] = useState<AddonInfo[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forkPrompt, setForkPrompt] = useState<{ addon: AddonInfo } | null>(null);
  const [disablePrompt, setDisablePrompt] = useState<{ addon: AddonInfo } | null>(null);
  const [depPrompt, setDepPrompt] = useState<{ addon: AddonInfo; missing: AddonInfo[]; action: "enable" } | null>(null);
  const [depDisablePrompt, setDepDisablePrompt] = useState<{ addon: AddonInfo; dependents: AddonInfo[]; action: "disable" } | null>(null);
  // Track pending version switch while dep prompt is shown
  const pendingVersionSwitch = useRef<{ addonId: string; newVersion: string } | null>(null);

  const refresh = useCallback(() => {
    fetchAddons().then((addons) => {
      const enabledMap = new Map(enabledAddons.map(a => [a.id, a.version]));
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

  useEffect(() => { refresh(); }, [refresh]);

  const isStagedEnabled = (addonId: string) =>
    stagedAddons.some((a) => a.id === addonId);

  // ── Dependency helpers ──

  /** Recursively collect all missing dependencies for an addon */
  const collectMissingDeps = (addon: AddonInfo, staged: { id: string }[]): AddonInfo[] => {
    const stagedIds = new Set(staged.map(a => a.id));
    const collected = new Map<string, AddonInfo>();
    const visit = (a: AddonInfo) => {
      for (const dep of a.dependencies ?? []) {
        if (stagedIds.has(dep.id) || collected.has(dep.id)) continue;
        const depAddon = allAddons.find(x => x.id === dep.id);
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
        const info = allAddons.find(x => x.id === s.id);
        if (info?.dependencies?.some(d => d.id === id)) {
          toDisable.add(s.id);
          visit(s.id); // recurse: addons depending on this dependent
        }
      }
    };
    visit(addonId);
    return Array.from(toDisable).map(id => allAddons.find(x => x.id === id)!).filter(Boolean);
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
    const versions = await fetchAddonVersions(addon.id);
    const baseVer = getBaseVersion(addon.version);
    const forkVersion = `${baseVer}-${worldId}`;
    if (versions.includes(forkVersion)) {
      onStagedChange([...stagedAddons, { id: addon.id, version: forkVersion }]);
    } else {
      setForkPrompt({ addon: { ...addon, version: baseVer } });
    }
  };

  /** Handle "chain enable" — auto-fork & enable all missing deps, then enable main addon */
  /** Apply the main addon after deps are resolved (enable or version switch) */
  const applyMainAddon = (addon: AddonInfo, newStaged: { id: string; version: string }[]) => {
    const vsRef = pendingVersionSwitch.current;
    if (vsRef) {
      // Version switch: replace version in staged
      pendingVersionSwitch.current = null;
      onStagedChange(newStaged.map(a =>
        a.id === vsRef.addonId ? { ...a, version: vsRef.newVersion } : a
      ));
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
      if (newStaged.some(s => s.id === dep.id)) continue; // already staged
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
      const versions = await fetchAddonVersions(addon.id);
      const baseVer = getBaseVersion(addon.version);
      const forkVersion = `${baseVer}-${worldId}`;
      if (versions.includes(forkVersion)) {
        newStaged = [...newStaged, { id: addon.id, version: forkVersion }];
        onStagedChange(newStaged);
      } else {
        onStagedChange(newStaged);
        setForkPrompt({ addon: { ...addon, version: baseVer } });
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
      onStagedChange(stagedAddons.map(a =>
        a.id === vsRef.addonId ? { ...a, version: vsRef.newVersion } : a
      ));
    } else {
      await startEnableAddon(addon);
    }
  };

  const handleForkChoice = async (createFork: boolean) => {
    if (!forkPrompt) return;
    const { addon } = forkPrompt;
    if (createFork) {
      const result = await forkAddon(addon.id, addon.version, worldId);
      if (result.success && result.newVersion) {
        onStagedChange([...stagedAddons, { id: addon.id, version: result.newVersion }]);
        refresh();
      } else {
        alert(result.message ?? "Fork failed");
      }
    } else {
      onStagedChange([...stagedAddons, { id: addon.id, version: addon.version }]);
    }
    setForkPrompt(null);
  };

  const handleDisableConfirm = () => {
    if (!disablePrompt) return;
    onStagedChange(stagedAddons.filter((a) => a.id !== disablePrompt.addon.id));
    setDisablePrompt(null);
  };

  /** Handle "chain disable" — disable addon + all its dependents */
  const handleChainDisable = () => {
    if (!depDisablePrompt) return;
    const { addon, dependents } = depDisablePrompt;
    const removeIds = new Set([addon.id, ...dependents.map(d => d.id)]);
    onStagedChange(stagedAddons.filter(a => !removeIds.has(a.id)));
    setDepDisablePrompt(null);
  };

  /** Handle "disable only this" — skip dependents */
  const handleDisableOnly = () => {
    if (!depDisablePrompt) return;
    onStagedChange(stagedAddons.filter(a => a.id !== depDisablePrompt.addon.id));
    setDepDisablePrompt(null);
  };

  const handleVersionSwitch = async (addonId: string, newVersion: string) => {
    // Fetch all addons to get the target version's dependency info
    const allVersions = await fetchAddons();
    const targetAddon = allVersions.find(a => a.id === addonId && a.version === newVersion);
    if (targetAddon) {
      // Check dependencies of the new version against currently staged addons
      // (exclude the addon being switched itself from staged for the check)
      const stagedWithoutSelf = stagedAddons.filter(a => a.id !== addonId);
      const missing = collectMissingDeps(targetAddon, stagedWithoutSelf);
      if (missing.length > 0) {
        // Reuse enable dep prompt — but the action is just switching version
        setDepPrompt({ addon: targetAddon, missing, action: "enable" });
        // Override handlers: chain enable deps, then switch version
        pendingVersionSwitch.current = { addonId, newVersion };
        return;
      }
    }
    onStagedChange(stagedAddons.map(a =>
      a.id === addonId ? { ...a, version: newVersion } : a
    ));
  };

  return (
    <>
      {forkPrompt && (
        <ForkModal
          addon={forkPrompt.addon} worldId={worldId}
          onChoice={handleForkChoice} onCancel={() => setForkPrompt(null)}
        />
      )}
      {disablePrompt && (
        <ConfirmModal
          title="禁用 Add-on"
          message={`确认禁用「${disablePrompt.addon.name}」？禁用后该 Add-on 的内容将从当前世界移除。`}
          confirmLabel="确认禁用" danger
          onConfirm={handleDisableConfirm} onCancel={() => setDisablePrompt(null)}
        />
      )}

      {depPrompt && (
        <DependencyModal
          action="enable"
          addon={depPrompt.addon}
          related={depPrompt.missing}
          onChain={handleChainEnable}
          onOnly={handleEnableOnly}
          onCancel={() => { setDepPrompt(null); pendingVersionSwitch.current = null; }}
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

      <div style={{
        width: "100%", height: "100vh", borderLeft: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", fontSize: "12px",
        overflow: "hidden", paddingTop: 40, boxSizing: "border-box",
        backgroundColor: T.bg0,
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 12px", borderBottom: `1px solid ${T.borderDim}`,
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          <span style={{ color: T.accent, fontSize: "13px", fontWeight: "bold" }}>Add-on</span>
          <span style={{ color: T.textDim, fontSize: "11px" }}>({allAddons.length})</span>
        </div>

        {/* Addon cards */}
        <div style={{
          flex: 1, overflowY: "scroll", padding: "8px",
          display: "flex", flexDirection: "column", gap: "8px",
        }}>
          {allAddons.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: "11px", padding: "16px 8px", textAlign: "center" }}>
              没有已安装的 Add-on
            </div>
          ) : (
            allAddons.map((addon) => {
              const enabled = isStagedEnabled(addon.id);
              const expanded = expandedId === addon.id;
              const stagedRef = stagedAddons.find(a => a.id === addon.id);
              const displayVersion = stagedRef?.version ?? addon.version;
              const isFork = isWorldFork(displayVersion);

              return (
                <div
                  key={`${addon.id}@${addon.version}`}
                  style={{
                    borderRadius: "6px",
                    border: `1px solid ${enabled ? T.borderLight : T.borderDim}`,
                    overflow: "hidden",
                  }}
                >
                  {/* Card header */}
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "8px 10px",
                      backgroundColor: enabled ? T.bg1 : T.bg1,
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedId(expanded ? null : addon.id)}
                  >
                    <ToggleSwitch enabled={enabled} onChange={() => handleToggle(addon)} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name */}
                      <div style={{
                        fontSize: "12px",
                        color: enabled ? T.text : T.textSub,
                        fontWeight: "bold",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {addon.name}
                      </div>
                      {/* ID + Version */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        marginTop: "3px",
                      }}>
                        <span style={{ fontSize: "11px", color: T.textDim }}>{addon.id}</span>
                        <span style={{ color: T.textFaint, fontSize: "11px" }}>/</span>
                        <span style={{ fontSize: "11px", color: T.text }}>
                          v{displayVersion}
                        </span>
                        {isFork && <Tag color="#6ab">分支</Tag>}
                      </div>
                    </div>

                    <span style={{ color: T.textDim, fontSize: "11px", flexShrink: 0 }}>
                      {expanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </div>

                  {/* Expanded panel */}
                  {expanded && (
                    <div style={{
                      padding: "10px 12px",
                      backgroundColor: T.bg0,
                      borderTop: `1px solid ${T.borderDim}`,
                      display: "flex", flexDirection: "column", gap: "8px",
                      fontSize: "11px",
                    }}>
                      {addon.description && (
                        <div style={{ color: T.textSub, lineHeight: 1.5 }}>{addon.description}</div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {addon.author && (
                          <InfoRow label="作者" value={addon.author} />
                        )}
                        {addon.categories && addon.categories.length > 0 && (
                          <InfoRow label="内容" value={addon.categories.join(", ")} />
                        )}
                        {addon.dependencies && addon.dependencies.length > 0 && (
                          <InfoRow label="依赖" value={addon.dependencies.map(d => d.id).join(", ")} />
                        )}
                      </div>

                      {enabled && (() => {
                        const enabledRef = enabledAddons.find(a => a.id === addon.id);
                        const committedVer = enabledRef?.version ?? addon.version;
                        return (
                          <div style={{ borderTop: `1px solid ${T.borderDim}`, paddingTop: "8px" }}>
                            <VersionBranches
                              addonId={addon.id}
                              committedVersion={committedVer}
                              selectedVersion={displayVersion}
                              onSwitch={(ver) => handleVersionSwitch(addon.id, ver)}
                            />
                          </div>
                        );
                      })()}
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
