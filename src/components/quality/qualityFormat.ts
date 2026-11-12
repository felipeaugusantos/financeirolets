import type { ReviewStatus } from '@/hooks/useReviewActions';
import { QualityTx } from '@/hooks/useDataQuality';

export const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');
export const openTx = (t: QualityTx) =>
  window.open(`/lancamentos?q=${encodeURIComponent(t.description)}`, '_blank', 'noopener');

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pendente: 'Pendente',
  revisado: 'Revisado',
  corrigido: 'Corrigido',
  ignorado: 'Ignorado conscientemente',
};
