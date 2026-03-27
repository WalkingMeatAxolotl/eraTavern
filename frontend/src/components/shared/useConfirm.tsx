import { useState, useCallback, useRef } from "react";
import { ConfirmModal } from "./Modal";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

/**
 * Hook that replaces browser `confirm()` with a custom ConfirmModal.
 *
 * Usage:
 *   const [confirmUI, showConfirm] = useConfirm();
 *   // In handler:
 *   showConfirm({ title, message, confirmLabel, danger }, () => { doDelete(); });
 *   // In JSX:
 *   {confirmUI}
 */
export function useConfirm(): [React.ReactNode, (opts: ConfirmOptions, onConfirm: () => void) => void] {
  const [state, setState] = useState<(ConfirmOptions & { onConfirm: () => void }) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const showConfirm = useCallback((opts: ConfirmOptions, onConfirm: () => void) => {
    setState({ ...opts, onConfirm });
  }, []);

  const ui = state ? (
    <ConfirmModal
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onConfirm={() => {
        const cb = stateRef.current?.onConfirm;
        setState(null);
        cb?.();
      }}
      onCancel={() => setState(null)}
    />
  ) : null;

  return [ui, showConfirm];
}
