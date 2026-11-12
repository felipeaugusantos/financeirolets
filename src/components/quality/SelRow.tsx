import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { QualityTx } from '@/hooks/useDataQuality';
import { ReviewBadge } from './ReviewBadge';
import { fmt, fmtDate, openTx } from './qualityFormat';
import { useQualityCtx } from './qualityContext';

export function SelRow({ block, t, extra }: { block: string; t: QualityTx; extra?: ReactNode }) {
  const { q, selected, toggle, passesReview, rs, rnote, setReviewStatus } = useQualityCtx();
  if (!passesReview(t.id)) return null;
  return (
  <div className="p-3 space-y-2">
    <div className="flex items-start gap-3">
      <Checkbox checked={selected(block).has(t.id)} onCheckedChange={() => toggle(block, t.id)} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium truncate">{t.description}</p>
          <p className="text-sm whitespace-nowrap">{fmt(t.net_amount)}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {fmtDate(t.competence_date)} • {t.type} / {t.status}
          {t.account_id ? ` • ${q.accountNameById.get(t.account_id) ?? 'Conta'}` : ''}
          {t.category_id ? ` • ${q.categoryNameById.get(t.category_id) ?? 'Categoria'}` : ' • Sem categoria'}
          {t.unit_id ? ` • ${q.unitNameById.get(t.unit_id) ?? 'Unidade'}` : ' • Sem unidade'}
          {` • ID ${t.id.slice(0, 8)}`}
        </p>
        {extra}
        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openTx(t)}>
            <ExternalLink className="h-3 w-3" /> Abrir lançamento
          </Button>
          <ReviewBadge id={t.id} value={rs(t.id)} note={rnote(t.id)} onChange={setReviewStatus} />
        </div>
      </div>
    </div>
  </div>
  );
}
