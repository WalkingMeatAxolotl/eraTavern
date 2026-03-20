/**
 * ToolCallMessage — renders a tool call within the chat.
 *
 * Read-only tools (list_entities, get_schema): collapsed summary, auto-executed.
 * Write tools (create_entity): EntityCard preview + confirm/reject buttons.
 */
import T from "../../theme";
import { t } from "../../i18n/ui";
import EntityCard from "./EntityCard";

export type ToolCallStatus = "pending" | "confirmed" | "rejected" | "auto";

interface Props {
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  onConfirm?: () => void;
  onReject?: () => void;
  disabled?: boolean;
}

const ENTITY_LABELS: Record<string, string> = {
  item: "物品",
  trait: "特质",
  clothing: "服装",
  variable: "变量",
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
    const entity = name === "create_entity"
      ? (args.entity as Record<string, unknown>) || {}
      : { id: args.entityId as string, name: (args._displayName as string) || "", ...(args.fields as Record<string, unknown> || {}) };
    const isUpdate = name === "update_entity";
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
              ? t(msgKey, { type: entityLabel, name: String(entity.name || entity.id || "") })
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
          entity={entity}
          mode={status === "pending" ? "confirm" : undefined}
          confirmLabel={isUpdate ? t("ai.confirmUpdate") : t("ai.confirm")}
          onConfirm={onConfirm}
          onReject={onReject}
          disabled={disabled}
        />
        {statusBadge()}
      </div>
    );
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
