import { useState, useEffect, useCallback } from "react";

/**
 * Shared state & handler pattern for all Manager components.
 *
 * Manages: editingId, isNew, loading, showJson, onEditingChange,
 *          handleEdit/handleNew/handleBack, auto-load on mount.
 */
export function useManagerState({
  onEditingChange,
  loadFn,
  isEditingExtra,
}: {
  onEditingChange?: (editing: boolean) => void;
  /** Stable fetch callback (wrap with useCallback([], ...)). Sets entity state only — loading is managed by the hook. */
  loadFn: () => Promise<void>;
  /** OR with editingId for onEditingChange (e.g. editingGroupId !== null) */
  isEditingExtra?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    onEditingChange?.(editingId !== null || !!isEditingExtra);
  }, [editingId, isEditingExtra, onEditingChange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await loadFn();
    setLoading(false);
  }, [loadFn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = useCallback((id: string) => {
    setIsNew(false);
    setEditingId(id);
  }, []);

  const handleNew = useCallback(() => {
    setIsNew(true);
    setEditingId("__new__");
  }, []);

  const handleBack = useCallback(() => {
    setEditingId(null);
    setIsNew(false);
    loadData();
  }, [loadData]);

  return {
    editingId,
    isNew,
    loading,
    showJson,
    setShowJson,
    handleEdit,
    handleNew,
    handleBack,
    loadData,
  };
}

/** Derive readOnly flag from selectedAddon. */
export const isReadOnly = (selectedAddon: string | null) => selectedAddon === null;
