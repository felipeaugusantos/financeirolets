import { Tag, EyeOff, Users, ExternalLink, Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { fmt, fmtDate, openTx } from './qualityFormat';
import { SimpleTable } from './SimpleTable';

export function ForaDoDreSection() {
  const { q, exportTxs } = useQualityCtx();
  return (
    <Section icon={EyeOff} title="Fora do DRE (affects_dre = false)" hint="Somente leitura — conferência do que foi marcado para não impactar o resultado."
      count={q.foraDoDre.length} tone="muted" onExport={() => exportTxs('fora_dre', q.foraDoDre, 'affects_dre = false')}>
      <SimpleTable items={q.foraDoDre} />
    </Section>
  );
}

export function ForaDoCaixaSection() {
  const { q, exportTxs } = useQualityCtx();
  return (
    <Section icon={EyeOff} title="Fora do caixa (affects_cashflow = false)" hint="Somente leitura — ex.: receita bruta de venda no cartão."
      count={q.foraDoCaixa.length} tone="muted" onExport={() => exportTxs('fora_caixa', q.foraDoCaixa, 'affects_cashflow = false')}>
      <SimpleTable items={q.foraDoCaixa} />
    </Section>
  );
}

export function AllocationIssuesSection() {
  const { q, setAllocTarget } = useQualityCtx();
  return (
    <Section
      icon={Split}
      title="Rateio que não fecha"
      hint='A soma do rateio é diferente do valor do lançamento — a sobra aparece como "Sem unidade" nos relatórios.'
      count={q.allocationIssues.length}
      tone={q.allocationIssues.length > 0 ? 'destructive' : 'muted'}
    >
      {q.allocationIssues.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Todos os rateios fecham com o valor do lançamento.</p>
      ) : (
        <div className="divide-y divide-border">
          {q.allocationIssues.map(({ tx, residual, allocated }) => (
            <div key={tx.id} className="p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                <p className="text-sm whitespace-nowrap">{fmt(tx.net_amount)}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {fmtDate(tx.competence_date)} • rateado {fmt(allocated)} • sobra {fmt(residual)}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openTx(tx)}>
                  <ExternalLink className="h-3 w-3" /> Abrir
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => setAllocTarget({
                    id: tx.id,
                    description: tx.description,
                    total: Number(tx.net_amount) || 0,
                    competence_date: tx.competence_date,
                    currentUnits: [],
                  })}
                >
                  <Split className="h-3 w-3" /> Refazer rateio
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function SemFornecedorSection() {
  const { q, exportTxs } = useQualityCtx();
  return (
    <Section icon={Users} title="Despesas sem fornecedor" hint="Somente leitura — ajuste pelo próprio lançamento."
      count={q.semFornecedor.length} tone="muted" onExport={() => exportTxs('sem_fornecedor', q.semFornecedor, 'despesa sem fornecedor')}>
      <SimpleTable items={q.semFornecedor} />
    </Section>
  );
}

export function DreLinesSection() {
  const { q } = useQualityCtx();
  return (
    <Section icon={Tag} title="Linhas do DRE com várias categorias" hint="Somente leitura." count={q.dreLineIssues.length} tone="muted">
      <div className="divide-y divide-border">
        {q.dreLineIssues.map((l) => (
          <div key={l.dreLineName} className="p-3">
            <p className="text-sm font-medium">{l.dreLineName}</p>
            <p className="text-xs text-muted-foreground">{l.categories.join(' • ')}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
