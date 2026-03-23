import { t } from "../../i18n/ui";
import type { LLMPromptEntry } from "../../types/game";
import { BUILTIN_CONTEXT_ENTRY_ID, VARIABLE_GROUPS } from "./LLMPresetManager";
import { btnClass } from "../shared/buttons";
import clsx from "clsx";
import s from "./PromptEntryRow.module.css";
import sh from "../shared/shared.module.css";

export default function PromptEntryRow({
  entry,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onMove,
  onDelete,
  contentRef,
  isAssistPreset,
}: {
  entry: LLMPromptEntry;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (e: LLMPromptEntry) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  contentRef: React.RefObject<HTMLTextAreaElement | null>;
  isAssistPreset?: boolean;
}) {
  const isBuiltin = entry.id === BUILTIN_CONTEXT_ENTRY_ID;
  const roleColors: Record<string, string> = {
    system: "var(--accent)",
    user: "var(--success)",
    assistant: "#8888cc",
  };

  return (
    <div className={s.wrapper}>
      {/* Collapsed row */}
      <div
        className={clsx(s.row, expanded && s.rowExpanded)}
        onClick={onToggle}
      >
        <button
          className={s.moveBtn}
          onClick={(e) => { e.stopPropagation(); onMove(-1); }}
          disabled={index === 0}
        >
          ▲
        </button>
        <button
          className={s.moveBtn}
          onClick={(e) => { e.stopPropagation(); onMove(1); }}
          disabled={index === total - 1}
        >
          ▼
        </button>
        <input
          type="checkbox"
          checked={entry.enabled}
          onChange={(e) => { e.stopPropagation(); onChange({ ...entry, enabled: e.target.checked }); }}
          onClick={(e) => e.stopPropagation()}
          style={{ accentColor: "var(--accent)" }}
        />
        <span className={s.roleName} style={{ color: roleColors[entry.role] || "var(--text-sub)" }}>
          {entry.role}
        </span>
        <span className={clsx(s.entryName, isBuiltin && s.entryNameBuiltin)}>
          {isBuiltin ? `🔒 ${t("llm.builtinContext")}` : entry.name || entry.id}
        </span>
        <span className={s.expandArrow}>{expanded ? "▼" : "▶"}</span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className={s.section}>
          {isBuiltin ? (
            /* Builtin context entry — only role selector + hint */
            <>
              <div className={s.builtinRow}>
                <div className={s.w120}>
                  <div className={sh.label}>{t("field.role")}</div>
                  <select
                    className={s.inputFull}
                    value={entry.role}
                    onChange={(e) => onChange({ ...entry, role: e.target.value as LLMPromptEntry["role"] })}
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                  </select>
                </div>
              </div>
              <div className={s.builtinHint}>
                {t("llm.builtinContextHint")}
              </div>
            </>
          ) : (
            /* Regular entry — full editor */
            <>
              <div className={s.flexRow}>
                <div className={s.flex1}>
                  <div className={sh.label}>{t("field.name")}</div>
                  <input
                    className={s.inputFull}
                    value={entry.name}
                    onChange={(e) => onChange({ ...entry, name: e.target.value })}
                  />
                </div>
                <div className={s.w120}>
                  <div className={sh.label}>{t("field.role")}</div>
                  <select
                    className={s.inputFull}
                    value={entry.role}
                    onChange={(e) => onChange({ ...entry, role: e.target.value as LLMPromptEntry["role"] })}
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                </div>
              </div>

              <div className={sh.label}>{t("field.content")}</div>
              <textarea
                ref={contentRef}
                className={s.contentArea}
                value={entry.content}
                onChange={(e) => onChange({ ...entry, content: e.target.value })}
              />

              {/* Variable chips — only for narrative presets */}
              {!isAssistPreset && (
                <div className={s.varPanel}>
                  <div className={sh.label} style={{ marginBottom: "4px" }}>{t("llm.availableVars")}</div>
                  {VARIABLE_GROUPS.map((g) => (
                    <div key={g.label} className={s.varGroup}>
                      <span className={s.varGroupLabel}>{g.label}:</span>
                      {g.vars.map((v) => (
                        <button
                          key={v.name}
                          title={v.desc}
                          className={s.varChip}
                          onClick={() => {
                            const ta = contentRef.current;
                            if (!ta) return;
                            const tag = `{{${v.name}}}`;
                            const start = ta.selectionStart;
                            const end = ta.selectionEnd;
                            const val = ta.value;
                            const newVal = val.substring(0, start) + tag + val.substring(end);
                            onChange({ ...entry, content: newVal });
                            // Restore cursor after React re-render
                            setTimeout(() => {
                              ta.focus();
                              ta.setSelectionRange(start + tag.length, start + tag.length);
                            }, 0);
                          }}
                        >
                          {`{{${v.name}}}`}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className={s.deleteRow}>
                <button className={btnClass("danger")} onClick={onDelete}>
                  [{t("btn.deleteEntry")}]
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
