import { useState, useEffect, useCallback } from "react";
import { t } from "../../i18n/ui";
import { useConfirm } from "../shared/useConfirm";
import {
  fetchSaves,
  createSave,
  loadSave,
  deleteSave,
  renameSave,
  type SaveSlotMeta,
  fetchLLMPresets,
  updateWorldMeta,
  fetchSession,
} from "../../api/client";
import { btnClass } from "../shared/buttons";
import T from "../../theme";
import clsx from "clsx";
import s from "./SettingsPage.module.css";

const MAX_SLOTS = 10;

interface Props {
  worldId: string;
  addonRefs: { id: string; version: string }[];
  onRestart: () => void;
}

export default function SettingsPage({ worldId, addonRefs, onRestart }: Props) {
  const [saves, setSaves] = useState<SaveSlotMeta[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmUI, showConfirm] = useConfirm();

  // LLM world-level preset
  const [presetList, setPresetList] = useState<{ id: string; name: string }[]>([]);
  const [worldPreset, setWorldPreset] = useState("");

  const refresh = useCallback(async () => {
    if (!worldId) return;
    try {
      const list = await fetchSaves();
      setSaves(list);
    } catch {
      /* ignore */
    }
  }, [worldId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load LLM presets + world preset
  useEffect(() => {
    (async () => {
      try {
        const [presets, session] = await Promise.all([fetchLLMPresets(), fetchSession()]);
        setPresetList(presets);
        setWorldPreset(session.llmPreset || "");
      } catch {
        /* ignore */
      }
    })();
  }, [worldId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      const slotId = `save_${ts}`;
      const res = await createSave(slotId, newName.trim());
      if (!res.success) {
        alert(res.message);
        return;
      }
      setCreating(false);
      setNewName("");
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = (slotId: string) => {
    showConfirm(
      { title: t("confirm.title"), message: t("confirm.loadSave"), confirmLabel: t("btn.load") },
      async () => {
        setLoading(true);
        try {
          const res = await loadSave(slotId);
          if (!res.success) {
            alert(res.message);
            return;
          }
        } finally {
          setLoading(false);
        }
      },
    );
  };

  const handleDelete = (slotId: string) => {
    showConfirm(
      { title: t("confirm.title"), message: t("confirm.deleteSave"), confirmLabel: t("btn.delete"), danger: true },
      async () => {
        await deleteSave(slotId);
        await refresh();
      },
    );
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
    const current = new Set(addonRefs.map((a) => `${a.id}@${a.version}`));
    const saved = new Set(saveRefs.map((a) => `${a.id}@${a.version}`));
    if (current.size !== saved.size) return true;
    for (const sv of saved) {
      if (!current.has(sv)) return true;
    }
    return false;
  };

  const saveBtnBase = btnClass("default", "sm");

  return (
    <div className={s.wrapper}>
      {/* Save management */}
      {worldId && (
        <>
          <span className={s.sectionTitle}>== {t("header.saveSlots")} ==</span>

          {/* Create save */}
          {!creating ? (
            <div className={s.createRow}>
              <button
                onClick={() => setCreating(true)}
                disabled={loading || saves.length >= MAX_SLOTS}
                className={saveBtnBase}
                style={{
                  color: saves.length >= MAX_SLOTS ? T.textFaint : T.successDim,
                  borderColor: saves.length >= MAX_SLOTS ? T.border : `${T.success}66`,
                  opacity: saves.length >= MAX_SLOTS ? 0.5 : 1,
                  cursor: saves.length >= MAX_SLOTS ? "not-allowed" : "pointer",
                }}
              >
                [{t("btn.createSave")}]
              </button>
              {saves.length >= MAX_SLOTS && (
                <span className={s.maxSlotsHint}>{t("save.maxSlots", { max: MAX_SLOTS })}</span>
              )}
            </div>
          ) : (
            <div className={s.createInputRow}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder={t("save.namePlaceholder")}
                className={s.input}
                style={{ flex: 1, maxWidth: 200 }}
              />
              <button
                onClick={handleCreate}
                disabled={loading || !newName.trim()}
                className={saveBtnBase}
                style={{ opacity: !newName.trim() ? 0.5 : 1 }}
              >
                {t("btn.confirm")}
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(""); }}
                className={saveBtnBase}
              >
                {t("btn.cancel")}
              </button>
            </div>
          )}

          {/* Save list */}
          <div className={s.saveList}>
            {saves.map((sv) => {
              const mismatch = addonMismatch(sv.addonRefs);
              const isRenaming = renamingId === sv.slotId;
              return (
                <div key={sv.slotId} className={s.saveRow}>
                  {/* Left: name + metadata */}
                  <div className={s.saveInfo}>
                    {isRenaming ? (
                      <div className={s.renameRow}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(sv.slotId);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className={s.input}
                          style={{ flex: 1, maxWidth: 180 }}
                        />
                        <button onClick={() => handleRename(sv.slotId)} className={saveBtnBase}>
                          {t("btn.confirm")}
                        </button>
                        <button onClick={() => setRenamingId(null)} className={saveBtnBase}>
                          {t("btn.cancel")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className={s.saveName}>{sv.name}</div>
                        <div className={s.saveMeta}>
                          {sv.gameTimeDisplay}
                          <span className={s.metaDot}>&middot;</span>
                          {sv.timestamp?.replace("T", " ")}
                          {mismatch && (
                            <span className={s.mismatchBadge} title={t("save.versionMismatchTip")}>
                              [{t("save.versionMismatch")}]
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: action buttons */}
                  {!isRenaming && (
                    <div className={s.actionBtns}>
                      <button onClick={() => handleLoad(sv.slotId)} disabled={loading} className={saveBtnBase}>
                        [{t("btn.loadSave")}]
                      </button>
                      <button
                        onClick={() => { setRenamingId(sv.slotId); setRenameValue(sv.name); }}
                        className={saveBtnBase}
                      >
                        [{t("btn.renameSave")}]
                      </button>
                      <button
                        onClick={() => handleDelete(sv.slotId)}
                        className={saveBtnBase}
                        style={{ color: T.danger, borderColor: `${T.danger}66` }}
                      >
                        [{t("btn.delete")}]
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {saves.length === 0 && <div className={s.emptyText}>{t("empty.saves")}</div>}
          </div>
        </>
      )}

      {/* World-level LLM preset */}
      {worldId && (
        <>
          <span className={s.sectionTitle}>== {t("header.llmPresets")} ==</span>
          <div className={s.presetRow}>
            <span className={s.presetLabel}>{t("world.worldPreset")}</span>
            <select
              className={clsx(s.input, s.inputW200)}
              value={worldPreset}
              onChange={async (e) => {
                const val = e.target.value;
                setWorldPreset(val);
                await updateWorldMeta(worldId, { llmPreset: val });
              }}
            >
              <option value="">{t("llm.followGlobal")}</option>
              {presetList.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
            <span className={s.presetHint}>{t("world.overrideGlobal")}</span>
          </div>
        </>
      )}

      {/* Restart — destructive, placed last */}
      {worldId && (
        <>
          <span className={s.sectionTitle}>== {t("header.dangerZone")} ==</span>
          <div className={s.dangerRow}>
            <button
              onClick={onRestart}
              className={saveBtnBase}
              style={{ background: T.dangerBg, color: T.danger, borderColor: `${T.danger}66` }}
            >
              [{t("btn.restartGame")}]
            </button>
            <span className={s.dangerHint}>{t("save.restartHint")}</span>
          </div>
        </>
      )}
      {confirmUI}
    </div>
  );
}
