import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { SelRow } from './SelRow';
import { BulkBar } from './BulkBar';

export function TransfersInDreSection() {
  const { q, applyPatch, setConfirm, selected, row, exportTxs } = useQualityCtx();
  return (
    <Section
      icon={ArrowLeftRight}
      title="Transferências entrando no DRE"
      hint="Movimentações entre contas com affects_dre = true, inflando o resultado."
      count={q.transfersInDre.length}
      onExport={() => exportTxs('transferencias_dre', q.transfersInDre, 'transferência com affects_dre = true')}
    >
      <BulkBar block="transf" ids={q.transfersInDre.map((t) => t.id)}>
        <Button
          size="sm" className="h-7 text-xs"
          disabled={selected('transf').size === 0}
          onClick={() => {
            const ids = Array.from(selected('transf'));
            const items = q.transfersInDre.filter((t) => ids.includes(t.id));
            setConfirm({
              title: `Remover ${ids.length} transferência(s) do DRE`,
              summary: 'Esta ação altera apenas a participação do lançamento no DRE. Valor, data, conta e histórico financeiro permanecem inalterados.',
              impact: 'Os lançamentos deixam de compor o DRE (e o DRE Comparativo). O Fluxo de Caixa continua igual.',
              rows: items.map((t) => row(t, 'affects_dre: true', 'affects_dre: false')),
              confirmLabel: 'Remover do DRE',
              onConfirm: () => applyPatch(ids, { affects_dre: false }, 'Removidos do DRE').then(() => {}),
            });
          }}
        >
          Remover do DRE ({selected('transf').size})
        </Button>
      </BulkBar>
      <div className="divide-y divide-border">
        {q.transfersInDre.slice(0, 200).map((t) => (
          <SelRow
            key={t.id} block="transf" t={t}
            extra={
              <p className="text-[11px] text-primary pt-1">
                Sugestão: remover do DRE (affects_dre: true → false). {t.type === 'receita' ? 'Entrada' : 'Saída'}.
              </p>
            }
          />
        ))}
        {q.transfersInDre.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
      </div>
    </Section>
  );
}
