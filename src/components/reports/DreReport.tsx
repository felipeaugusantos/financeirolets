import { useState, useEffect, useRef } from 'react';
import { useDreReport, DreFilters, type DreLineResult } from '@/hooks/useDreReport';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { List as ListIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, FileText, Loader2, Download, FileSpreadsheet, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn, toLocalISODate, todayLocalISO } from '@/lib/utils';
import { exportToPdf } from '@/lib/exportPdf';
import { exportToCsv, csvNumber, csvCode, csvIndent, CsvCell } from '@/lib/exportCsv';
import { FilterPresets } from './FilterPresets';
import { ReportCustomizer, useReportSections, SectionGroup } from './ReportCustomizer';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v: number) =>
  `${(v >= 0 ? '+' : '')}${v.toFixed(1)}%`;

export default function DreReport({ onBack }: { onBack: () => void }) {
  const { lines, loading, generate, unallocatedTotal, unallocatedCount, outOfDreTotal, outOfDreCount, outOfDreItems, lineItems } = useDreReport();
  const [drill, setDrill] = useState<DreLineResult | null>(null);
  const drillItems = (() => {
    if (!drill) return [];
    const ids = new Set<string>([drill.id]);
    let grew = true;
    while (grew) {
      grew = false;
      lines.forEach(l => { if (l.parent_id && ids.has(l.parent_id) && !ids.has(l.id)) { ids.add(l.id); grew = true; } });
    }
    return [...ids].flatMap(id => lineItems.get(id) ?? [])
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  })();
  useEffect(() => {
    const ids = [...new Set(drillItems.map(i => i.category_id).filter(Boolean) as string[])]
      .filter(id => !outCatNames[id]);
    if (ids.length === 0) return;
    supabase.from('categories').select('id, name').in('id', ids).then(({ data }) => {
      setOutCatNames(prev => ({ ...prev, ...Object.fromEntries((data ?? []).map(c => [c.id, c.name])) }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill]);
  const [outCatNames, setOutCatNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = [...new Set(outOfDreItems.map(i => i.category_id).filter(Boolean) as string[])];
    if (ids.length === 0) return;
    supabase.from('categories').select('id, name').in('id', ids).then(({ data }) => {
      setOutCatNames(Object.fromEntries((data ?? []).map(c => [c.id, c.name])));
    });
  }, [outOfDreItems]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<DreFilters>({
    dateFrom: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    dateTo: todayLocalISO(),
    regime: 'competencia',
    includeBudget: false,
    includePrevious: false,
    onlyRealized: false,
  });
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  type DreSecKey =
    | 'colCode' | 'colAV' | 'colBudget' | 'colPrevious'
    | 'hideZero' | 'onlySubtotals' | 'compact'
    | 'showAlertSemUnidade';
  const dreSectionGroups: SectionGroup<DreSecKey>[] = [
    {
      label: 'Colunas',
      items: [
        { key: 'colCode', label: 'Código da linha', hint: 'Mostra a coluna "#" com o código contábil.' },
        { key: 'colAV', label: 'Análise Vertical (AV %)', hint: 'Percentual de cada linha sobre a receita base.' },
        { key: 'colBudget', label: 'Orçado + Variação %', hint: 'Requer "Orçado vs Realizado" ligado.' },
        { key: 'colPrevious', label: 'Período anterior + AH %', hint: 'Requer "Análise Horizontal" ligado.' },
      ],
    },
    {
      label: 'Linhas',
      items: [
        { key: 'hideZero', label: 'Ocultar linhas zeradas', hint: 'Esconde linhas sem valor em nenhuma coluna visível.' },
        { key: 'onlySubtotals', label: 'Somente subtotais', hint: 'Mostra apenas grupos e subtotais, esconde linhas analíticas.' },
        { key: 'compact', label: 'Densidade compacta', hint: 'Reduz padding para caber mais linhas na tela.' },
      ],
    },
    {
      label: 'Avisos',
      items: [
        { key: 'showAlertSemUnidade', label: 'Alerta de lançamentos sem unidade', hint: 'Aparece apenas quando há filtro de unidade.' },
      ],
    },
  ];
  const dreSec = useReportSections<DreSecKey>('dre.sections.v1', {
    colCode: true, colAV: false, colBudget: true, colPrevious: true,
    hideZero: false, onlySubtotals: false, compact: false,
    showAlertSemUnidade: true,
  });
  const showAV = dreSec.isOn('colAV');
  const showCode = dreSec.isOn('colCode');
  const showBudgetCol = dreSec.isOn('colBudget') && !!filters.includeBudget;
  const showPreviousCol = dreSec.isOn('colPrevious') && !!filters.includePrevious;
  const hideZero = dreSec.isOn('hideZero');
  const onlySubtotals = dreSec.isOn('onlySubtotals');
  const compact = dreSec.isOn('compact');

  const defaultFilters: DreFilters = {
    dateFrom: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    dateTo: todayLocalISO(),
    regime: 'competencia',
    includeBudget: false,
    includePrevious: false,
    onlyRealized: false,
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
    dreSec.reset();
  };

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name').then(({ data }) => {
      setUnits(data ?? []);
    });
    supabase.from('categories').select('id, name').order('name').then(({ data }) => {
      setCategories(data ?? []);
    });
  }, []);

  const handleGenerate = async () => {
    await generate(filters);
    setGenerated(true);
  };

  // Find revenue base for AV (Group 1: Receita Bruta or similar)
  const revenueBase = lines.find(l => l.code === '1')?.value ?? 0;
  const avFor = (v: number) => (revenueBase !== 0 ? (v / revenueBase) * 100 : 0);

  const handleExport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportToPdf({
        title: 'DRE – Demonstrativo de Resultado',
        subtitle: `Período: ${filters.dateFrom} a ${filters.dateTo} | Regime: ${filters.regime === 'competencia' ? 'Competência' : 'Caixa'}`,
        filename: `DRE_${filters.dateFrom}_${filters.dateTo}.pdf`,
        element: reportRef.current,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = () => {
    const headers: CsvCell[] = ['Código', 'Linha', 'Realizado', 'AV %'];
    if (filters.includeBudget) headers.push('Orçado', 'Var %');
    if (filters.includePrevious) headers.push('Ano Anterior', 'AH %');

    const rows = lines.map(l => {
      const r: CsvCell[] = [
        csvCode(l.code),
        csvIndent(l.depth, l.name),
        csvNumber(l.value),
        csvNumber(avFor(l.value), 1),
      ];
      if (filters.includeBudget) {
        const b = l.budgetValue ?? 0;
        const v = b !== 0 ? ((l.value - b) / Math.abs(b)) * 100 : 0;
        r.push(csvNumber(b), csvNumber(v, 1));
      }
      if (filters.includePrevious) {
        const p = l.previousValue ?? 0;
        const v = p !== 0 ? ((l.value - p) / Math.abs(p)) * 100 : 0;
        r.push(csvNumber(p), csvNumber(v, 1));
      }
      return r;
    });
    exportToCsv(`DRE_${filters.dateFrom}_${filters.dateTo}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">DRE – Demonstrativo de Resultado</CardTitle>
            <p className="text-xs text-muted-foreground">Configure período, unidade, regime e análises</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={filters.unit_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, unit_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sem unidade</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={filters.category_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, category_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={filters.payment_method || '__all__'} onValueChange={v => setFilters(f => ({ ...f, payment_method: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sem forma</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Regime</Label>
              <Select value={filters.regime} onValueChange={(v) => setFilters(f => ({ ...f, regime: v as DreFilters['regime'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="competencia">Competência</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
              </Button>
              <Button variant="outline" size="icon" onClick={handleClearFilters} title="Limpar filtros">
                <RotateCcw className="h-4 w-4" />
              </Button>
              {generated && lines.length > 0 && (
                <>
                  <Button variant="outline" size="icon" onClick={handleExportCsv} title="Exportar CSV">
                    <FileSpreadsheet className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleExport} disabled={exporting} title="Exportar PDF">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
          </div>

          <FilterPresets<DreFilters>
            storageKey="dre.filterPresets.v1"
            currentFilters={filters}
            onApply={(p) => setFilters(p)}
          />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                id="budget"
                checked={!!filters.includeBudget}
                onCheckedChange={v => setFilters(f => ({ ...f, includeBudget: v }))}
              />
              <Label htmlFor="budget" className="text-sm cursor-pointer">Orçado vs Realizado</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="previous"
                checked={!!filters.includePrevious}
                onCheckedChange={v => setFilters(f => ({ ...f, includePrevious: v }))}
              />
              <Label htmlFor="previous" className="text-sm cursor-pointer">Análise Horizontal (vs ano anterior)</Label>
            </div>
            {filters.regime === 'competencia' && (
              <div className="flex items-center gap-2">
                <Switch
                  id="onlyRealized"
                  checked={!!filters.onlyRealized}
                  onCheckedChange={v => setFilters(f => ({ ...f, onlyRealized: v }))}
                />
                <Label htmlFor="onlyRealized" className="text-sm cursor-pointer" title="Considera apenas lançamentos pagos/recebidos no período de competência (igual ao Dashboard sem provisionados).">
                  Somente realizado
                </Label>
              </div>
            )}
            <div className="ml-auto">
              <ReportCustomizer<DreSecKey>
                groups={dreSectionGroups}
                sections={dreSec.sections}
                onToggle={dreSec.toggle}
                onReset={dreSec.reset}
                inlineKeys={['colAV', 'hideZero']}
                description="Escolha as colunas e linhas que aparecem na tabela do DRE. A exportação (CSV/PDF) inclui todas as colunas."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {generated && filters.unit_id && unallocatedCount > 0 && dreSec.isOn('showAlertSemUnidade') && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-800 dark:text-amber-300">
            <strong>{unallocatedCount} lançamento(s)</strong> sem unidade atribuída ({fmt(Math.abs(unallocatedTotal))}) não estão incluídos neste relatório filtrado. Atribua uma unidade ou configure rateio nesses lançamentos para incluí-los.
          </span>
        </div>
      )}

      {generated && outOfDreCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <span className="text-destructive">
            <strong>{outOfDreCount} lançamento(s)</strong> fora do DRE ({fmt(Math.abs(outOfDreTotal))} de impacto líquido) porque estão sem categoria ou em categoria sem linha de DRE. Eles existem no caixa, mas não aparecem em nenhuma linha abaixo. Vincule as categorias em Configurações → Categorias.
            <span className="mt-2 block overflow-auto">
              <table className="w-full text-xs text-foreground">
                <thead><tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">Data</th><th className="py-1 pr-2">Descrição</th>
                  <th className="py-1 pr-2">Categoria</th><th className="py-1 text-right">Valor</th><th></th>
                </tr></thead>
                <tbody>
                  {outOfDreItems.map(it => (
                    <tr key={it.id} className="border-t border-destructive/20">
                      <td className="py-1 pr-2 whitespace-nowrap">{it.date ? it.date.split('-').reverse().join('/') : '—'}</td>
                      <td className="py-1 pr-2">{it.description}</td>
                      <td className="py-1 pr-2">{it.category_id ? (outCatNames[it.category_id] ?? 'Categoria sem linha de DRE') : 'Sem categoria'}</td>
                      <td className="py-1 text-right whitespace-nowrap">{fmt(it.value)}</td>
                      <td className="py-1 pl-2">
                        <a className="underline" href={`/lancamentos?q=${encodeURIComponent(it.description)}`}>Abrir</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          </span>
        </div>
      )}

      {generated && (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="p-0 overflow-x-auto" ref={reportRef}>
            {lines.length === 0 && !loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma linha DRE configurada ou sem dados no período.
              </div>
            ) : (
              <Table className={cn(compact && '[&_td]:py-1.5 [&_th]:py-2')}>
                <TableHeader>
                  <TableRow>
                    {showCode && <TableHead className="w-16">#</TableHead>}
                    <TableHead>Linha</TableHead>
                    <TableHead className="text-right w-36">Realizado</TableHead>
                    {showAV && <TableHead className="text-right w-20">AV %</TableHead>}
                    {showBudgetCol && <TableHead className="text-right w-32">Orçado</TableHead>}
                    {showBudgetCol && <TableHead className="text-right w-24">Var %</TableHead>}
                    {showPreviousCol && <TableHead className="text-right w-32">Ano Anterior</TableHead>}
                    {showPreviousCol && <TableHead className="text-right w-24">AH %</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines
                    .filter(line => !onlySubtotals || line.is_subtotal)
                    .filter(line => {
                      if (!hideZero) return true;
                      const b = line.budgetValue ?? 0;
                      const p = line.previousValue ?? 0;
                      return line.value !== 0
                        || (showBudgetCol && b !== 0)
                        || (showPreviousCol && p !== 0);
                    })
                    .map(line => {
                    const budget = line.budgetValue ?? 0;
                    const prev = line.previousValue ?? 0;
                    const budgetVar = budget !== 0 ? ((line.value - budget) / Math.abs(budget)) * 100 : 0;
                    const ahVar = prev !== 0 ? ((line.value - prev) / Math.abs(prev)) * 100 : 0;
                    // For revenues, positive variance = good (green); for expenses (sign -1), inverse
                    const goodWhenHigher = (line.sign ?? 1) > 0;
                    const budgetClass = budget === 0 ? 'text-muted-foreground' :
                      (budgetVar > 0 === goodWhenHigher) ? 'text-emerald-600' : 'text-red-500';
                    const ahClass = prev === 0 ? 'text-muted-foreground' :
                      (ahVar > 0 === goodWhenHigher) ? 'text-emerald-600' : 'text-red-500';
                    return (
                      <TableRow
                        key={line.id}
                        className={cn(
                          line.is_subtotal && 'bg-muted/50 font-semibold',
                          line.depth === 0 && line.is_subtotal && 'border-t-2 border-border'
                        )}
                      >
                        {showCode && (
                          <TableCell className="text-xs text-muted-foreground">{line.code || ''}</TableCell>
                        )}
                        <TableCell
                          style={{ paddingLeft: `${(line.depth * 1.5) + 1}rem` }}
                          className={cn(line.is_subtotal ? 'font-semibold' : 'text-sm')}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {line.name}
                            {line.value !== 0 && (
                              <button
                                type="button"
                                onClick={() => setDrill(line)}
                                className="text-muted-foreground hover:text-primary"
                                title="Ver lançamentos desta linha"
                                aria-label={`Ver lançamentos de ${line.name}`}
                              >
                                <ListIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className={cn(
                          'text-right tabular-nums',
                          line.value > 0 && 'text-emerald-600',
                          line.value < 0 && 'text-red-500',
                          line.is_subtotal && 'font-semibold'
                        )}>
                          {fmt(line.value)}
                        </TableCell>
                        {showAV && (
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {revenueBase ? `${avFor(line.value).toFixed(1)}%` : '—'}
                          </TableCell>
                        )}
                        {showBudgetCol && (
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                            {budget !== 0 ? fmt(budget) : '—'}
                          </TableCell>
                        )}
                        {showBudgetCol && (
                          <TableCell className={cn('text-right tabular-nums text-xs font-medium', budgetClass)}>
                            {budget !== 0 ? fmtPct(budgetVar) : '—'}
                          </TableCell>
                        )}
                        {showPreviousCol && (
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                            {prev !== 0 ? fmt(prev) : '—'}
                          </TableCell>
                        )}
                        {showPreviousCol && (
                          <TableCell className={cn('text-right tabular-nums text-xs font-medium', ahClass)}>
                            {prev !== 0 ? fmtPct(ahVar) : '—'}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!drill} onOpenChange={o => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading">{drill?.code ? `${drill.code} - ` : ''}{drill?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th>
                  <th className="p-2 text-right">Valor</th><th></th></tr>
              </thead>
              <tbody>
                {drillItems.map(it => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{it.date ? it.date.split('-').reverse().join('/') : '—'}</td>
                    <td className="p-2">{it.description}</td>
                    <td className="p-2">{it.category_id ? (outCatNames[it.category_id] ?? '…') : '—'}</td>
                    <td className="p-2 text-right whitespace-nowrap tabular-nums">{fmt(it.value)}</td>
                    <td className="p-2">
                      <a className="underline" href={`/lancamentos?q=${encodeURIComponent(it.description)}`}>Abrir</a>
                    </td>
                  </tr>
                ))}
                {drillItems.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Linha calculada sem lançamentos diretos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {drillItems.length} lançamento(s) · total {fmt(drillItems.reduce((s, i) => s + i.value, 0))}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
