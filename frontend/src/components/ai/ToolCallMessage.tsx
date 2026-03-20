/**
 * ToolCallMessage — renders a tool call within the chat.
 *
 * Read-only tools (list_entities, get_schema): collapsed summary, auto-executed.
 * Write tools (create_entity): EntityCard preview + confirm/reject buttons.
 */
import { useState } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import EntityCard from "./EntityCard";

export type ToolCallStatus = "pending" | "confirmed" | "rejected" | "auto";

interface Props {
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  onConfirm?: (overrideArgs?: Record<string, unknown>) => void;
  onReject?: () => void;
  disabled?: boolean;
}

const ENTITY_LABELS: Record<string, string> = {
  item: "物品",
  trait: "特质",
  clothing: "服装",
  variable: "变量",
  traitGroup: "特质组",
};

const wrapStyle: React.CSSProperties = {
  margin: "4px 0",
  fontSize: "11px",
};

const autoStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: T.bg3,
  borderRadius: "3px",
  color: T.textDim,
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

export default function ToolCallMessage({ name, arguments: args, status, result, onConfirm, onReject, disabled }: Props) {
  const entityType = (args.entityType as string) || "";
  const entityLabel = ENTITY_LABELS[entityType] || entityType;

  // --- Read-only tools: compact summary ---
  if (name === "list_entities" || name === "get_schema") {
    let summary = "";
    if (name === "list_entities" && result) {
      try {
        const list = JSON.parse(result);
        summary = t("ai.toolListResult", { count: Array.isArray(list) ? list.length : 0, type: entityLabel });
      } catch {
        summary = `list_entities(${entityType})`;
      }
    } else {
      summary = `get_schema(${entityType})`;
    }

    return (
      <div style={wrapStyle}>
        <div style={autoStyle}>
          <span style={{ color: T.success }}>⚡</span>
          <span>{summary}</span>
        </div>
      </div>
    );
  }

  // --- Write tools: entity preview + actions ---
  if (name === "create_entity" || name === "update_entity") {
    return <SingleEntityToolCall name={name} args={args} entityLabel={entityLabel} entityType={entityType} status={status} result={result} onConfirm={onConfirm} onReject={onReject} disabled={disabled} />;
  }

  // --- Batch create: multiple entity cards ---
  if (name === "batch_create") {
    return <BatchCreateToolCall args={args} entityLabel={entityLabel} entityType={entityType} status={status} result={result} onConfirm={onConfirm} onReject={onReject} disabled={disabled} />;
  }

  // --- Unknown tool ---
  return (
    <div style={wrapStyle}>
      <div style={autoStyle}>
        <span>🔧 {name}({JSON.stringify(args)})</span>
      </div>
    </div>
  );
}

// --- Sub-components with local state for editing ---

function SingleEntityToolCall({ name, args, entityLabel, entityType, status, result, onConfirm, onReject, disabled }: {
  name: string; args: Record<string, unknown>; entityLabel: string; entityType: string;
  status: ToolCallStatus; result?: string;
  onConfirm?: (overrideArgs?: Record<string, unknown>) => void; onReject?: () => void; disabled?: boolean;
}) {
    const isUpdate = name === "update_entity";
    const initialEntity = name === "create_entity"
      ? (args.entity as Record<string, unknown>) || {}
      : { id: args.entityId as string, name: (args._displayName as string) || "", ...(args.fields as Record<string, unknown> || {}) };
    const [editedEntity, setEditedEntity] = useState(initialEntity);
    const updateFieldNames = isUpdate ? Object.keys((args.fields as object) || {}) : [];

    // Status indicator
    const statusBadge = () => {
      if (status === "confirmed") {
        let resultSummary = "";
        if (result) {
          try {
            const r = JSON.parse(result);
            const msgKey = name === "update_entity" ? "ai.toolUpdateResult" : "ai.toolCreateResult";
            resultSummary = r.success
              ? t(msgKey, { type: entityLabel, name: String(editedEntity.name || editedEntity.id || "") })
              : `❌ ${r.error || "failed"}`;
          } catch {
            resultSummary = "✓";
          }
        }
        return <div style={{ color: T.success, fontSize: "11px", marginTop: "4px" }}>✓ {resultSummary}</div>;
      }
      if (status === "rejected") {
        return <div style={{ color: T.danger, fontSize: "11px", marginTop: "4px" }}>✗ {t("ai.toolRejected")}</div>;
      }
      return null;
    };

    return (
      <div style={wrapStyle}>
        {isUpdate && (
          <div style={{ ...autoStyle, marginBottom: "2px" }}>
            <span>✏️ {t("ai.toolUpdateTarget", { id: String(args.entityId || "") })}: {updateFieldNames.join(", ")}</span>
          </div>
        )}
        <EntityCard
          entityType={entityType}
          entity={editedEntity}
          mode={status === "pending" ? "confirm" : undefined}
          confirmLabel={isUpdate ? t("ai.confirmUpdate") : t("ai.confirm")}
          onConfirm={() => {
            // Build overrideArgs with edited entity data
            if (name === "create_entity") {
              onConfirm?.({ ...args, entity: editedEntity });
            } else {
              const { id: _id, name: _n, _displayName: _d, ...fields } = editedEntity;
              onConfirm?.({ ...args, fields });
            }
          }}
          onReject={onReject}
          onEntityChange={status === "pending" ? setEditedEntity : undefined}
          disabled={disabled}
        />
        {statusBadge()}
      </div>
    );
}

