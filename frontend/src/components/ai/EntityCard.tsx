/**
 * EntityCard — structured preview of an entity from AI output.
 *
 * Shows id, name, key fields in a compact card.
 * Can expand to show full JSON.
 * Displays action buttons based on context (confirm/reject for tool calls,
 * accept for text suggestions).
 */
import { useState, useCallback } from "react";
import { t } from "../../i18n/ui";
import clsx from "clsx";
import s from "./EntityCard.module.css";

interface Props {
  entityType: string;
  entity: Record<string, unknown>;
  /** Show confirm/reject buttons when pending */
  mode?: "confirm";
  confirmLabel?: string;
  onConfirm?: () => void;
  onReject?: () => void;
  /** When provided, JSON is editable. Called with updated entity on valid edit. */
  onEntityChange?: (updated: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function EntityCard({ entityType, entity, mode, confirmLabel, onConfirm, onReject, onEntityChange, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editText, setEditText] = useState("");
  const [editError, setEditError] = useState("");
  const editable = !!onEntityChange;

  // Sync editText when entity changes or expand toggles
  const handleToggleExpand = useCallback(() => {
    setExpanded((v) => {
      if (!v) {
        setEditText(JSON.stringify(entity, null, 2));
        setEditError("");
      }
      return !v;
    });
  }, [entity]);

  const handleEditChange = useCallback(
    (text: string) => {
      setEditText(text);
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || Array.isArray(parsed)) {
          setEditError(t("ai.jsonMustBeObject"));
          return;
        }
        if (!parsed.id || !parsed.name) {
          setEditError(t("ai.jsonMissingFields"));
          return;
        }
        setEditError("");
        onEntityChange?.(parsed);
      } catch {
        setEditError(t("ai.jsonInvalid"));
      }
    },
    [onEntityChange],
  );

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
  if (entityType === "character") {
    if (entity.isPlayer) keyFields.push({ label: "isPlayer", value: "true" });
    const pos = entity.position as Record<string, unknown> | undefined;
    if (pos?.mapId) keyFields.push({ label: "position", value: `${pos.mapId}#${pos.cellId ?? 0}` });
    const traits = entity.traits as Record<string, unknown[]> | undefined;
    if (traits) {
      const count = Object.values(traits).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
      if (count > 0) keyFields.push({ label: "traits", value: String(count) });
    }
  }
  if (entityType === "action") {
    if (entity.targetType) keyFields.push({ label: "target", value: String(entity.targetType) });
    if (entity.category) keyFields.push({ label: "category", value: String(entity.category) });
    const outcomes = entity.outcomes as unknown[];
    if (Array.isArray(outcomes)) keyFields.push({ label: "outcomes", value: String(outcomes.length) });
    if (entity.timeCost) keyFields.push({ label: "time", value: `${entity.timeCost}min` });
  }
  if (entityType === "event") {
    if (entity.triggerMode) keyFields.push({ label: "trigger", value: String(entity.triggerMode) });
    if (entity.targetScope) keyFields.push({ label: "scope", value: String(entity.targetScope) });
    const effs = entity.effects as unknown[];
    if (Array.isArray(effs)) keyFields.push({ label: "effects", value: String(effs.length) });
  }
  const llm = entity.llm as Record<string, unknown> | undefined;
  const desc = entity.description
    ? String(entity.description)
    : llm?.personality
      ? String(llm.personality)
      : "";

  return (
    <div className={s.card}>
      {/* Header: id + name */}
      <div className={s.cardHeader}>
        <span>
          <span className={s.cardId}>{id}</span>
          {name && <span className={s.cardName}>{name}</span>}
        </span>
        <button
          onClick={handleToggleExpand}
          className={clsx(s.cardBtn, s.cardBtnExpand)}
        >
          [{expanded ? t("ai.collapseJson") : t("ai.expandJson")}]
        </button>
      </div>

      {/* Key fields */}
      {keyFields.map((f) => (
        <div key={f.label} className={s.fieldRow}>
          <span className={s.fieldLabel}>{f.label}:</span>
          <span className={s.fieldValue}>{f.value}</span>
        </div>
      ))}
      {desc && (
        <div className={s.descText}>
          {desc.length > 80 ? desc.slice(0, 80) + "..." : desc}
        </div>
      )}

      {/* Expanded JSON */}
      {expanded && (
        editable ? (
          <>
            <textarea
              className={clsx(s.jsonEdit, editError ? s.jsonEditError : s.jsonEditNormal)}
              value={editText}
              onChange={(e) => handleEditChange(e.target.value)}
            />
            {editError && (
              <div className={s.editError}>{editError}</div>
            )}
          </>
        ) : (
          <pre className={s.jsonPre}>
            {JSON.stringify(entity, null, 2)}
          </pre>
        )
      )}

      {/* Action buttons */}
      <div className={s.actionsRow}>
        {mode === "confirm" && (
          <>
            <button
              onClick={onConfirm}
              disabled={disabled}
              className={clsx(s.cardBtn, s.cardBtnConfirm)}
            >
              [{confirmLabel || t("ai.confirm")}]
            </button>
            <button
              onClick={onReject}
              disabled={disabled}
              className={clsx(s.cardBtn, s.cardBtnReject)}
            >
              [{t("ai.reject")}]
            </button>
          </>
        )}
      </div>
    </div>
  );
}
