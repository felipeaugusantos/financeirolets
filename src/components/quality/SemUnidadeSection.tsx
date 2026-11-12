import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { suggestUnitLabel, SuggestTx } from '@/lib/reviewSuggestions';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { SelRow } from './SelRow';
import { BulkBar } from './BulkBar';

export function SemUnidadeSection() {
  const { q, applyPatch, setConfirm, selected, row, exportTxs, unitFilters, setUnitFilters, bulkUnit, setBulkUnit, semUnidadeFiltrado } = useQualityCtx();
  return (
    <Section
      icon={Building2}
      title="Sem unidade e sem rateio"
      hint="Filtre, selecione e confirme. Nenhuma unidade é atribuída automaticamente."
      count={q.semUnidade.length}
      onExport={() => exportTxs('sem_unidade', semUnidadeFiltrado, 'sem unidade/rateio')}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 border-b border-border">
        <Input placeholder="Descrição" className="h-8 text-xs" value={unitFilters.desc}
          onChange={(e) => setUnitFilters((f) => ({ ...f, desc: e.target.value }))} />
        <Select value={unitFilters.cat || 'all'} onValueChange={(v) => setUnitFilters((f) => ({ ...f, cat: v === 'all' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todas as categorias</SelectItem>
            {q.categories.map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={unitFilters.account || 'all'} onValueChange={(v) => setUnitFilters((f) => ({ ...f, account: v === 'all' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Conta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todas as contas</SelectItem>
            {q.accounts.map((a) => <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Valor mínimo" className="h-8 text-xs" inputMode="decimal" value={unitFilters.min}
          onChange={(e) => setUnitFilters((f) => ({ ...f, min: e.target.value }))} />
      </div>
      <BulkBar block="semuni" ids={semUnidadeFiltrado.map((t) => t.id)}>
        <Select value={bulkUnit} onValueChange={setBulkUnit}>
          <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            {q.units.map((u) => <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm" className="h-7 text-xs"
          disabled={selected('semuni').size === 0 || !bulkUnit}
          onClick={() => {
            const ids = Array.from(selected('semuni'));
            const items = semUnidadeFiltrado.filter((t) => ids.includes(t.id));
            const newName = q.unitNameById.get(bulkUnit) ?? 'unidade';
            setConfirm({
              title: `Atribuir unidade a ${ids.length} lançamento(s)`,
              summary: `Os selecionados passam para a unidade "${newName}". Valor, data e categoria não mudam.`,
              impact: 'Os valores deixam de aparecer como "Sem unidade" no DRE Comparativo e nos filtros por unidade.',
              rows: items.map((t) => row(t, 'unidade: (vazia)', `unidade: ${newName}`)),
              confirmLabel: 'Atribuir unidade',
              onConfirm: () => applyPatch(ids, { unit_id: bulkUnit }, 'Unidade atribuída').then(() => {}),
            });
          }}
        >
          Atribuir aos selecionados ({selected('semuni').size})
        </Button>
      </BulkBar>
      <div className="divide-y divide-border">
        {semUnidadeFiltrado.slice(0, 200).map((t) => {
          const hint = suggestUnitLabel(t as unknown as SuggestTx, t.category_id ? q.categoryNameById.get(t.category_id) : undefined);
          return (
            <SelRow
              key={t.id} block="semuni" t={t}
              extra={hint ? <p className="text-[11px] text-primary pt-1">Sugestão provável: {hint} — exige sua confirmação.</p> : undefined}
            />
          );
        })}
        {semUnidadeFiltrado.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso com os filtros atuais.</p>}
      </div>
    </Section>
  );
}
