import { Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { suggestCategory } from '@/lib/reviewSuggestions';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { SelRow } from './SelRow';
import { BulkBar } from './BulkBar';

export function SemCategoriaSection() {
  const { q, applyPatch, setConfirm, selected, row, exportTxs, bulkCategory, setBulkCategory } = useQualityCtx();
  return (
    <Section
      icon={Tag}
      title="Sem categoria"
      hint="Sugestões são apenas recomendação; nada vem pré-selecionado."
      count={q.semCategoria.length}
      onExport={() => exportTxs('sem_categoria', q.semCategoria, 'sem categoria')}
    >
      <BulkBar block="semcat" ids={q.semCategoria.map((t) => t.id)}>
        <Select value={bulkCategory} onValueChange={setBulkCategory}>
          <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            {q.categories.filter((c) => c.active !== false).map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm" className="h-7 text-xs"
          disabled={selected('semcat').size === 0 || !bulkCategory}
          onClick={() => {
            const ids = Array.from(selected('semcat'));
            const items = q.semCategoria.filter((t) => ids.includes(t.id));
            const newName = q.categoryNameById.get(bulkCategory) ?? 'categoria';
            setConfirm({
              title: `Definir categoria em ${ids.length} lançamento(s)`,
              summary: `Os selecionados passam a usar a categoria "${newName}".`,
              impact: 'Os lançamentos passam a compor a linha de DRE dessa categoria.',
              rows: items.map((t) => row(t, 'categoria: (vazia)', `categoria: ${newName}`)),
              confirmLabel: 'Definir categoria',
              onConfirm: () => applyPatch(ids, { category_id: bulkCategory }, 'Categoria definida').then(() => {}),
            });
          }}
        >
          Aplicar aos selecionados ({selected('semcat').size})
        </Button>
      </BulkBar>
      <div className="divide-y divide-border">
        {q.semCategoria.slice(0, 200).map((t) => {
          const s = suggestCategory(t.description);
          return (
            <SelRow
              key={t.id} block="semcat" t={t}
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
        {q.semCategoria.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
      </div>
    </Section>
  );
}
