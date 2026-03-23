import { useState, useEffect, useCallback, useRef } from "react";
import clsx from "clsx";
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
import { t } from "../../i18n/ui";
import { Overlay, ConfirmModal, modalBtnStyle } from "../shared/Modal";
import s from "./WorldSidebar.module.css";

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
      <div className={s.modalTitle}>{t("world.createTitle")}</div>
      <div className={s.modalForm}>
        <div>
          <div className={s.modalLabel}>{t("field.name")}</div>
          <input className={s.modalInput} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("world.myWorld")} />
        </div>
        <div>
          <div className={s.modalLabel}>{t("world.idLabel")}</div>
          <input
            className={s.modalInput}
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            placeholder="my-world"
          />
        </div>
        {error && <div className={s.modalError}>{error}</div>}
      </div>
      <div className={s.modalActions}>
        <button onClick={onCancel} style={modalBtnStyle("var(--border-dim)", "var(--text-sub)")}>
          {t("btn.cancel")}
        </button>
        <button
          onClick={handleCreate}
          disabled={busy || !id.trim() || !name.trim()}
          style={{ ...modalBtnStyle("var(--bg2)", "var(--success)"), opacity: busy || !id.trim() || !name.trim() ? 0.5 : 1 }}
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
      className={clsx(s.toggleBtn, active && s.active)}
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

      <div className={s.sidebar}>
        {/* Header */}
        <div className={s.header}>
          <span className={s.headerTitle}>{t("world.worlds")}</span>
          <span className={s.headerCount}>({worlds.length})</span>
          <span className={s.spacer} />
          <button onClick={() => setShowCreateModal(true)} className={s.addBtn}>
            +
          </button>
        </div>

        {/* World cards */}
        <div className={s.cardList}>
          {worlds.length === 0 ? (
            <div className={s.emptyMsg}>
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
                  className={clsx(s.card, active && s.cardActive)}
                >
                  {/* Card header */}
                  <div
                    onClick={() => handleCardClick(w)}
                    className={clsx(s.cardHeader, active && s.cardHeaderActive)}
                  >
                    {w.cover ? (
                      <img
                        src={`/assets/world/${w.id}/covers/${w.cover}?t=${coverBust}`}
                        alt=""
                        className={s.coverImg}
                      />
                    ) : (
                      <div className={s.coverPlaceholder}>
                        {(w.name || w.id || "?")[0]}
                      </div>
                    )}
                    <div className={s.cardInfo}>
                      <div className={clsx(s.cardName, active && s.cardNameActive)}>
                        {w.name}
                      </div>
                      <div className={s.cardId}>{w.id}</div>
                      <div className={s.cardAddonCount}>
                        {addonCount} addon{addonCount !== 1 ? "s" : ""}
                      </div>
                    </div>

                    {active && (
                      <span className={s.currentBadge}>
                        {t("ui.current")}
                      </span>
                    )}
                    <span className={s.chevron}>
                      {expanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </div>

                  {/* Expanded panel */}
                  {expanded && (
                    <div className={s.expandedPanel}>
                      {/* Info */}
                      <div className={s.expandedInfo}>
                        {w.description && <div className={s.description}>{w.description as string}</div>}
                        {w.addons && w.addons.length > 0 && (
                          <div className={s.addonList}>
                            <span className={s.addonLabel}>{t("world.enabledAddons")}</span>
                            {w.addons.map((a) => (
                              <span key={`${a.id}@${a.version}`} className={s.addonTag}>
                                {addonNames[a.id] || a.id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className={s.actionBtns}>
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
                        <span className={s.spacer} />
                        {active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setUnloadConfirm(true);
                            }}
                            className={s.unloadBtn}
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
                            className={s.deleteBtn}
                          >
                            [{t("btn.delete")}]
                          </button>
                        )}
                      </div>

                      {/* Edit meta panel */}
                      {isEditingThis && (
                        <div className={s.metaPanel}>
                          <div className={s.metaRow}>
                            <span className={s.metaLabel}>{t("field.name")}</span>
                            <input
                              value={metaName}
                              onChange={(e) => setMetaName(e.target.value)}
                              className={s.metaInput}
                            />
                          </div>
                          <div className={s.metaRowTop}>
                            <span className={s.metaLabelTop}>{t("field.intro")}</span>
                            <textarea
                              value={metaDesc}
                              onChange={(e) => setMetaDesc(e.target.value)}
                              rows={2}
                              className={s.metaTextarea}
                            />
                          </div>
                          <div className={s.metaRow}>
                            <span className={s.metaLabel}>{t("field.cover")}</span>
                            <div className={s.coverRow}>
                              {metaCover && (
                                <img
                                  src={`/assets/world/${w.id}/covers/${metaCover}?t=${coverBust}`}
                                  alt=""
                                  className={s.coverThumb}
                                />
                              )}
                              <span className={s.coverName}>
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
                                className={s.smallBtn}
                              >
                                {t("btn.select")}
                              </button>
                              {metaCover && (
                                <button
                                  onClick={() => setMetaCover("")}
                                  className={s.smallBtnDanger}
                                >
                                  {t("btn.remove")}
                                </button>
                              )}
                            </div>
                          </div>
                          {metaMessage && <div className={s.metaMessage}>{metaMessage}</div>}
                          <div className={s.metaActions}>
                            <button onClick={() => handleSaveMeta(w.id)} className={s.saveBtn}>
                              [{t("btn.save")}]
                            </button>
                            <button onClick={() => setEditingMeta(null)} className={s.cancelBtn}>
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
