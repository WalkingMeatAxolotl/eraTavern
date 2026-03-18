import { useState, useEffect, useCallback, useRef } from "react";
import type { AddonInfo } from "../../types/game";
import {
  fetchAddons,
  fetchAddonVersions,
  fetchAddonVersionsDetail,
  forkAddon,
  updateAddonMeta,
  copyAddonVersion,
  overwriteAddonVersion,
  deleteAddon,
  createAddon,
  deleteAddonAll,
  uploadAsset,
} from "../../api/client";
import type { AddonVersionInfo } from "../../api/client";
import T from "../../theme";

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

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: T.bg2,
          border: `1px solid ${T.textFaint}`,
          borderRadius: "8px",
          padding: "24px",
          width: "380px",
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{title}</div>
      <div style={{ color: T.text, fontSize: "12px", lineHeight: 1.6 }}>{message}</div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>
          取消
        </button>
        <button onClick={onConfirm} style={modalBtnStyle(danger ? T.dangerBg : T.bg2, danger ? T.danger : T.success)}>
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

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
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>启用 Add-on</div>
      <div style={{ color: T.text, fontSize: "12px" }}>
        首次在此世界启用 <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span>，选择源版本：
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
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>创建世界专属分支</div>
        <div style={{ color: T.successDim, fontSize: "11px" }}>
          复制为{" "}
          <span style={{ color: T.success }}>
            v{selectedVersion}-{worldId}
          </span>
          ，修改不影响其他世界
        </div>
      </button>
      <button
        onClick={() => onChoice(false, selectedVersion)}
        style={{ ...choiceBtn, backgroundColor: T.bg3, color: T.accent, border: `1px solid ${T.accentDim}` }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>使用现有版本</div>
        <div style={{ color: T.accentDim, fontSize: "11px" }}>
          使用 <span style={{ color: T.accent }}>v{selectedVersion}</span>，修改会影响所有使用此版本的世界
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
        取消
      </button>
    </Overlay>
  );
}

function CreateAddonModal({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [busy, setBusy] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    fontSize: "12px",
    boxSizing: "border-box",
    backgroundColor: T.bg2,
    color: T.text,
    border: `1px solid ${T.borderDim}`,
    borderRadius: "4px",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: T.textSub,
    marginBottom: "2px",
  };

  const handleCreate = async () => {
    if (!id.trim() || !name.trim()) return;
    setBusy(true);
    const result = await createAddon({ id: id.trim(), name: name.trim(), version: version.trim() || "1.0.0" });
    setBusy(false);
    if (!result.success) {
      alert(result.message);
      return;
    }
    onCreated();
  };

  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>新建 Add-on</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div>
          <div style={labelStyle}>ID（唯一标识，不可修改）</div>
          <input style={inputStyle} value={id} onChange={(e) => setId(e.target.value)} placeholder="my-addon" />
        </div>
        <div>
          <div style={labelStyle}>名称</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="我的扩展包" />
        </div>
        <div>
          <div style={labelStyle}>初始版本</div>
          <input style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: T.textSub,
            border: `1px solid ${T.textFaint}`,
          }}
        >
          取消
        </button>
        <button
          onClick={handleCreate}
          disabled={busy || !id.trim() || !name.trim()}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor: T.accent,
            color: T.bg0,
            border: "none",
            opacity: busy || !id.trim() || !name.trim() ? 0.5 : 1,
          }}
        >
          {busy ? "创建中..." : "创建"}
        </button>
      </div>
    </Overlay>
  );
}

function modalBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: "7px 16px",
    backgroundColor: bg,
    color,
    border: `1px solid ${T.textFaint}`,
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
  };
}

