import { useState, useMemo } from "react";
import T from "../../theme";

/** Any entity with optional tags, id, and name. */
interface TaggableEntity {
  id: string;
  name?: string;
  tags?: string[];
}

/**
 * Shared tag system for managers that support tag-based grouping.
 * Extracts identical logic from ItemManager and VariableManager.
 *
 * Provides: tag CRUD, computed groupings, view mode, tag manager panel state.
 */
export function useTagSystem<T extends TaggableEntity>({
  filteredItems,
  allTags,
  setAllTags,
  createTagFn,
  deleteTagFn,
}: {
  filteredItems: T[];
  allTags: string[];
  setAllTags: React.Dispatch<React.SetStateAction<string[]>>;
  createTagFn: (tag: string) => Promise<{ success: boolean }>;
  deleteTagFn: (tag: string) => Promise<{ success: boolean }>;
}) {
  const [newTagInput, setNewTagInput] = useState("");
  const [showTagManager, setShowTagManager] = useState(false);
  const [viewMode, setViewMode] = useState<"byTag" | "byEntity">("byTag");

  // ── Tag CRUD ──

  const handleAddTag = async () => {
    const tag = newTagInput.trim();
    if (!tag) return;
    const result = await createTagFn(tag);
    if (result.success) {
      setAllTags((prev) => [...prev, tag]);
      setNewTagInput("");
    }
  };

  const handleDeleteTag = async (tag: string) => {
    const result = await deleteTagFn(tag);
    if (result.success) {
      setAllTags((prev) => prev.filter((t) => t !== tag));
    }
  };

  // ── Computed groupings ──

  /** Tags visible in the current filter (pool order + extras). */
  const visibleTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of filteredItems) {
      for (const t of item.tags ?? []) tagSet.add(t);
    }
    const poolSet = new Set(allTags);
    const fromPool = allTags.filter((t) => tagSet.has(t));
    const extra = [...tagSet].filter((t) => !poolSet.has(t)).sort();
    return [...fromPool, ...extra];
  }, [filteredItems, allTags]);

  /** How many entities use each tag. */
  const tagUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const item of filteredItems) {
      for (const t of item.tags ?? []) usage[t] = (usage[t] || 0) + 1;
    }
    return usage;
  }, [filteredItems]);

  /** Tag → entities (many-to-many), plus untagged list. */
  const { tagGrouped, untagged } = useMemo(() => {
    const g: Record<string, T[]> = {};
    const noTag: T[] = [];
    for (const item of filteredItems) {
      const itemTags = item.tags ?? [];
      if (itemTags.length === 0) {
        noTag.push(item);
        continue;
      }
      for (const t of itemTags) {
        if (!g[t]) g[t] = [];
        g[t].push(item);
      }
    }
    return { tagGrouped: g, untagged: noTag };
  }, [filteredItems]);

  /** Entity → its tags. */
  const entityTagsMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const item of filteredItems) {
      m[item.id] = item.tags ?? [];
    }
    return m;
  }, [filteredItems]);

  /** Tag → entity display names. */
  const tagEntityNames = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const tag of visibleTags) {
      m[tag] = (tagGrouped[tag] ?? []).map((i) => i.name || i.id);
    }
    return m;
  }, [visibleTags, tagGrouped]);

  // ── View tab style ──

  const viewTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    backgroundColor: active ? T.bg3 : T.bg1,
    color: active ? T.accent : T.textDim,
    border: `1px solid ${active ? T.accent : T.border}`,
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
    transition: "background-color 0.1s, border-color 0.1s, color 0.1s",
  });

  return {
    // Tag CRUD state
    newTagInput,
    setNewTagInput,
    showTagManager,
    setShowTagManager,
    handleAddTag,
    handleDeleteTag,
    // Computed groupings
    visibleTags,
    tagUsage,
    tagGrouped,
    untagged,
    entityTagsMap,
    tagEntityNames,
    // View mode
    viewMode,
    setViewMode,
    viewTabStyle,
  };
}
