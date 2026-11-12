import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { useDataQuality, QualityTx, DuplicateGroup } from '@/hooks/useDataQuality';
import type { useReviewActions, useReviewStatus, ReviewStatus } from '@/hooks/useReviewActions';
import type { ChangePreviewRow, ConfirmChangePayload } from './ConfirmChangeDialog';
import type { AllocationTarget } from './AllocationAssistant';
import type { classifyDuplicate } from '@/lib/reviewSuggestions';

export interface UnitFilters { desc: string; cat: string; account: string; min: string }

/**
 * Estado e ações da tela de Conferência compartilhados pelas seções. O estado continua na tela
 * (filtros, seleção e datas sobrevivem ao recarregar a análise); as seções só o consomem.
 */
export interface QualityCtx {
  q: ReturnType<typeof useDataQuality>;
  applyPatch: ReturnType<typeof useReviewActions>['applyPatch'];
  deleteTransactions: ReturnType<typeof useReviewActions>['deleteTransactions'];
  setConfirm: (payload: ConfirmChangePayload | null) => void;
  setAllocTarget: (target: AllocationTarget | null) => void;
  // seleção por bloco
  selected: (block: string) => Set<string>;
  toggle: (block: string, id: string) => void;
  setAll: (block: string, ids: string[], on: boolean) => void;
  // situação da conferência (revisado, corrigido...)
  rs: (id: string) => ReviewStatus;
  rnote: (id: string) => string | null;
  passesReview: (id: string) => boolean;
  setReviewStatus: ReturnType<typeof useReviewStatus>['setReviewStatus'];
  row: (t: QualityTx, before: string, after: string) => ChangePreviewRow;
  exportTxs: (name: string, items: QualityTx[], problem: string) => void;
  // filtros e campos de ação em massa
  bulkCategory: string;
  setBulkCategory: Dispatch<SetStateAction<string>>;
  unitFilters: UnitFilters;
  setUnitFilters: Dispatch<SetStateAction<UnitFilters>>;
  bulkUnit: string;
  setBulkUnit: Dispatch<SetStateAction<string>>;
  semUnidadeFiltrado: QualityTx[];
  payDates: Record<string, string>;
  setPayDates: Dispatch<SetStateAction<Record<string, string>>>;
  dupGroups: Array<DuplicateGroup & ReturnType<typeof classifyDuplicate>>;
}

export const QualityContext = createContext<QualityCtx | null>(null);

export function useQualityCtx(): QualityCtx {
  const ctx = useContext(QualityContext);
  if (!ctx) throw new Error('useQualityCtx fora do QualityContext.Provider');
  return ctx;
}
