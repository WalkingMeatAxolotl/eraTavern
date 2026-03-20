import { useState, useEffect, useCallback, useRef } from "react";
import type { WorldInfo } from "../../types/game";
import {
  fetchWorlds,
  fetchAddons,
  selectWorld,
  deleteWorld,
  unloadWorld,
  updateWorldMeta,
  createWorld,
  uploadAsset,
} from "../../api/client";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { Overlay, ConfirmModal, modalBtnStyle } from "../shared/Modal";

interface WorldSidebarProps {
  currentWorldId: string;
  currentAddons: { id: string; version: string }[];
  onWorldChanged: () => void;
}

/* ── Create world modal ───────────────────────────── */

function CreateWorldModal({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
    const result = await createWorld(id.trim(), name.trim(), []);
    setBusy(false);
    if (result.success) {
      onCreated(id.trim());
    } else {
      setError(result.message);
    }
  };

  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{t("world.createTitle")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div>
          <div style={labelStyle}>{t("field.name")}</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("world.myWorld")} />
        </div>
        <div>
          <div style={labelStyle}>{t("world.idLabel")}</div>
          <input
            style={inputStyle}
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            placeholder="my-world"
          />
        </div>
        {error && <div style={{ color: T.danger, fontSize: "11px" }}>{error}</div>}
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={modalBtnStyle(T.borderDim, T.textSub)}>
          {t("btn.cancel")}
        </button>
        <button
          onClick={handleCreate}
          disabled={busy || !id.trim() || !name.trim()}
          style={{ ...modalBtnStyle(T.bg2, T.success), opacity: busy || !id.trim() || !name.trim() ? 0.5 : 1 }}
        >
          {busy ? t("btn.creating") : t("btn.create")}
        </button>
      </div>
    </Overlay>
  );
}

/* ── Toggle button (reusable) ─────────────────────── */

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
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

/* ── Main Component ────────────────────────────────── */

