import { useState, useCallback, useRef, useEffect } from "react";
import clsx from "clsx";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { readRawFile, writeRawFile } from "../../api/client";
import { ConfirmModal } from "./Modal";
import { btn } from "./styles";
import s from "./RawJsonEditor.module.css";

// ── Strip internal fields for editor-level display ──

const INTERNAL_KEYS = new Set(["source", "_source", "_local_id"]);

function stripInternal(entity: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (!INTERNAL_KEYS.has(k)) result[k] = v;
  }
  return result;
}

// ── Syntax highlighting ──

/** Simple JSON syntax highlighter — returns HTML string. */
function highlightJson(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|([[\]{}])|([:,])/g,
    (_match, str, colon, num, kw, bracket, punct) => {
      if (str) {
        if (colon) return `<span class="jsyn-k">${str}</span><span class="jsyn-w">${colon}</span>`;
        return `<span class="jsyn-s">${str}</span>`;
      }
      if (num) return `<span class="jsyn-n">${num}</span>`;
      if (kw) return `<span class="jsyn-b">${kw}</span>`;
      if (bracket) return `<span class="jsyn-p">${bracket}</span>`;
      if (punct) return `<span class="jsyn-w">${punct}</span>`;
      return _match;
    },
  );
}

// ── Code editor with line numbers + syntax highlighting ──

const FONT = `${T.fontMono}`;
const LINE_H = 1.5;
const FONT_SIZE = 12;
const PAD = 8;

function CodeEditor({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  // Sync horizontal scroll from container to pre (vertical is automatic via shared container)
  const handleContainerScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !preRef.current) return;
    preRef.current.scrollLeft = container.scrollLeft;
  }, []);

  // Handle Tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newVal = value.substring(0, start) + "  " + value.substring(end);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange],
  );


  const gutterWidth = Math.max(String(lineCount).length * 9 + 16, 36);

  const contentHeight = lineCount * FONT_SIZE * LINE_H + PAD * 2;

  return (
    <div className={s.codeEditor}>
      <div
        ref={scrollContainerRef}
        onScroll={handleContainerScroll}
        className={clsx(s.codeScrollContainer, error && s.codeScrollContainerError)}
      >
        {/* Line number gutter */}
        <div
          className={s.codeGutter}
          style={{
            width: gutterWidth,
            minWidth: gutterWidth,
            height: contentHeight,
            padding: `${PAD}px 0`,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              className={s.lineNumber}
              style={{
                height: `${FONT_SIZE * LINE_H}px`,
                lineHeight: `${FONT_SIZE * LINE_H}px`,
                fontSize: FONT_SIZE,
                fontFamily: FONT,
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code area: pre (highlighted) + textarea (input) stacked */}
        <div className={s.codeArea} style={{ height: contentHeight }}>
          {/* Highlighted layer (behind textarea) */}
          <pre
            ref={preRef}
            aria-hidden
            className={s.highlightLayer}
            style={{
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: LINE_H,
              padding: PAD,
            }}
            dangerouslySetInnerHTML={{ __html: highlightJson(value) + "\n" }}
          />

          {/* Editable textarea (transparent text, visible caret) */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            className={s.textarea}
            style={{
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: LINE_H,
              padding: PAD,
            }}
          />
        </div>
      </div>
      {error && <div className={s.codeError}>{error}</div>}
    </div>
  );
}

// ── Manager-level: inline full-page JSON view (direct file read/write) ──

export function RawJsonView({
  addonId,
  filename,
  onClose,
}: {
  addonId: string;
  filename: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  // Load file content from disk
  useEffect(() => {
    setLoading(true);
    readRawFile(addonId, filename)
      .then((res) => {
        setText(res.content);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [addonId, filename]);

  const handleChange = useCallback((v: string) => {
    setText(v);
    setError("");
    setMessage("");
  }, []);

  const handleSave = async () => {
    setShowConfirm(false);
    // Parse + format before saving
    let formatted: string;
    try {
      const parsed = JSON.parse(text);
      formatted = JSON.stringify(parsed, null, 2);
    } catch (e) {
      setError(t("json.parseError") + ": " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setText(formatted);
    setSaving(true);
    setMessage("");
    try {
      const result = await writeRawFile(addonId, filename, formatted);
      setMessage(result.message);
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={s.jsonLoading}>{t("status.loading")}</div>;
  }

  return (
    <div className={s.jsonView}>
      {/* Header */}
      <div className={s.jsonViewHeader}>
        <span className={s.jsonTitle}>
          == {filename} ==
        </span>
      </div>

      {/* Warning banner with inline back link */}
      <div className={s.jsonWarning}>
        {t("json.warning")}{" "}
        <span onClick={onClose} className={s.jsonBackLink}>
          {t("json.backToList")}
        </span>
      </div>

      <CodeEditor value={text} onChange={handleChange} error={error} />

      {/* Action bar */}
      <div className={s.jsonActionBar}>
        <button onClick={onClose} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
        <button onClick={() => setShowConfirm(true)} disabled={saving} style={{ ...btn("danger"), ...(saving && { cursor: "not-allowed" }) }}>
          [{t("json.saveAndReload")}]
        </button>
        {message && (
          <span className={message.includes(t("json.savedKeyword")) ? s.statusSuccess : s.statusError}>
            {message}
          </span>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          title={t("json.confirmTitle")}
          message={t("json.confirmMessage")}
          confirmLabel={t("json.saveAndReload")}
          danger
          onConfirm={handleSave}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Editor-level: inline JSON panel replacing form ──

export function RawJsonPanel({
  data,
  onSave,
  onToggle,
}: {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<{ success: boolean; message: string }>;
  onToggle: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(stripInternal(data), null, 2));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = useCallback((v: string) => {
    setText(v);
    setError("");
    setMessage("");
  }, []);

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(t("json.parseError") + ": " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setError(t("json.mustBeObject"));
      return;
    }
    setText(JSON.stringify(parsed, null, 2));
    setSaving(true);
    setMessage("");
    try {
      const result = await onSave(parsed as Record<string, unknown>);
      if (result.success) {
        setMessage(t("status.saved"));
      } else {
        setMessage(result.message);
      }
    } catch (e) {
      setMessage(t("msg.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.jsonView}>
      <div className={s.jsonPanelHeader}>
        <span className={s.jsonTitle}>== JSON ==</span>
        <button onClick={onToggle} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>
      <CodeEditor value={text} onChange={handleChange} error={error} />
      <div className={s.jsonActionBar}>
        <button onClick={handleSave} disabled={saving} style={{ ...btn("create"), ...(saving && { cursor: "not-allowed" }) }}>
          [{t("btn.confirm")}]
        </button>
        {message && (
          <span className={message === t("status.saved") ? s.statusSuccess : s.statusError}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
