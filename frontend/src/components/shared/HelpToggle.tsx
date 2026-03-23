import { useState } from "react";
import clsx from "clsx";
import s from "./HelpToggle.module.css";

// Re-export CSS module classes for consumers
export { default as helpStyles } from "./HelpToggle.module.css";

interface Props {
  children: React.ReactNode;
}

/**
 * [?] toggle button. Renders help panel below the button's parent via portal-like pattern.
 * Usage: place <HelpToggle> as last child in a label/header row.
 */
export function HelpButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={clsx(s.helpBtn, show && s.helpBtnActive)}>
      [?]
    </button>
  );
}

export function HelpPanel({ children }: Props) {
  return <div className={clsx(s.helpBox, s.helpPanel)}>{children}</div>;
}

/**
 * Combined [?] button + panel. Must be placed in its own container (not inside a flex row).
 * For flex row usage, use HelpButton + HelpPanel separately.
 */
export default function HelpToggle({ children }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className={s.wrapper}>
      <HelpButton show={show} onToggle={() => setShow((v) => !v)} />
      {show && <HelpPanel>{children}</HelpPanel>}
    </div>
  );
}
