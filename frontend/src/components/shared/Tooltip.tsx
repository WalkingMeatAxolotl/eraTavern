import s from "./Tooltip.module.css";

export function Tooltip({ text, anchorRef }: { text: string; anchorRef: HTMLElement | null }) {
  if (!anchorRef || !text) return null;
  const rect = anchorRef.getBoundingClientRect();
  return (
    <div
      className={s.tooltip}
      style={{
        left: rect.left + rect.width / 2,
        top: rect.top - 4,
      }}
    >
      {text}
    </div>
  );
}