function DependencyModal({
  action,
  addon,
  related,
  onChain,
  onOnly,
  onCancel,
}: {
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
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{isEnable ? "依赖检查" : "依赖警告"}</div>
      <div style={{ color: T.text, fontSize: "12px", lineHeight: 1.6 }}>
        {isEnable ? (
          <>
            启用 <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span> 需要以下依赖：
          </>
        ) : (
          <>
            以下 Add-on 依赖 <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span>：
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          padding: "8px",
          backgroundColor: T.bg1,
          borderRadius: "4px",
          maxHeight: "200px",
          overflowY: "auto",
        }}
      >
        {related.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <span style={{ color: isEnable ? T.accent : T.danger, fontWeight: "bold" }}>{r.name}</span>
            <span style={{ color: T.textDim, fontSize: "11px" }}>({r.id})</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={onChain}
          style={{
            ...modalBtnStyle(isEnable ? T.bg2 : T.dangerBg, isEnable ? T.success : T.danger),
            width: "100%",
            textAlign: "center",
          }}
        >
          {isEnable ? `全部启用 (${related.length + 1} 个)` : `全部禁用 (${related.length + 1} 个)`}
        </button>
        <button
          onClick={onOnly}
          style={{
            ...modalBtnStyle(T.bg2, T.accent),
            width: "100%",
            textAlign: "center",
          }}
        >
          {isEnable ? `仅启用 ${addon.name}` : `仅禁用 ${addon.name}`}
        </button>
        <button
          onClick={onCancel}
          style={{
            ...modalBtnStyle("transparent", T.textSub),
            width: "100%",
            textAlign: "center",
            border: `1px solid ${T.textFaint}`,
          }}
        >
          取消
        </button>
      </div>
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
      <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "2px", fontWeight: "bold" }}>切换版本</div>
      {versions.length === 0 ? (
        <div style={{ fontSize: "11px", color: T.textFaint, padding: "2px 0" }}>无版本</div>
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

/* ── Version Management Panel (dangerous ops) ─────── */

function VersionManagePanel({
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
    if (!confirm(`确认将 ${copySource} 的内容覆盖到 ${target}？\n目标版本的实体文件将被替换（元数据保留）。`)) return;
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
        <MiniBtn onClick={onNewVersion}>+ 新版本</MiniBtn>
        <MiniBtn active={copySource !== null} onClick={() => setCopySource(copySource ? null : selectedVersion)}>
          {copySource ? "取消复制" : "复制内容"}
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
          源：<b>{copySource}</b> → 点击目标版本粘贴
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

            {isCurrent && <Tag color={T.accent}>当前</Tag>}
            {isBase && <Tag color={T.successDim}>本体</Tag>}
            {!isBase && <Tag color="#6ab">分支</Tag>}

            {isCopyTarget && <span style={{ color: T.accent, fontSize: "10px", flexShrink: 0 }}>← 粘贴</span>}

            {/* Copy source selector (when in copy mode, click to change source) */}
            {copySource && copySource === ver && <Tag color={T.accent}>源</Tag>}

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
                删除
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
            确认删除 <span style={{ color: T.danger, fontWeight: "bold" }}>{deleteConfirm}</span>？此操作不可撤销。
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", justifyContent: "flex-end" }}>
            <button
              onClick={() => setDeleteConfirm(null)}
              style={{ ...modalBtnStyle(T.bg2, T.textSub), padding: "3px 10px", fontSize: "11px" }}
            >
              取消
            </button>
            <button
              onClick={() => handleDelete(deleteConfirm)}
              style={{ ...modalBtnStyle(T.dangerBg, T.danger), padding: "3px 10px", fontSize: "11px" }}
            >
              删除
            </button>
          </div>
        </div>
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

function MiniBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
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

function groupVersions(versions: AddonVersionInfo[]): { info: AddonVersionInfo; indent: boolean }[] {
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
      {isCurrent && <Tag color={T.accent}>当前</Tag>}
      {isBase && <Tag color={T.successDim}>本体</Tag>}
      {!isBase && <Tag color="#6ab">分支</Tag>}
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
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

/* ── Addon Meta Editor ─────────────────────────────── */

const fieldInputStyle: React.CSSProperties = {
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

function AddonMetaEditor({
  addon,
  displayVersion,
  onUpdated,
  onClose,
}: {
  addon: AddonInfo;
  displayVersion: string;
  onUpdated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(addon.name);
  const [author, setAuthor] = useState(addon.author ?? "");
  const [description, setDescription] = useState(addon.description ?? "");
  const [categories, setCategories] = useState((addon.categories ?? []).join(", "));
  const [cover, setCover] = useState(addon.cover ?? "");
  const [saving, setSaving] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Reset fields when addon identity changes
  const keyRef = useRef(`${addon.id}@${addon.version}`);
  if (`${addon.id}@${addon.version}` !== keyRef.current) {
    keyRef.current = `${addon.id}@${addon.version}`;
    setName(addon.name);
    setAuthor(addon.author ?? "");
    setDescription(addon.description ?? "");
    setCategories((addon.categories ?? []).join(", "));
    setCover(addon.cover ?? "");
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const cats = categories
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await updateAddonMeta(addon.id, displayVersion, {
        name,
        author: author || undefined,
        description: description || undefined,
        cover: cover || undefined,
        categories: cats.length > 0 ? cats : undefined,
      });
      onUpdated();
      onClose();
    } catch (e) {
      console.error("Failed to update addon meta:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadAsset(file, "covers", `addon-${addon.id}`, { addonId: addon.id });
    if (result.success && result.filename) setCover(result.filename);
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <MetaField label="名称" value={name} onChange={setName} />
      <MetaField label="作者" value={author} onChange={setAuthor} />
      <MetaField label="分类" value={categories} onChange={setCategories} placeholder="用逗号分隔" />
      <div style={{ display: "flex", gap: "4px", fontSize: "11px" }}>
        <span style={{ color: T.textSub, width: "32px", flexShrink: 0, paddingTop: "4px" }}>简介</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...fieldInputStyle, resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px" }}>
        <span style={{ color: T.textSub, width: "32px", flexShrink: 0 }}>封面</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
          {cover && (
            <img
              src={`/assets/${addon.id}/covers/${cover}?t=${cover}`}
              alt=""
              style={{
                width: "28px",
                height: "28px",
                objectFit: "cover",
                borderRadius: "3px",
                border: `1px solid ${T.borderDim}`,
              }}
            />
          )}
          <span
            style={{
              fontSize: "11px",
              color: T.textFaint,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cover || "无"}
          </span>
          <input
            type="file"
            accept="image/*"
            ref={coverFileRef}
            style={{ display: "none" }}
            onChange={handleCoverUpload}
          />
          <button
            onClick={() => coverFileRef.current?.click()}
            style={{ ...fieldInputStyle, width: "auto", padding: "2px 8px", cursor: "pointer", color: T.textSub }}
          >
            选择
          </button>
          {cover && (
            <button
              onClick={() => setCover("")}
              style={{ ...fieldInputStyle, width: "auto", padding: "2px 8px", cursor: "pointer", color: T.danger }}
            >
              移除
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ ...fieldInputStyle, width: "auto", padding: "3px 10px", cursor: "pointer", color: T.textSub }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            ...fieldInputStyle,
            width: "auto",
            padding: "3px 10px",
            cursor: "pointer",
            color: T.success,
            borderColor: T.successDim,
          }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

function MetaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px" }}>
      <span style={{ color: T.textSub, width: "32px", flexShrink: 0 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={fieldInputStyle}
      />
    </div>
  );
}

/* ── New Version / Branch Modal ───────────────────── */

function NewVersionModal({
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
        setError(result.message ?? "创建失败");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>创建新版本</div>
      <div style={{ color: T.textSub, fontSize: "11px" }}>
        基于{" "}
        <span style={{ color: T.accent }}>
          {addonId}@{sourceVersion}
        </span>
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
            {m === "bump" ? "版本升级" : "创建分支"}
          </button>
        ))}
      </div>

      {mode === "bump" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ color: T.textSub, fontSize: "11px" }}>新的独立版本号（X.Y.Z 格式）：</div>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="例如 1.1.0"
            style={{ ...fieldInputStyle, fontSize: "13px", padding: "6px 8px" }}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ color: T.textSub, fontSize: "11px" }}>分支名称（字母、数字、下划线、横线）：</div>
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

      {conflict && <div style={{ color: T.danger, fontSize: "11px" }}>版本 {targetVersion} 已存在</div>}
      {error && <div style={{ color: T.danger, fontSize: "11px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>
          取消
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
          {saving ? "创建中..." : "创建"}
        </button>
      </div>
    </Overlay>
  );
}

/* ── Main Component ────────────────────────────────── */

export default function AddonSidebar({ enabledAddons, stagedAddons, onStagedChange, worldId }: AddonSidebarProps) {
  const [allAddons, setAllAddons] = useState<AddonInfo[]>([]);
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
          title="禁用 Add-on"
          message={`确认禁用「${disablePrompt.addon.name}」？禁用后该 Add-on 的内容将从当前世界移除。`}
          confirmLabel="确认禁用"
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
          title="删除 Add-on"
          message={`确认删除「${deleteAddonConfirm.name}」(${deleteAddonConfirm.id}) 的所有版本？此操作不可撤销。`}
          confirmLabel="确认删除"
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
              没有已安装的 Add-on
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
                        src={`/assets/${addon.id}/covers/${addon.cover}?t=${addon.cover}`}
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
                        {isFork && <Tag color="#6ab">分支</Tag>}
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
                        {addon.author && <InfoRow label="作者" value={addon.author} />}
                        {addon.categories && addon.categories.length > 0 && (
                          <InfoRow label="内容" value={addon.categories.join(", ")} />
                        )}
                        {addon.dependencies && addon.dependencies.length > 0 && (
                          <InfoRow label="依赖" value={addon.dependencies.map((d) => d.id).join(", ")} />
                        )}
                      </div>

                      {/* Toggle buttons */}
                      <div style={{ display: "flex", gap: "4px" }}>
                        <ToggleBtn
                          label="编辑信息"
                          active={editingMetaId === addon.id}
                          onClick={() => {
                            setEditingMetaId(editingMetaId === addon.id ? null : addon.id);
                            setVersionManageId(null);
                          }}
                        />
                        <ToggleBtn
                          label="版本管理"
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
                            [删除]
                          </button>
                        )}
                      </div>

                      {/* Edit meta panel */}
                      {editingMetaId === addon.id && (
                        <div style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: "10px" }}>
                          <AddonMetaEditor
                            addon={addon}
                            displayVersion={displayVersion}
                            onUpdated={refresh}
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
