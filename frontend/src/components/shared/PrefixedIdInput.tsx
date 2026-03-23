import clsx from "clsx";
import s from "./PrefixedIdInput.module.css";

interface Props {
  prefix: string;
  value: string;
  onChange: (localId: string) => void;
  disabled?: boolean;
}

/**
 * ID input with a non-editable addon prefix.
 * Shows "base." as a dimmed label, user only edits the local part.
 */
export default function PrefixedIdInput({ prefix, value, onChange, disabled }: Props) {
  return (
    <div className={s.wrapper}>
      {prefix && <span className={s.prefix}>{prefix}.</span>}
      <input
        className={clsx(s.input, prefix && s.inputWithPrefix)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
