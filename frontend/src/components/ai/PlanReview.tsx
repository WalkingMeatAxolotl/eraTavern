/**
 * PlanReview — displays a structured plan card for user review.
 *
 * Shows entity list grouped by type with confirm/reject actions.
 */
import { useState } from "react";
import { t } from "../../i18n/ui";
import type { PlanData } from "../../api/aiAssist";
import s from "./PlanReview.module.css";

interface PlanReviewProps {
  plan: PlanData;
  onConfirm: () => void;
  onReject: (feedback: string) => void;
  disabled?: boolean;
}

/** Fixed dependency order for display grouping */
const TYPE_ORDER = [
  "lorebook", "worldVariable", "traitGroup", "trait",
  "item", "clothing", "outfitType", "character", "event", "action",
];

function typeLabel(t: string): string {
  const labels: Record<string, string> = {
    item: "物品", trait: "特质", clothing: "服装", traitGroup: "特质组",
    outfitType: "服装预设", lorebook: "知识库", worldVariable: "世界变量",
    character: "角色", action: "行动", event: "事件",
  };
  return labels[t] || t;
}

export default function PlanReview({ plan, onConfirm, onReject, disabled }: PlanReviewProps) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  // Group entities by type in dependency order
  const grouped = new Map<string, typeof plan.entities>();
  for (const e of plan.entities) {
    const list = grouped.get(e.entityType) || [];
    list.push(e);
    grouped.set(e.entityType, list);
  }
  const sortedTypes = [...grouped.keys()].sort(
    (a, b) => (TYPE_ORDER.indexOf(a) === -1 ? 99 : TYPE_ORDER.indexOf(a))
           - (TYPE_ORDER.indexOf(b) === -1 ? 99 : TYPE_ORDER.indexOf(b)),
  );

  return (
    <div className={s.card}>
      <div className={s.header}>{t("ai.planTitle")}</div>

      {/* Overview */}
      <div className={s.overview}>{plan.overview}</div>

      {/* Entity groups */}
      <div className={s.entityList}>
        {sortedTypes.map((type) => (
          <div key={type} className={s.group}>
            <div className={s.groupHeader}>
              {typeLabel(type)} ({grouped.get(type)!.length})
            </div>
            {grouped.get(type)!.map((e) => (
              <div key={`${e.entityType}.${e.id}`} className={s.entityRow}>
                <span className={s.entityId}>{e.id}</span>
                <span className={s.entityName}>{e.name}</span>
                {e.note && <span className={s.entityNote}>{e.note}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Total count */}
      <div className={s.total}>
        {t("ai.planTotal", { count: plan.entities.length })}
      </div>

      {/* Actions */}
      <div className={s.actions}>
        <button
          className={s.confirmBtn}
          onClick={onConfirm}
          disabled={disabled}
        >
          [{t("ai.planConfirm")}]
        </button>
        {!showFeedback ? (
          <button
            className={s.rejectBtn}
            onClick={() => setShowFeedback(true)}
            disabled={disabled}
          >
            [{t("ai.planReject")}]
          </button>
        ) : (
          <div className={s.feedbackRow}>
            <input
              className={s.feedbackInput}
              placeholder={t("ai.planFeedbackHint")}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onReject(feedback);
                  setShowFeedback(false);
                  setFeedback("");
                }
              }}
              autoFocus
            />
            <button
              className={s.rejectBtn}
              onClick={() => { onReject(feedback); setShowFeedback(false); setFeedback(""); }}
            >
              [{t("ai.planSendFeedback")}]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
