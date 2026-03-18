import { useState, useCallback } from "react";

/** Hook for managing collapsible group state (expand/collapse by key). */
export function useCollapsibleGroups() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const isCollapsed = useCallback((key: string) => !!collapsed[key], [collapsed]);
  return { collapsed, toggle, isCollapsed };
}
