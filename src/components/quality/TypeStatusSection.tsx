import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { suggestStatus } from '@/lib/reviewSuggestions';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { SelRow } from './SelRow';
import { BulkBar } from './BulkBar';

export function TypeStatusSection() {
  const { q, applyPatch, setConfirm, selected, row, exportTxs } = useQualityCtx();
  return (
    <Section
      icon={AlertTriangle}
      title="Tipo x status incompatível"
      hint="Receita marcada como pago, despesa marcada como recebido."
      count={q.typeStatusMismatch.length}
      onExport={() => exportTxs('tipo_status', q.typeStatusMismatch, 'tipo/status incompatível')}
    >
      <BulkBar block="ts" ids={q.typeStatusMismatch.map((t) => t.id)}>
        <Button
          size="sm" className="h-7 text-xs"
          disabled={selected('ts').size === 0}
          onClick={() => {
            const ids = Array.from(selected('ts'));
            const items = q.typeStatusMismatch.filter((t) => ids.includes(t.id));
            setConfirm({
              title: `Corrigir status de ${ids.length} lançamento(s)`,
              summary: 'Apenas o status é alterado. Tipo, valor, data e categoria permanecem exatamente como estão.',
              impact: 'Relatórios que separam realizado por tipo passam a classificar corretamente estes lançamentos.',
              rows: items.map((t) => row(t, `status: ${t.status}`, `status: ${suggestStatus(t)}`)),
              confirmLabel: 'Aplicar correção',
              onConfirm: async () => {
                for (const t of items) {
                  const next = suggestStatus(t);
                  if (next) await applyPatch([t.id], { status: next }, 'Status corrigido');
                }
              },
            });
          }}
        >
          Aplicar sugestão ({selected('ts').size})
        </Button>
      </BulkBar>
      <div className="divide-y divide-border">
        {q.typeStatusMismatch.slice(0, 200).map((t) => (
          <SelRow
            key={t.id} block="ts" t={t}
            extra={
              <p className="text-[11px] text-primary pt-1">
                {t.type === 'receita' ? 'Receita' : 'Despesa'} | status atual: {t.status} → Sugestão: {suggestStatus(t)}
              </p>
            }
          />
        ))}
        {q.typeStatusMismatch.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
      </div>
    </Section>
  );
}