export default function WorldSidebar({ currentWorldId, onWorldChanged }: WorldSidebarProps) {
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [addonNames, setAddonNames] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<WorldInfo | null>(null);
  const [unloadConfirm, setUnloadConfirm] = useState(false);

  // Inline editing state
  const [editingMeta, setEditingMeta] = useState<string | null>(null);
  const [metaName, setMetaName] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaCover, setMetaCover] = useState("");
  const [coverBust, setCoverBust] = useState(Date.now());
  const [metaMessage, setMetaMessage] = useState("");
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Double-click tracking
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  const refresh = useCallback(() => {
    fetchWorlds().then(setWorlds);
    fetchAddons().then((addons) => {
      const map: Record<string, string> = {};
      for (const a of addons) map[a.id] = a.name;
      setAddonNames(map);
    });
  }, []);
  useEffect(() => {
    refresh();
  }, [currentWorldId, refresh]);

  const handleSelectWorld = async (worldId: string) => {
    await selectWorld(worldId);
    onWorldChanged();
  };

  const handleUnload = async () => {
    setUnloadConfirm(false);
    await unloadWorld();
    onWorldChanged();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const worldId = deleteConfirm.id;
    setDeleteConfirm(null);
    await deleteWorld(worldId);
    refresh();
    if (currentWorldId === worldId) {
      await unloadWorld();
      onWorldChanged();
    }
  };

  const handleCreated = async (worldId: string) => {
    setShowCreateModal(false);
    await selectWorld(worldId);
    refresh();
    onWorldChanged();
  };

  const startEditMeta = (w: WorldInfo) => {
    setEditingMeta(w.id);
    setMetaName(w.name);
    setMetaDesc(w.description ?? "");
    setMetaCover(w.cover ?? "");
    setMetaMessage("");
  };

  const handleSaveMeta = async (worldId: string) => {
    const result = await updateWorldMeta(worldId, {
      name: metaName,
      description: metaDesc,
      cover: metaCover,
    });
    if (result.success) {
      setEditingMeta(null);
      setMetaMessage("");
      refresh();
      if (worldId === currentWorldId) onWorldChanged();
    } else {
      setMetaMessage(result.message);
    }
  };

  const handleCardClick = (w: WorldInfo) => {
    const now = Date.now();
    const last = lastClickRef.current;
    // Double-click: switch world (non-current only)
    if (last && last.id === w.id && now - last.time < 400 && w.id !== currentWorldId) {
      lastClickRef.current = null;
      handleSelectWorld(w.id);
      return;
    }
    lastClickRef.current = { id: w.id, time: now };
    // Single click: toggle expand
    setExpandedId(expandedId === w.id ? null : w.id);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 6px",
    backgroundColor: T.bg3,
    border: `1px solid ${T.border}`,
    borderRadius: "3px",
    color: T.text,
    fontSize: "12px",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <>
      {showCreateModal && <CreateWorldModal onCreated={handleCreated} onCancel={() => setShowCreateModal(false)} />}
      {deleteConfirm && (
        <ConfirmModal
          title={t("world.deleteTitle")}
          message={t("world.deleteMsg", { name: deleteConfirm.name, id: deleteConfirm.id })}
          confirmLabel={t("world.confirmDelete")}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      {unloadConfirm && (
        <ConfirmModal
          title={t("world.unloadTitle")}
          message={t("world.unloadMsg")}
          confirmLabel={t("world.confirmUnload")}
          danger
          onConfirm={handleUnload}
          onCancel={() => setUnloadConfirm(false)}
        />
      )}

      <div
        style={{
          width: "100%",
          height: "100vh",
          borderRight: `1px solid ${T.border}`,
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
          <span style={{ color: T.accent, fontSize: "13px", fontWeight: "bold" }}>{t("world.worlds")}</span>
          <span style={{ color: T.textDim, fontSize: "11px" }}>({worlds.length})</span>
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

        {/* World cards */}
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
          {worlds.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: "11px", padding: "16px 8px", textAlign: "center" }}>
              {t("ui.noSavedWorlds")}
            </div>
          ) : (
            worlds.map((w) => {
              const active = currentWorldId === w.id;
              const expanded = expandedId === w.id;
              const addonCount = w.addons?.length ?? 0;
              const isEditingThis = editingMeta === w.id;

              return (
                <div
                  key={w.id}
                  style={{
                    borderRadius: "6px",
                    border: `1px solid ${active ? T.accent : T.borderDim}`,
                  }}
                >
                  {/* Card header */}
                  <div
                    onClick={() => handleCardClick(w)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      backgroundColor: active ? `${T.accent}08` : T.bg1,
                      cursor: "pointer",
                    }}
                  >
                    {w.cover ? (
                      <img
                        src={`/assets/world/${w.id}/covers/${w.cover}?t=${coverBust}`}
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
                        {(w.name || w.id || "?")[0]}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: active ? T.accent : T.text,
                          fontWeight: "bold",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {w.name}
                      </div>
                      <div style={{ fontSize: "11px", color: T.textSub, marginTop: "2px" }}>{w.id}</div>
                      <div style={{ fontSize: "11px", color: T.textDim, marginTop: "2px" }}>
                        {addonCount} addon{addonCount !== 1 ? "s" : ""}
                      </div>
                    </div>

                    {active && (
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "1px 6px",
                          borderRadius: "3px",
                          backgroundColor: `${T.accent}20`,
                          color: T.accent,
                          border: `1px solid ${T.accent}40`,
                          lineHeight: 1.4,
                          fontWeight: "bold",
                        }}
                      >
                        {t("ui.current")}
                      </span>
                    )}
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
                        fontSize: "11px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {/* Info */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {w.description && <div style={{ color: T.textSub }}>{w.description as string}</div>}
                        {w.addons && w.addons.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "3px",
                              alignItems: "center",
                              marginTop: "2px",
                            }}
                          >
                            <span style={{ color: T.textDim, fontSize: "10px" }}>{t("world.enabledAddons")}</span>
                            {w.addons.map((a) => (
                              <span
                                key={`${a.id}@${a.version}`}
                                style={{
                                  fontSize: "10px",
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                  backgroundColor: T.bg2,
                                  color: T.textSub,
                                  border: `1px solid ${T.borderDim}`,
                                }}
                              >
                                {addonNames[a.id] || a.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {!active && <ToggleBtn label={t("btn.switch")} active={false} onClick={() => handleSelectWorld(w.id)} />}
                        <ToggleBtn
                          label={t("btn.editInfo")}
                          active={isEditingThis}
                          onClick={() => {
                            if (isEditingThis) {
                              setEditingMeta(null);
                            } else {
                              startEditMeta(w);
                            }
                          }}
                        />
                        <span style={{ flex: 1 }} />
                        {active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setUnloadConfirm(true);
                            }}
                            style={{
                              padding: "4px 10px",
                              fontSize: "11px",
                              cursor: "pointer",
                              backgroundColor: T.bg1,
                              color: T.textSub,
                              border: `1px solid ${T.borderDim}`,
                              borderRadius: "3px",
                            }}
                          >
                            {t("btn.unload")}
                          </button>
                        )}
                        {!active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(w);
                            }}
                            style={{
                              padding: "4px 10px",
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
                      {isEditingThis && (
                        <div
                          style={{
                            borderLeft: `2px solid ${T.accent}`,
                            paddingLeft: "10px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <span style={{ color: T.textDim, minWidth: "32px" }}>{t("field.name")}</span>
                            <input
                              value={metaName}
                              onChange={(e) => setMetaName(e.target.value)}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                            <span style={{ color: T.textDim, minWidth: "32px", paddingTop: "4px" }}>{t("field.intro")}</span>
                            <textarea
                              value={metaDesc}
                              onChange={(e) => setMetaDesc(e.target.value)}
                              rows={2}
                              style={{ ...inputStyle, flex: 1, resize: "vertical" }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <span style={{ color: T.textDim, minWidth: "32px" }}>{t("field.cover")}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                              {metaCover && (
                                <img
                                  src={`/assets/world/${w.id}/covers/${metaCover}?t=${coverBust}`}
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
                                {metaCover || t("ui.none")}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                ref={coverFileRef}
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const result = await uploadAsset(file, "covers", `world-${w.id}`, { worldId: w.id });
                                  if (result.success && result.filename) {
                                    setMetaCover(result.filename);
                                    setCoverBust(Date.now());
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <button
                                onClick={() => coverFileRef.current?.click()}
                                style={{
                                  padding: "2px 8px",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                  backgroundColor: T.bg2,
                                  color: T.textSub,
                                  border: `1px solid ${T.borderDim}`,
                                  borderRadius: "3px",
                                }}
                              >
                                {t("btn.select")}
                              </button>
                              {metaCover && (
                                <button
                                  onClick={() => setMetaCover("")}
                                  style={{
                                    padding: "2px 8px",
                                    fontSize: "10px",
                                    cursor: "pointer",
                                    backgroundColor: T.bg2,
                                    color: T.danger,
                                    border: `1px solid ${T.borderDim}`,
                                    borderRadius: "3px",
                                  }}
                                >
                                  {t("btn.remove")}
                                </button>
                              )}
                            </div>
                          </div>
                          {metaMessage && <div style={{ color: T.danger, fontSize: "11px" }}>{metaMessage}</div>}
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              onClick={() => handleSaveMeta(w.id)}
                              style={{
                                padding: "3px 10px",
                                backgroundColor: T.bg2,
                                border: `1px solid ${T.border}`,
                                borderRadius: "3px",
                                cursor: "pointer",
                                fontSize: "11px",
                                color: T.success,
                              }}
                            >
                              [{t("btn.save")}]
                            </button>
                            <button
                              onClick={() => setEditingMeta(null)}
                              style={{
                                padding: "3px 10px",
                                backgroundColor: T.bg2,
                                border: `1px solid ${T.border}`,
                                borderRadius: "3px",
                                cursor: "pointer",
                                fontSize: "11px",
                                color: T.textSub,
                              }}
                            >
                              [{t("btn.cancel")}]
                            </button>
                          </div>
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
