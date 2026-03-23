import { t } from "../../i18n/ui";
import s from "./TagManagerPanel.module.css";

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
    <div className={s.panel}>
      <div className={s.panelLabel}>{poolLabel ?? t("ui.tagPool")}</div>
      <div className={s.tagList}>
        {allTags.map((tag) => (
          <span key={tag} className={s.tag}>
            {tag}
            <span className={s.tagCount}>({tagUsage[tag] || 0})</span>
            <button onClick={() => onDeleteTag(tag)} className={s.tagDeleteBtn}>
              x
            </button>
          </span>
        ))}
        {allTags.length === 0 && <span className={s.emptyTags}>{t("empty.noTags")}</span>}
      </div>
      <div className={s.addRow}>
        <input
          className={s.addInput}
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
        <button className={btnClassName ?? s.addBtn} onClick={onAddTag}>
          [+]
        </button>
      </div>
    </div>
  );
}
