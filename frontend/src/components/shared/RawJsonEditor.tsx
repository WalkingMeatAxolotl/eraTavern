import { useState, useCallback, useRef, useEffect } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import { readRawFile, writeRawFile } from "../../api/client";
import { ConfirmModal } from "./Modal";
import { btn } from "./styles";

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

const SYN = {
  key: "#6ec6ff", // blue — keys
  str: "#7ecf7e", // green — string values
  num: "#e8a040", // orange — numbers
  bool: "#c78dff", // purple — true/false/null
  bracket: "#888", // dim — [] {}
  punct: "#d8d8d8", // white — : ,
};

const synStyles = `
  .jsyn-k { color: ${SYN.key}; }
  .jsyn-s { color: ${SYN.str}; }
  .jsyn-n { color: ${SYN.num}; }
  .jsyn-b { color: ${SYN.bool}; }
  .jsyn-p { color: ${SYN.bracket}; }
  .jsyn-w { color: ${SYN.punct}; }
`;

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
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div
        ref={scrollContainerRef}
        onScroll={handleContainerScroll}
        style={{
          display: "flex",
          border: `1px solid ${error ? T.danger : T.borderLight}`,
          borderRadius: "4px",
          overflow: "auto",
          maxHeight: "70vh",
          backgroundColor: T.bg1,
        }}
      >
        {/* Line number gutter */}
        <div
          style={{
            width: gutterWidth,
            minWidth: gutterWidth,
            height: contentHeight,
            backgroundColor: T.bg0,
            borderRight: `1px solid ${T.borderDim}`,
            padding: `${PAD}px 0`,
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              style={{
                height: `${FONT_SIZE * LINE_H}px`,
                lineHeight: `${FONT_SIZE * LINE_H}px`,
                fontSize: FONT_SIZE,
                fontFamily: FONT,
                color: T.textDim,
                textAlign: "right",
                paddingRight: "8px",
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code area: pre (highlighted) + textarea (input) stacked */}
        <div style={{ position: "relative", flex: 1, height: contentHeight }}>
          {/* Highlighted layer (behind textarea) */}
          <pre
            ref={preRef}
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              margin: 0,
              padding: PAD,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: LINE_H,
              color: T.text,
              overflow: "hidden",
              whiteSpace: "pre",
              pointerEvents: "none",
              tabSize: 2,
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
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              margin: 0,
              padding: PAD,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: LINE_H,
              color: "transparent",
              caretColor: T.text,
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              whiteSpace: "pre",
              tabSize: 2,
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>
      {error && <div style={{ color: T.danger, fontSize: "11px" }}>{error}</div>}
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
    return <div style={{ color: T.textDim, padding: "20px", textAlign: "center" }}>{t("status.loading")}</div>;
  }

  return (
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <style>{synStyles}</style>

      {/* Header */}
      <div style={{ marginBottom: "6px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {filename} ==
        </span>
      </div>

      {/* Warning banner with inline back link */}
      <div
        style={{
          padding: "6px 10px",
          marginBottom: "8px",
          backgroundColor: "#1a1408",
          border: `1px solid ${T.accentDim}`,
          borderRadius: "3px",
          color: T.accent,
          fontSize: "11px",
          lineHeight: 1.5,
        }}
      >
        {t("json.warning")}{" "}
        <span
          onClick={onClose}
          style={{
            fontStyle: "italic",
            textDecoration: "underline",
            cursor: "pointer",
            color: T.textSub,
          }}
        >
          {t("json.backToList")}
        </span>
      </div>

      <CodeEditor value={text} onChange={handleChange} error={error} />

      {/* Action bar */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
        <button onClick={onClose} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
        <button onClick={() => setShowConfirm(true)} disabled={saving} style={{ ...btn("danger"), ...(saving && { cursor: "not-allowed" }) }}>
          [{t("json.saveAndReload")}]
        </button>
        {message && (
          <span style={{ color: message.includes(t("json.savedKeyword")) ? T.success : T.danger, fontSize: "12px" }}>
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
    <div style={{ fontSize: "13px", color: T.text, padding: "12px 0" }}>
      <style>{synStyles}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>== JSON ==</span>
        <button onClick={onToggle} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>
      <CodeEditor value={text} onChange={handleChange} error={error} />
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
        <button onClick={handleSave} disabled={saving} style={{ ...btn("create"), ...(saving && { cursor: "not-allowed" }) }}>
          [{t("btn.confirm")}]
        </button>
        {message && (
          <span style={{ color: message === t("status.saved") ? T.success : T.danger, fontSize: "12px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
