import T from "../../theme";
import { t } from "../../i18n/ui";
import type { LLMPromptEntry } from "../../types/game";
import { BUILTIN_CONTEXT_ENTRY_ID, VARIABLE_GROUPS, inputStyle, sectionStyle } from "./LLMPresetManager";
import { btn, labelStyle } from "../shared/styles";

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
    system: T.accent,
    user: T.success,
    assistant: "#8888cc",
  };

  return (
    <div style={{ marginBottom: "4px" }}>
      {/* Collapsed row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          backgroundColor: expanded ? T.bg2 : T.bg1,
          border: `1px solid ${expanded ? T.borderLight : T.border}`,
          borderRadius: "3px",
          cursor: "pointer",
        }}
        onClick={onToggle}
      >
        <button
          style={{
            background: "none",
            border: "none",
            color: T.textDim,
            cursor: "pointer",
            fontSize: "11px",
            padding: "0 2px",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onMove(-1);
          }}
          disabled={index === 0}
        >
          ▲
        </button>
        <button
          style={{
            background: "none",
            border: "none",
            color: T.textDim,
            cursor: "pointer",
            fontSize: "11px",
            padding: "0 2px",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onMove(1);
          }}
          disabled={index === total - 1}
        >
          ▼
        </button>
        <input
          type="checkbox"
          checked={entry.enabled}
          onChange={(e) => {
            e.stopPropagation();
            onChange({ ...entry, enabled: e.target.checked });
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ accentColor: T.accent }}
        />
        <span
          style={{ color: roleColors[entry.role] || T.textSub, fontSize: "11px", fontWeight: "bold", minWidth: "50px" }}
        >
          {entry.role}
        </span>
        <span
          style={{
            color: isBuiltin ? T.accent : T.text,
            fontSize: "12px",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontStyle: isBuiltin ? "italic" : "normal",
          }}
        >
          {isBuiltin ? `🔒 ${t("llm.builtinContext")}` : entry.name || entry.id}
        </span>
        <span style={{ color: T.textDim, fontSize: "10px" }}>{expanded ? "▼" : "▶"}</span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ ...sectionStyle, marginTop: "4px", marginBottom: "8px" }}>
          {isBuiltin ? (
            /* Builtin context entry — only role selector + hint */
            <>
              <div style={{ display: "flex", gap: "12px", marginBottom: "6px", alignItems: "center" }}>
                <div style={{ width: "120px" }}>
                  <div style={labelStyle}>{t("field.role")}</div>
                  <select
                    style={{ ...inputStyle }}
                    value={entry.role}
                    onChange={(e) => onChange({ ...entry, role: e.target.value as LLMPromptEntry["role"] })}
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                  </select>
                </div>
              </div>
              <div style={{ color: T.textDim, fontSize: "12px", padding: "8px", backgroundColor: T.bg3, borderRadius: "3px" }}>
                {t("llm.builtinContextHint")}
              </div>
            </>
          ) : (
            /* Regular entry — full editor */
            <>
              <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>{t("field.name")}</div>
                  <input
                    style={inputStyle}
                    value={entry.name}
                    onChange={(e) => onChange({ ...entry, name: e.target.value })}
                  />
                </div>
                <div style={{ width: "120px" }}>
                  <div style={labelStyle}>{t("field.role")}</div>
                  <select
                    style={{ ...inputStyle }}
                    value={entry.role}
                    onChange={(e) => onChange({ ...entry, role: e.target.value as LLMPromptEntry["role"] })}
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                </div>
              </div>

              <div style={labelStyle}>{t("field.content")}</div>
              <textarea
                ref={contentRef}
                style={{ ...inputStyle, minHeight: "100px", resize: "vertical", fontFamily: T.fontMono }}
                value={entry.content}
                onChange={(e) => onChange({ ...entry, content: e.target.value })}
              />

              {/* Variable chips — only for narrative presets */}
              {!isAssistPreset && (
                <div style={{ marginTop: "6px", padding: "6px 8px", backgroundColor: T.bg3, borderRadius: "3px" }}>
                  <div style={{ ...labelStyle, marginBottom: "4px" }}>{t("llm.availableVars")}</div>
                  {VARIABLE_GROUPS.map((g) => (
                    <div key={g.label} style={{ marginBottom: "2px" }}>
                      <span style={{ color: T.textDim, fontSize: "10px", marginRight: "6px" }}>{g.label}:</span>
                      {g.vars.map((v) => (
                        <button
                          key={v.name}
                          title={v.desc}
                          style={{
                            padding: "1px 6px",
                            margin: "1px 2px",
                            backgroundColor: T.bg2,
                            color: T.accent,
                            border: `1px solid ${T.border}`,
                            borderRadius: "2px",
                            cursor: "pointer",
                            fontSize: "11px",
                            fontFamily: T.fontMono,
                          }}
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

              <div style={{ marginTop: "6px" }}>
                <button style={btn("danger")} onClick={onDelete}>
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
