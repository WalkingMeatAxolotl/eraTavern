import { useState, useEffect } from "react";
import type { WorldInfo } from "../types/game";
import { fetchWorlds, selectWorld, saveSessionAs, deleteWorld, unloadWorld, updateWorldMeta, createWorld } from "../api/client";
import T from "../theme";

interface WorldSidebarProps {
  currentWorldId: string;
  currentAddons: { id: string; version: string }[];
  onWorldChanged: () => void;
}

export default function WorldSidebar({ currentWorldId, currentAddons, onWorldChanged }: WorldSidebarProps) {
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Inline editing state for world metadata
  const [editingMeta, setEditingMeta] = useState<string | null>(null);
  const [metaName, setMetaName] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaMessage, setMetaMessage] = useState("");

  const refresh = () => { fetchWorlds().then(setWorlds); };
  useEffect(() => { refresh(); }, [currentWorldId]);

  const handleSelectWorld = async (worldId: string) => {
    await selectWorld(worldId);
    onWorldChanged();
  };

  const handleSelectEmpty = async () => {
    try {
      await unloadWorld();
      onWorldChanged();
    } catch (e) {
      console.error("Failed to unload world:", e);
    }
  };

  const handleSaveAs = async () => {
    if (!newId.trim() || !newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await saveSessionAs(newId.trim(), newName.trim());
      if (result.success) {
        setShowSaveForm(false);
        setNewName("");
        setNewId("");
        refresh();
        onWorldChanged();
        setError("世界已保存");
        setTimeout(() => setError(""), 3000);
      } else {
        setError(result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newId.trim() || !newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      // New world starts with no addons — user enables them via the addon sidebar
      const result = await createWorld(newId.trim(), newName.trim(), []);
      if (result.success) {
        setShowCreateForm(false);
        setNewName("");
        setNewId("");
        // Switch to the new world
        await selectWorld(newId.trim());
        refresh();
        onWorldChanged();
        setError("世界已创建");
        setTimeout(() => setError(""), 3000);
      } else {
        setError(result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, worldId: string) => {
    e.stopPropagation();
    if (!confirm(`确认删除世界 "${worldId}"？`)) return;
    await deleteWorld(worldId);
    refresh();
    if (currentWorldId === worldId) {
      handleSelectEmpty();
    }
    setError("世界已删除");
    setTimeout(() => setError(""), 3000);
  };

  const startEditMeta = (w: WorldInfo) => {
    setEditingMeta(w.id);
    setMetaName(w.name);
    setMetaDesc((w as Record<string, unknown>).description as string ?? "");
    setMetaMessage("");
  };

  const handleSaveMeta = async (worldId: string) => {
    const result = await updateWorldMeta(worldId, { name: metaName, description: metaDesc });
    if (result.success) {
      setEditingMeta(null);
      setMetaMessage("");
      refresh();
      if (worldId === currentWorldId) onWorldChanged();
    } else {
      setMetaMessage(result.message);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 6px",
    backgroundColor: T.bg3,
    border: `1px solid ${T.border}`,
    borderRadius: "2px",
    color: T.text,
    fontFamily: "monospace",
    fontSize: "12px",
    boxSizing: "border-box",
  };

  const btnStyle: React.CSSProperties = {
    padding: "4px 10px",
    backgroundColor: "transparent",
    color: T.textSub,
    border: `1px solid ${T.border}`,
    fontFamily: "monospace",
    fontSize: "12px",
    cursor: "pointer",
  };

  const smallBtnStyle: React.CSSProperties = {
    padding: "3px 10px",
    backgroundColor: T.bg2,
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "11px",
  };

  return (
    <div style={{
      width: "100%",
      height: "100vh",
      borderRight: `1px solid ${T.border}`,
      display: "flex",
      flexDirection: "column",
      fontSize: "12px",
      overflow: "hidden",
      paddingTop: 40,
      boxSizing: "border-box",
    }}>
      {/* Top action area */}
      <div style={{ padding: "8px", borderBottom: `1px solid ${T.borderDim}`, display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => { setShowCreateForm(true); setShowSaveForm(false); setNewName(""); setNewId(""); setError(""); }}
            style={{ ...btnStyle, color: T.success, borderColor: T.textFaint, flex: 1 }}
          >
            [新建世界]
          </button>
          {currentWorldId && (
            <button
              onClick={handleSelectEmpty}
              style={{ ...btnStyle, color: T.textDim, borderColor: T.border }}
              title="卸载当前世界，进入空世界"
            >
              [空]
            </button>
          )}
        </div>
        {error && !showCreateForm && !showSaveForm && (
          <div style={{ color: error.includes("已") ? T.success : T.danger, fontSize: "11px" }}>{error}</div>
        )}

        {/* Create new world form */}
        {showCreateForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px", border: `1px solid ${T.border}`, borderRadius: "3px" }}>
            <div style={{ color: T.textSub, fontSize: "11px" }}>创建新世界</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="世界名称" style={inputStyle} />
            <input value={newId} onChange={(e) => setNewId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="world-id" style={inputStyle} />
            {error && <div style={{ color: T.danger, fontSize: "11px" }}>{error}</div>}
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={handleCreateNew} disabled={!newId.trim() || !newName.trim()} style={{ ...btnStyle, color: T.success, flex: 1, opacity: (!newId.trim() || !newName.trim()) ? 0.5 : 1 }}>[创建]</button>
              <button onClick={() => { setShowCreateForm(false); setError(""); }} style={{ ...btnStyle, flex: 1 }}>[取消]</button>
            </div>
          </div>
        )}

        {/* Save-as form (from empty world) */}
        {showSaveForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px", border: `1px solid ${T.border}`, borderRadius: "3px" }}>
            <div style={{ color: T.textSub, fontSize: "11px" }}>保存为新世界</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="世界名称" style={inputStyle} />
            <input value={newId} onChange={(e) => setNewId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="world-id" style={inputStyle} />
            {error && <div style={{ color: T.danger, fontSize: "11px" }}>{error}</div>}
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={handleSaveAs} disabled={!newId.trim() || !newName.trim()} style={{ ...btnStyle, color: T.accent, flex: 1, opacity: (!newId.trim() || !newName.trim()) ? 0.5 : 1 }}>[确定]</button>
              <button onClick={() => { setShowSaveForm(false); setError(""); }} style={{ ...btnStyle, flex: 1 }}>[取消]</button>
            </div>
          </div>
        )}
      </div>

      {/* World list */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}>
        {worlds.length === 0 && (
          <div style={{ color: T.textDim, fontSize: "11px", padding: "8px 0", textAlign: "center" }}>
            没有已保存的世界
          </div>
        )}

        {/* Saved world entries */}
        {worlds.map((w) => {
          const active = currentWorldId === w.id;
          const expanded = expandedId === w.id;
          const addonCount = w.addons?.length ?? 0;
          const isEditingThis = editingMeta === w.id;
          return (
            <div key={w.id}>
              {/* Card row */}
              <div
                onClick={() => setExpandedId(expanded ? null : w.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 8px",
                  backgroundColor: expanded ? T.bg2 : T.bg3,
                  border: active ? `1px solid ${T.accent}` : `1px solid ${T.borderDim}`,
                  borderRadius: expanded ? "3px 3px 0 0" : "3px",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "3px",
                  background: `linear-gradient(135deg, ${T.bg1} 0%, ${T.bg2} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: "12px", color: T.border, fontWeight: "bold" }}>W</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "12px",
                    color: active ? T.accent : T.text,
                    fontWeight: active ? "bold" : "normal",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {w.name}
                  </div>
                  <div style={{ fontSize: "10px", color: T.textFaint }}>
                    {addonCount} addon{addonCount !== 1 ? "s" : ""}
                  </div>
                </div>
                {active && (
                  <span style={{ fontSize: "10px", color: T.accent, flexShrink: 0 }}>当前</span>
                )}
                <span style={{ color: T.textFaint, fontSize: "10px" }}>
                  {expanded ? "\u25B2" : "\u25BC"}
                </span>
              </div>

              {/* Expanded detail panel */}
              {expanded && (
                <div style={{
                  padding: "8px",
                  backgroundColor: T.bg1,
                  border: `1px solid ${T.borderDim}`,
                  borderTop: "none",
                  borderRadius: "0 0 3px 3px",
                  fontSize: "11px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}>
                  {isEditingThis ? (
                    /* Metadata editing form */
                    <>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <span style={{ color: T.textDim, width: "32px" }}>名称</span>
                        <input value={metaName} onChange={(e) => setMetaName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                      <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
                        <span style={{ color: T.textDim, width: "32px", paddingTop: "4px" }}>简介</span>
                        <textarea
                          value={metaDesc}
                          onChange={(e) => setMetaDesc(e.target.value)}
                          rows={2}
                          style={{ ...inputStyle, flex: 1, resize: "vertical" }}
                        />
                      </div>
                      {metaMessage && <div style={{ color: T.danger, fontSize: "11px" }}>{metaMessage}</div>}
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button onClick={() => handleSaveMeta(w.id)} style={{ ...smallBtnStyle, color: T.success }}>[保存]</button>
                        <button onClick={() => setEditingMeta(null)} style={{ ...smallBtnStyle, color: T.textSub }}>[取消]</button>
                      </div>
                    </>
                  ) : (
                    /* Metadata display */
                    <>
                      <div style={{ color: T.textDim }}>ID: {w.id}</div>
                      {(w as Record<string, unknown>).description && (
                        <div style={{ color: T.textSub }}>{(w as Record<string, unknown>).description as string}</div>
                      )}
                      {w.addons && w.addons.length > 0 && (
                        <div style={{ color: T.textDim }}>
                          Addons: {w.addons.map(a => `${a.id}@${a.version}`).join(", ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                        {!active && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectWorld(w.id); }}
                            style={{ ...smallBtnStyle, color: T.success }}
                          >
                            [切换]
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); startEditMeta(w); }}
                          style={{ ...smallBtnStyle, color: T.accent }}
                        >
                          [编辑信息]
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, w.id)}
                          style={{ ...smallBtnStyle, color: T.danger }}
                        >
                          [删除]
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
