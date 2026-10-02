import { useCallback, useEffect, useState } from 'react';
import type { DeletedCapture as TxCapture } from '@/hooks/useTransactions';

export type DeletedCapture = TxCapture & {
  deletedAt: string;
  label?: string;
};

type HistoryState = { undo: DeletedCapture[]; redo: DeletedCapture[] };

const STORAGE_KEY = 'transactions:deleteHistory:v1';
const MAX_ENTRIES = 20;

function read(): HistoryState {
  if (typeof window === 'undefined') return { undo: [], redo: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { undo: [], redo: [] };
    const parsed = JSON.parse(raw);
    return {
      undo: Array.isArray(parsed?.undo) ? parsed.undo : [],
      redo: Array.isArray(parsed?.redo) ? parsed.redo : [],
    };
  } catch {
    return { undo: [], redo: [] };
  }
}

function write(state: HistoryState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Notify same-tab listeners
    window.dispatchEvent(new CustomEvent('transactions:deleteHistory:changed'));
  } catch {
    /* quota or unavailable */
  }
}

function cap(list: DeletedCapture[]) {
  return list.slice(0, MAX_ENTRIES);
}

export function useDeleteHistory() {
  const [state, setState] = useState<HistoryState>(() => read());

  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener('storage', sync);
    window.addEventListener('transactions:deleteHistory:changed', sync as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('transactions:deleteHistory:changed', sync as EventListener);
    };
  }, []);

  const pushDeleted = useCallback((capture: Omit<DeletedCapture, 'deletedAt'> & { deletedAt?: string }) => {
    const entry: DeletedCapture = {
      ...capture,
      deletedAt: capture.deletedAt ?? new Date().toISOString(),
    };
    const next: HistoryState = {
      undo: cap([entry, ...read().undo]),
      redo: [], // any new delete clears redo
    };
    write(next);
    setState(next);
  }, []);

  const popUndo = useCallback((): DeletedCapture | null => {
    const current = read();
    const [top, ...rest] = current.undo;
    if (!top) return null;
    const next: HistoryState = { undo: rest, redo: cap([top, ...current.redo]) };
    write(next);
    setState(next);
    return top;
  }, []);

  const popRedo = useCallback((): DeletedCapture | null => {
    const current = read();
    const [top, ...rest] = current.redo;
    if (!top) return null;
    const next: HistoryState = { undo: cap([top, ...current.undo]), redo: rest };
    write(next);
    setState(next);
    return top;
  }, []);

  const removeFromUndo = useCallback((id: string) => {
    const current = read();
    const next: HistoryState = {
      undo: current.undo.filter(e => e.row?.id !== id),
      redo: current.redo,
    };
    write(next);
    setState(next);
  }, []);

  const clear = useCallback(() => {
    write({ undo: [], redo: [] });
    setState({ undo: [], redo: [] });
  }, []);

  return {
    undoStack: state.undo,
    redoStack: state.redo,
    pushDeleted,
    popUndo,
    popRedo,
    removeFromUndo,
    clear,
  };
}