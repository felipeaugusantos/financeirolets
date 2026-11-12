import { CalendarX, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { fmt, fmtDate, openTx } from './qualityFormat';
import { ReviewBadge } from './ReviewBadge';

export function PagoSemDataSection() {
  const { q, applyPatch, setConfirm, rs, rnote, setReviewStatus, row, exportTxs, payDates, setPayDates } = useQualityCtx();
  return (
    <Section
      icon={CalendarX}
      title="Pagos sem data de pagamento"
      hint="Informe a data manualmente. Competência e vencimento são apenas referência."
      count={q.pagoSemData.length}
      onExport={() => exportTxs('pago_sem_data', q.pagoSemData, 'pago sem data de pagamento')}
    >
      <div className="divide-y divide-border">
        {q.pagoSemData.map((t) => (
          <div key={t.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium truncate">{t.description}</p>
              <p className="text-sm whitespace-nowrap">{fmt(t.net_amount)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Competência {fmtDate(t.competence_date)} • Vencimento {fmtDate(t.due_date)} • {t.status} • ID {t.id.slice(0, 8)}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date" className="h-8 w-44 text-xs"
                value={payDates[t.id] || ''}
                onChange={(e) => setPayDates((p) => ({ ...p, [t.id]: e.target.value }))}
              />
              <Button
                size="sm" className="h-8 text-xs" disabled={!payDates[t.id]}
                onClick={() => setConfirm({
                  title: 'Informar data de pagamento',
                  summary: 'Somente a data de pagamento é preenchida, com o valor que você digitou.',
                  impact: 'O lançamento passa a aparecer no Fluxo de Caixa realizado e no DRE em regime de caixa nesse mês.',
                  rows: [row(t, 'pagamento: (vazio)', `pagamento: ${fmtDate(payDates[t.id])}`)],
                  confirmLabel: 'Salvar data',
                  onConfirm: () => applyPatch([t.id], { payment_date: payDates[t.id] }, 'Data de pagamento informada').then(() => {}),
                })}
              >
                Salvar data informada
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openTx(t)}>
                <ExternalLink className="h-3 w-3" /> Abrir lançamento
              </Button>
              <ReviewBadge id={t.id} value={rs(t.id)} note={rnote(t.id)} onChange={setReviewStatus} />
            </div>
          </div>
        ))}
        {q.pagoSemData.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
      </div>
    </Section>
  );
}
