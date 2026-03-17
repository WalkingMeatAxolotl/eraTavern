import { useState, useEffect, useCallback } from "react";
import T from "../theme";
import { fetchSaves, createSave, loadSave, deleteSave, renameSave, type SaveSlotMeta, fetchLLMPresets, updateConfig, updateWorldMeta, fetchConfig, fetchSession } from "../api/client";

const MAX_SLOTS = 10;

interface Props {
  worldId: string;
  addonRefs: { id: string; version: string }[];
  onRestart: () => void;
  onWorldChanged: () => void;
  settingsBtnStyle: React.CSSProperties;
}

const btnBase: React.CSSProperties = {
  padding: "3px 10px",
  backgroundColor: T.bg2,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "11px",
  color: T.text,
};

const inputStyle: React.CSSProperties = {
  background: T.bg3,
  border: `1px solid ${T.border}`,
  borderRadius: "2px",
  padding: "4px 6px",
  color: T.text,
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box" as const,
};

export default function SettingsPage({ worldId, addonRefs, onRestart, onWorldChanged, settingsBtnStyle }: Props) {
  const [saves, setSaves] = useState<SaveSlotMeta[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(false);

  // LLM preset settings
  const [presetList, setPresetList] = useState<{ id: string; name: string }[]>([]);
  const [globalPreset, setGlobalPreset] = useState("");
  const [worldPreset, setWorldPreset] = useState("");

  const refresh = useCallback(async () => {
    if (!worldId) return;
    try {
      const list = await fetchSaves();
      setSaves(list);
    } catch { /* ignore */ }
  }, [worldId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Load LLM presets + current settings
  useEffect(() => {
    (async () => {
      try {
        const [presets, cfg, session] = await Promise.all([
          fetchLLMPresets(), fetchConfig(), fetchSession(),
        ]);
        setPresetList(presets);
        setGlobalPreset(cfg.defaultLlmPreset || "");
        setWorldPreset(session.llmPreset || "");
      } catch { /* ignore */ }
    })();
  }, [worldId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      const slotId = `save_${ts}`;
      const res = await createSave(slotId, newName.trim());
      if (!res.success) { alert(res.message); return; }
      setCreating(false);
      setNewName("");
      await refresh();
    } finally { setLoading(false); }
  };

  const handleLoad = async (slotId: string) => {
    if (!confirm("当前未保存的进度将丢失，确定要读取存档吗？")) return;
    setLoading(true);
    try {
      const res = await loadSave(slotId);
      if (!res.success) { alert(res.message); return; }
    } finally { setLoading(false); }
  };

  const handleDelete = async (slotId: string) => {
    if (!confirm("确定要删除此存档吗？")) return;
    await deleteSave(slotId);
    await refresh();
  };

  const handleRename = async (slotId: string) => {
    if (!renameValue.trim()) return;
    await renameSave(slotId, renameValue.trim());
    setRenamingId(null);
    setRenameValue("");
    await refresh();
  };

  const addonMismatch = (saveRefs: { id: string; version: string }[]): boolean => {
    if (!saveRefs || !addonRefs) return false;
    const current = new Set(addonRefs.map(a => `${a.id}@${a.version}`));
    const saved = new Set(saveRefs.map(a => `${a.id}@${a.version}`));
    if (current.size !== saved.size) return true;
    for (const s of saved) {
      if (!current.has(s)) return true;
    }
    return false;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px", color: T.text }}>

      {/* Save management */}
      {worldId && (
        <>
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
            == 存档管理 ==
          </span>

          {/* Create save */}
          {!creating ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => setCreating(true)}
                disabled={loading || saves.length >= MAX_SLOTS}
                style={{
                  ...btnBase,
                  color: saves.length >= MAX_SLOTS ? T.textFaint : T.successDim,
                  borderColor: saves.length >= MAX_SLOTS ? T.border : `${T.success}66`,
                  opacity: saves.length >= MAX_SLOTS ? 0.5 : 1,
                  cursor: saves.length >= MAX_SLOTS ? "not-allowed" : "pointer",
                }}
              >
                [创建存档]
              </button>
              {saves.length >= MAX_SLOTS && (
                <span style={{ fontSize: "11px", color: T.textDim }}>
                  已达上限 {MAX_SLOTS} 个
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                placeholder="存档名称"
                style={{ ...inputStyle, flex: 1, maxWidth: 200 }}
              />
              <button
                onClick={handleCreate}
                disabled={loading || !newName.trim()}
                style={{ ...btnBase, opacity: !newName.trim() ? 0.5 : 1 }}
              >
                确定
              </button>
              <button onClick={() => { setCreating(false); setNewName(""); }} style={btnBase}>
                取消
              </button>
            </div>
          )}

          {/* Save list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {saves.map(s => {
              const mismatch = addonMismatch(s.addonRefs);
              const isRenaming = renamingId === s.slotId;
              return (
                <div
                  key={s.slotId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    backgroundColor: T.bg1,
                    borderRadius: "3px",
                  }}
                >
                  {/* Left: name + metadata */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isRenaming ? (
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleRename(s.slotId); if (e.key === "Escape") setRenamingId(null); }}
                          style={{ ...inputStyle, flex: 1, maxWidth: 180 }}
                        />
                        <button onClick={() => handleRename(s.slotId)} style={btnBase}>确定</button>
                        <button onClick={() => setRenamingId(null)} style={btnBase}>取消</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: "13px" }}>{s.name}</div>
                        <div style={{ fontSize: "11px", color: T.textDim, marginTop: "2px" }}>
                          {s.gameTimeDisplay}
                          <span style={{ margin: "0 4px", color: T.textFaint }}>&middot;</span>
                          {s.timestamp?.replace("T", " ")}
                          {mismatch && (
                            <span style={{ color: T.danger, marginLeft: "6px" }} title="存档的扩展版本与当前不一致">
                              [版本不匹配]
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: action buttons */}
                  {!isRenaming && (
                    <div style={{ display: "flex", gap: "4px", marginLeft: "8px", flexShrink: 0 }}>
                      <button onClick={() => handleLoad(s.slotId)} disabled={loading} style={btnBase}>
                        [读取]
                      </button>
                      <button
                        onClick={() => { setRenamingId(s.slotId); setRenameValue(s.name); }}
                        style={btnBase}
                      >
                        [重命名]
                      </button>
                      <button
                        onClick={() => handleDelete(s.slotId)}
                        style={{ ...btnBase, color: T.danger, borderColor: `${T.danger}66` }}
                      >
                        [删除]
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {saves.length === 0 && (
              <div style={{ color: T.textDim, fontSize: "11px", padding: "4px 0" }}>暂无存档</div>
            )}
          </div>
        </>
      )}

      {/* LLM Settings */}
      <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
        == LLM 设置 ==
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: T.textSub, minWidth: "90px" }}>全局默认预设</span>
          <select
            style={{ ...inputStyle, width: "200px" }}
            value={globalPreset}
            onChange={async (e) => {
              const val = e.target.value;
              setGlobalPreset(val);
              await updateConfig({ defaultLlmPreset: val });
            }}
          >
            <option value="">（无）</option>
            {presetList.map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.id}</option>
            ))}
          </select>
          <span style={{ fontSize: "11px", color: T.textDim }}>所有世界通用的默认</span>
        </div>

        {worldId && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: T.textSub, minWidth: "90px" }}>世界级预设</span>
            <select
              style={{ ...inputStyle, width: "200px" }}
              value={worldPreset}
              onChange={async (e) => {
                const val = e.target.value;
                setWorldPreset(val);
                await updateWorldMeta(worldId, { llmPreset: val });
              }}
            >
              <option value="">（跟随全局）</option>
              {presetList.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
            <span style={{ fontSize: "11px", color: T.textDim }}>覆盖全局默认</span>
          </div>
        )}
      </div>

      {/* Restart — destructive, placed last */}
      {worldId && (
        <>
          <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
            == 世界设置 ==
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={onRestart}
              style={{
                ...btnBase,
                background: T.dangerBg,
                color: T.danger,
                borderColor: `${T.danger}66`,
              }}
            >
              [重新开始游戏]
            </button>
            <span style={{ fontSize: "11px", color: T.textDim }}>
              重新加载所有数据，重置时间和角色状态
            </span>
          </div>
        </>
      )}
    </div>
  );
}
