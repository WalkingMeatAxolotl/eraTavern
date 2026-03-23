import { useRef, useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import { t } from "../../i18n/ui";
import s from "./ColorPicker.module.css";

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
    <div className={s.wrapper}>
      {/* Recent color swatches */}
      {recent.map((color) => (
        <button
          key={color}
          onClick={() => handleSwatchClick(color)}
          title={color}
          className={clsx(s.swatch, color.toLowerCase() === value.toLowerCase() && s.swatchActive)}
          style={{ backgroundColor: color }}
        />
      ))}
      {/* Native color picker */}
      <button
        onClick={() => inputRef.current?.click()}
        className={s.pickerBtn}
        style={{ backgroundColor: value }}
        title={t("ui.pickColor")}
      >
        <span className={s.pickerIcon}>+</span>
      </button>
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={handleLivePreview}
        className={s.hiddenInput}
      />
    </div>
  );
}
