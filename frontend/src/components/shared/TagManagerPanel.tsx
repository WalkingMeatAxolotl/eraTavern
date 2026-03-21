import T from "../../theme";
import { t } from "../../i18n/ui";

/**
 * Tag pool management panel — add/delete tags, show usage counts.
 * Shared between ItemManager and VariableManager.
 */
export function TagManagerPanel({
  allTags,
  tagUsage,
  newTagInput,
  setNewTagInput,
  onAddTag,
  onDeleteTag,
  btnClassName,
  poolLabel,
  placeholderLabel,
}: {
  allTags: string[];
  tagUsage: Record<string, number>;
  newTagInput: string;
  setNewTagInput: (v: string) => void;
  onAddTag: () => void;
  onDeleteTag: (tag: string) => void;
  btnClassName?: string;
  poolLabel?: string;
  placeholderLabel?: string;
}) {
  return (
    <div
      style={{
        marginBottom: "12px",
        padding: "8px",
        backgroundColor: T.bg1,
        border: `1px solid ${T.border}`,
        borderRadius: "3px",
      }}
    >
      <div style={{ color: T.textSub, fontSize: "11px", marginBottom: "6px" }}>
        {poolLabel ?? t("ui.tagPool")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
        {allTags.map((tag) => (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              backgroundColor: T.bg1,
              border: `1px solid ${T.borderLight}`,
              borderRadius: "3px",
              fontSize: "12px",
            }}
          >
            {tag}
            <span style={{ color: T.textDim, fontSize: "11px" }}>({tagUsage[tag] || 0})</span>
            <button
              onClick={() => onDeleteTag(tag)}
              style={{
                background: "none",
                border: "none",
                color: T.danger,
                cursor: "pointer",
                padding: "0 2px",
                fontSize: "12px",
                lineHeight: 1,
              }}
            >
              x
            </button>
          </span>
        ))}
        {allTags.length === 0 && <span style={{ color: T.textDim }}>{t("empty.noTags")}</span>}
      </div>
      <div style={{ display: "flex", gap: "4px" }}>
        <input
          style={{
            flex: 1,
            padding: "4px 8px",
            backgroundColor: T.bg1,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            fontSize: "12px",
          }}
          value={newTagInput}
          onChange={(e) => setNewTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddTag();
            }
          }}
          placeholder={placeholderLabel ?? t("ui.newTagPlaceholder")}
        />
        <button
          className={btnClassName}
          onClick={onAddTag}
          style={{
            padding: "4px 10px",
            backgroundColor: T.bg2,
            color: T.successDim,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "12px",
            transition: "background-color 0.1s, border-color 0.1s",
          }}
        >
          [+]
        </button>
      </div>
    </div>
  );
}
