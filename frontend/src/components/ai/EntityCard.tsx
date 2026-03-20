/**
 * EntityCard — structured preview of an entity from AI output.
 *
 * Shows id, name, key fields in a compact card.
 * Can expand to show full JSON.
 * Displays action buttons based on context (confirm/reject for tool calls,
 * accept for text suggestions).
 */
import { useState } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";

interface Props {
  entityType: string;
  entity: Record<string, unknown>;
  /** Show confirm/reject buttons when pending */
  mode?: "confirm";
  confirmLabel?: string;
  onConfirm?: () => void;
  onReject?: () => void;
  disabled?: boolean;
}

const cardStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: "4px",
  padding: "8px 10px",
  backgroundColor: T.bg2,
  marginTop: "6px",
  marginBottom: "4px",
  fontSize: "12px",
};

const fieldRow: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  marginBottom: "2px",
};

const fieldLabel: React.CSSProperties = {
  color: T.textDim,
  minWidth: "50px",
  flexShrink: 0,
};

const fieldValue: React.CSSProperties = {
  color: T.text,
  wordBreak: "break-word",
};

const btnBase: React.CSSProperties = {
  padding: "3px 10px",
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "11px",
  backgroundColor: T.bg1,
};

export default function EntityCard({ entityType, entity, mode, confirmLabel, onConfirm, onReject, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);

  const id = String(entity.id ?? "");
  const name = String(entity.name ?? "");

  // Key fields by entity type
  const keyFields: { label: string; value: string }[] = [];
  if (entityType === "trait" && entity.category) {
    keyFields.push({ label: "category", value: String(entity.category) });
  }
  if (entityType === "clothing" && Array.isArray(entity.slots)) {
    keyFields.push({ label: "slots", value: (entity.slots as string[]).join(", ") });
  }
  if (entityType === "item" && Array.isArray(entity.tags) && (entity.tags as string[]).length > 0) {
    keyFields.push({ label: "tags", value: (entity.tags as string[]).join(", ") });
  }
  const desc = entity.description ? String(entity.description) : "";

  return (
    <div style={cardStyle}>
      {/* Header: id + name */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span>
          <span style={{ color: T.accent, fontWeight: "bold" }}>{id}</span>
          {name && <span style={{ color: T.text, marginLeft: "8px" }}>{name}</span>}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ ...btnBase, color: T.textSub, fontSize: "10px" }}
        >
          [{expanded ? t("ai.collapseJson") : t("ai.expandJson")}]
        </button>
      </div>

      {/* Key fields */}
      {keyFields.map((f) => (
        <div key={f.label} style={fieldRow}>
          <span style={fieldLabel}>{f.label}:</span>
          <span style={fieldValue}>{f.value}</span>
        </div>
      ))}
      {desc && (
        <div style={{ color: T.textSub, fontSize: "11px", marginTop: "2px" }}>
          {desc.length > 80 ? desc.slice(0, 80) + "..." : desc}
        </div>
      )}

      {/* Expanded JSON */}
      {expanded && (
        <pre
          style={{
            marginTop: "6px",
            padding: "6px 8px",
            backgroundColor: T.bg3,
            borderRadius: "3px",
            fontSize: "11px",
            fontFamily: T.fontMono,
            color: T.text,
            overflow: "auto",
            maxHeight: "200px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(entity, null, 2)}
        </pre>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
        {mode === "confirm" && (
          <>
            <button
              onClick={onConfirm}
              disabled={disabled}
              style={{ ...btnBase, color: T.success, borderColor: T.success }}
            >
              [{confirmLabel || t("ai.confirm")}]
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              style={{ ...btnBase, color: T.danger, borderColor: T.danger }}
            >
              [{t("ai.reject")}]
            </button>
          </>
        )}
      </div>
    </div>
  );
}
