/**
 * ToolCallMessage — renders a tool call within the chat.
 *
 * Read-only tools (list_entities, get_schema): collapsed summary, auto-executed.
 * Write tools (create_entity): EntityCard preview + confirm/reject buttons.
 */
import { useState } from "react";
import { t } from "../../i18n/ui";
import EntityCard from "./EntityCard";
import clsx from "clsx";
import s from "./ToolCallMessage.module.css";

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
  character: "角色",
};

export default function ToolCallMessage({ name, arguments: args, status, result, onConfirm, onReject, disabled }: Props) {
  const entityType = (args.entityType as string) || "";
  const entityLabel = ENTITY_LABELS[entityType] || entityType;

  // --- Read-only tools: compact summary ---
  if (name === "list_entities" || name === "get_schema" || name === "get_entities") {
    let summary = "";
    if (name === "list_entities" && result) {
      try {
        const list = JSON.parse(result);
        summary = t("ai.toolListResult", { count: Array.isArray(list) ? list.length : 0, type: entityLabel });
      } catch {
        summary = `list_entities(${entityType})`;
      }
    } else if (name === "get_entities") {
      const ids = (args.entityIds as string[]) || [];
      summary = t("ai.toolGetEntities", { count: ids.length, type: entityLabel });
    } else {
      summary = `get_schema(${entityType})`;
    }

    return (
      <div className={s.wrap}>
        <div className={s.autoRow}>
          <span style={{ color: "var(--success)" }}>⚡</span>
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

  // --- Batch update: multiple entity modifications ---
  if (name === "batch_update") {
    return <BatchUpdateToolCall args={args} entityLabel={entityLabel} entityType={entityType} status={status} result={result} onConfirm={onConfirm} onReject={onReject} disabled={disabled} />;
  }

  // --- Unknown tool ---
  return (
    <div className={s.wrap}>
      <div className={s.autoRow}>
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
        return <div className={s.statusOk}>✓ {resultSummary}</div>;
      }
      if (status === "rejected") {
        return <div className={s.statusFail}>✗ {t("ai.toolRejected")}</div>;
      }
      return null;
    };

    return (
      <div className={s.wrap}>
        {isUpdate && (
          <div className={s.autoRowMb}>
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

function BatchUpdateToolCall({ args, entityLabel, entityType, status, result, onConfirm, onReject, disabled }: {
  args: Record<string, unknown>; entityLabel: string; entityType: string;
  status: ToolCallStatus; result?: string;
  onConfirm?: (overrideArgs?: Record<string, unknown>) => void; onReject?: () => void; disabled?: boolean;
}) {
    const originalUpdates = (args.updates as Array<Record<string, unknown>>) || [];
    const [editedUpdates, setEditedUpdates] = useState<Array<Record<string, unknown>>>([...originalUpdates]);
    const [selected, setSelected] = useState<Set<number>>(() => new Set(originalUpdates.map((_, i) => i)));

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
            <div className={s.statusOk}>
              ✓ {t("ai.batchUpdateResult", { count: r.total || 0, type: entityLabel })}
              {r.errors?.length > 0 && (
                <span className={s.statusFail} style={{ marginLeft: "8px" }}>
                  ({r.errors.length} {t("ai.batchErrors")})
                </span>
              )}
            </div>
          );
        } catch {
          return <div className={s.statusOk}>✓</div>;
        }
      }
      if (status === "rejected") {
        return <div className={s.statusFail}>✗ {t("ai.toolRejected")}</div>;
      }
      return null;
    };

    return (
      <div className={s.wrap}>
        {editedUpdates.map((item, i) => {
          const entityId = String(item.entityId || "");
          const displayName = (item._displayName as string) || "";
          const fields = (item.fields as Record<string, unknown>) || {};
          const fieldNames = Object.keys(fields);
          // Build a pseudo-entity for EntityCard display
          const pseudoEntity = { id: entityId, name: displayName, ...fields };

          return (
            <div key={i} className={s.checkRow}>
              {status === "pending" && (
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  className={s.checkbox}
                />
              )}
              <div style={{ flex: 1 }}>
                <div className={s.autoRowMb}>
                  <span>✏️ {t("ai.toolUpdateTarget", { id: entityId })}: {fieldNames.join(", ")}</span>
                </div>
                <EntityCard
                  entityType={entityType}
                  entity={pseudoEntity}
                  onEntityChange={status === "pending" ? (updated) => {
                    setEditedUpdates((prev) => {
                      const next = [...prev];
                      const { id: _id, name: _n, _displayName: _d, ...updatedFields } = updated;
                      next[i] = { ...next[i], fields: updatedFields };
                      return next;
                    });
                  } : undefined}
                />
              </div>
            </div>
          );
        })}
        {status === "pending" && (
          <div className={s.batchRow}>
            <button
              onClick={() => {
                const selectedUpdates = editedUpdates.filter((_, i) => selected.has(i));
                onConfirm?.({ ...args, updates: selectedUpdates });
              }}
              disabled={disabled || selected.size === 0}
              className={clsx(s.batchConfirmBtn, (disabled || selected.size === 0) && s.batchConfirmBtnDisabled)}
            >
              [{t("ai.confirmBatchUpdate", { count: selected.size })}]
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              className={s.batchRejectBtn}
            >
              [{t("ai.reject")}]
            </button>
          </div>
        )}
        {batchStatusBadge()}
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
            <div className={s.statusOk}>
              ✓ {t("ai.batchCreateResult", { count: r.total || 0, type: entityLabel })}
              {r.errors?.length > 0 && (
                <span className={s.statusFail} style={{ marginLeft: "8px" }}>
                  ({r.errors.length} {t("ai.batchErrors")})
                </span>
              )}
            </div>
          );
        } catch {
          return <div className={s.statusOk}>✓</div>;
        }
      }
      if (status === "rejected") {
        return <div className={s.statusFail}>✗ {t("ai.toolRejected")}</div>;
      }
      return null;
    };

    return (
      <div className={s.wrap}>
        {editedEntities.map((entity, i) => (
          <div key={i} className={s.checkRow}>
            {status === "pending" && (
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleSelect(i)}
                className={s.checkbox}
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
          <div className={s.batchRow}>
            <button
              onClick={() => {
                const selectedEntities = editedEntities.filter((_, i) => selected.has(i));
                onConfirm?.({ ...args, entities: selectedEntities });
              }}
              disabled={disabled || selected.size === 0}
              className={clsx(s.batchConfirmBtn, (disabled || selected.size === 0) && s.batchConfirmBtnDisabled)}
            >
              [{t("ai.confirmBatch", { count: selected.size })}]
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              className={s.batchRejectBtn}
            >
              [{t("ai.reject")}]
            </button>
          </div>
        )}
        {batchStatusBadge()}
      </div>
    );
}