function BatchCreateToolCall({ args, entityLabel, entityType, status, result, onConfirm, onReject, disabled }: {
  args: Record<string, unknown>; entityLabel: string; entityType: string;
  status: ToolCallStatus; result?: string;
  onConfirm?: (overrideArgs?: Record<string, unknown>) => void; onReject?: () => void; disabled?: boolean;
}) {
    const originalEntities = (args.entities as Record<string, unknown>[]) || [];
    const [editedEntities, setEditedEntities] = useState<Record<string, unknown>[]>([...originalEntities]);
    const [selected, setSelected] = useState<Set<number>>(() => new Set(originalEntities.map((_, i) => i)));

    const toggleSelect = (idx: number) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      });
    };

    const batchStatusBadge = () => {
      if (status === "confirmed" && result) {
        try {
          const r = JSON.parse(result);
          return (
            <div style={{ color: T.success, fontSize: "11px", marginTop: "4px" }}>
              ✓ {t("ai.batchCreateResult", { count: r.total || 0, type: entityLabel })}
              {r.errors?.length > 0 && (
                <span style={{ color: T.danger, marginLeft: "8px" }}>
                  ({r.errors.length} {t("ai.batchErrors")})
                </span>
              )}
            </div>
          );
        } catch {
          return <div style={{ color: T.success, fontSize: "11px", marginTop: "4px" }}>✓</div>;
        }
      }
      if (status === "rejected") {
        return <div style={{ color: T.danger, fontSize: "11px", marginTop: "4px" }}>✗ {t("ai.toolRejected")}</div>;
      }
      return null;
    };

    return (
      <div style={wrapStyle}>
        {editedEntities.map((entity, i) => (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
            {status === "pending" && (
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleSelect(i)}
                style={{ marginTop: "10px", accentColor: T.accent }}
              />
            )}
            <div style={{ flex: 1 }}>
              <EntityCard
                entityType={entityType}
                entity={entity}
                onEntityChange={status === "pending" ? (updated) => {
                  setEditedEntities((prev) => {
                    const next = [...prev];
                    next[i] = updated;
                    return next;
                  });
                } : undefined}
              />
            </div>
          </div>
        ))}
        {status === "pending" && (
          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
            <button
              onClick={() => {
                const selectedEntities = editedEntities.filter((_, i) => selected.has(i));
                onConfirm?.({ ...args, entities: selectedEntities });
              }}
              disabled={disabled || selected.size === 0}
              style={{
                padding: "3px 10px",
                border: `1px solid ${T.success}`,
                borderRadius: "3px",
                cursor: selected.size > 0 ? "pointer" : "default",
                fontSize: "11px",
                backgroundColor: T.bg1,
                color: T.success,
              }}
            >
              [{t("ai.confirmBatch", { count: selected.size })}]
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              style={{
                padding: "3px 10px",
                border: `1px solid ${T.danger}`,
                borderRadius: "3px",
                cursor: "pointer",
                fontSize: "11px",
                backgroundColor: T.bg1,
                color: T.danger,
              }}
            >
              [{t("ai.reject")}]
            </button>
          </div>
        )}
        {batchStatusBadge()}
      </div>
    );
}
