import T from "../../theme";

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
    <div style={{ display: "flex", alignItems: "center", width: "100%", boxSizing: "border-box" }}>
      {prefix && (
        <span
          style={{
            padding: "4px 2px 4px 8px",
            backgroundColor: T.bg2,
            color: T.textDim,
            border: `1px solid ${T.borderLight}`,
            borderRight: "none",
            borderRadius: "3px 0 0 3px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {prefix}.
        </span>
      )}
      <input
        style={{
          flex: 1,
          padding: "4px 8px",
          backgroundColor: T.bg3,
          color: T.text,
          border: `1px solid ${T.borderLight}`,
          borderRadius: prefix ? "0 3px 3px 0" : "3px",
          fontSize: "12px",
          boxSizing: "border-box",
          minWidth: 0,
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
