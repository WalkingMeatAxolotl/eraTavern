import { useRef, useState, useEffect, useCallback } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";

const STORAGE_KEY = "tavern_recent_colors";
const MAX_RECENT = 10;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(colors: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

/** Add a color to recent list (front), deduplicate, trim to MAX_RECENT */
function pushRecent(color: string): string[] {
  const normalized = color.toLowerCase();
  const prev = loadRecent().filter((c) => c.toLowerCase() !== normalized);
  const next = [normalized, ...prev].slice(0, MAX_RECENT);
  saveRecent(next);
  return next;
}

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync recent across multiple ColorPicker instances via storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRecent(loadRecent());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Native 'change' event fires only when picker closes (final color chosen)
  // React's onChange fires on every input change, so we use native event instead
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleChange = (e: Event) => {
      const color = (e.target as HTMLInputElement).value;
      onChangeRef.current(color);
      setRecent(pushRecent(color));
    };
    el.addEventListener("change", handleChange);
    return () => el.removeEventListener("change", handleChange);
  }, []);

  // React onChange (= native input event) for live preview while dragging
  const handleLivePreview = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleSwatchClick = useCallback(
    (color: string) => {
      onChange(color);
      setRecent(pushRecent(color));
    },
    [onChange],
  );

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
      {/* Recent color swatches */}
      {recent.map((color) => (
        <button
          key={color}
          onClick={() => handleSwatchClick(color)}
          title={color}
          style={{
            width: "16px",
            height: "16px",
            backgroundColor: color,
            border:
              color.toLowerCase() === value.toLowerCase() ? `2px solid ${T.accent}` : `1px solid ${T.borderLight}`,
            borderRadius: "2px",
            cursor: "pointer",
            padding: 0,
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        />
      ))}
      {/* Native color picker */}
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          width: "16px",
          height: "16px",
          backgroundColor: value,
          border: `1px solid ${T.borderLight}`,
          borderRadius: "2px",
          cursor: "pointer",
          padding: 0,
          boxSizing: "border-box",
          flexShrink: 0,
          position: "relative",
        }}
        title={t("ui.pickColor")}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            color: "#fff",
            textShadow: "0 0 2px #000, 0 0 2px #000",
            lineHeight: 1,
          }}
        >
          +
        </span>
      </button>
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={handleLivePreview}
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
