import { AlertTriangle, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { suggestCategory } from '@/lib/reviewSuggestions';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { SelRow } from './SelRow';
import { BulkBar } from './BulkBar';

export function OrphanCategoriesSection() {
  const { q, applyPatch, setConfirm, selected, row, exportTxs, bulkCategory, setBulkCategory } = useQualityCtx();
  return (
    <Section
      icon={Tag}
      title="Categorias sem linha de DRE"
      hint="Cada lançamento é mostrado individualmente — nada é remapeado em bloco."
      count={q.orphanCategoryGroups.reduce((s, g) => s + g.items.length, 0)}
      onExport={() => exportTxs('sem_linha_dre', q.orphanCategoryGroups.flatMap((g) => g.items), 'categoria sem linha de DRE')}
    >
      <div className="divide-y divide-border">
        {q.orphanCategoryGroups.map((g) => {
          const block = `orphan-${g.categoryId}`;
          const ids = g.items.map((t) => t.id);
          return (
            <div key={g.categoryId}>
              <div className="p-3 bg-muted/40">
                <p className="text-sm font-medium">{g.categoryName} • {g.items.length} lançamento(s)</p>
                {g.categoryName.toLowerCase().includes('empréstimo') && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Verifique se o valor representa principal do empréstimo, juros ou ambos. O principal
                      de empréstimo não deve entrar automaticamente no resultado como despesa operacional.
                    </AlertDescription>
                  </Alert>
                )}
                {g.categoryName.toLowerCase().includes('sem id') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Os lançamentos aqui têm naturezas diferentes. Reclassifique um a um; use seleção
                    múltipla apenas depois de conferir que são realmente iguais.
                  </p>
                )}
              </div>
              <BulkBar block={block} ids={ids}>
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder="Nova categoria" /></SelectTrigger>
                  <SelectContent>
                    {q.categories.filter((c) => c.dre_line_id).map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm" className="h-7 text-xs"
                  disabled={selected(block).size === 0 || !bulkCategory}
                  onClick={() => {
                    const sels = Array.from(selected(block));
                    const items = g.items.filter((t) => sels.includes(t.id));
                    const newName = q.categoryNameById.get(bulkCategory) ?? 'categoria';
                    setConfirm({
                      title: `Reclassificar ${sels.length} lançamento(s)`,
                      summary: `A categoria dos selecionados passa para "${newName}". Valor, data, conta e status não mudam.`,
                      impact: 'Os lançamentos passam a compor a linha de DRE dessa categoria.',
                      rows: items.map((t) => row(t, `categoria: ${g.categoryName}`, `categoria: ${newName}`)),
                      confirmLabel: 'Reclassificar',
                      onConfirm: () => applyPatch(sels, { category_id: bulkCategory }, 'Categoria atualizada').then(() => {}),
                    });
                  }}
                >
                  Aplicar aos selecionados ({selected(block).size})
                </Button>
              </BulkBar>
              <div className="divide-y divide-border">
                {g.items.slice(0, 200).map((t) => {
                  const s = suggestCategory(t.description);
                  return (
                    <SelRow
                      key={t.id} block={block} t={t}
                      extra={
                        <p className={`text-[11px] pt-1 ${s.lowConfidence ? 'text-warning' : 'text-primary'}`}>
                          {s.categoryName ? `Sugestão: ${s.categoryName}. ` : ''}
                          {s.reason}
                          {s.lowConfidence ? ' — Revisão manual necessária.' : ''}
                        </p>
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {q.orphanCategoryGroups.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
      </div>
    </Section>
  );
}
