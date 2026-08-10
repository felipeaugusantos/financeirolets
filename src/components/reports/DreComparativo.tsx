import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Columns3, Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { cn, toLocalISODate, todayLocalISO } from '@/lib/utils';
import { exportToPdf } from '@/lib/exportPdf';
import { exportToCsv } from '@/lib/exportCsv';
import { useToast } from '@/hooks/use-toast';
import { ReportCustomizer, useReportSections, SectionGroup } from './ReportCustomizer';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface DreLineComparative {
  id: string;
  code: string | null;
  name: string;
  sort_order: number;
  is_subtotal: boolean;
  sign: number;
  parent_id: string | null;
  depth: number;
  values: Record<string, number>; // unit_id -> value, '__all__' for consolidated, '__none__' for no-unit
}

interface UnitCol {
  id: string;
  label: string;
}

export default function DreComparativo({ onBack }: { onBack: () => void }) {
  const [lines, setLines] = useState<DreLineComparative[]>([]);
  const [unitCols, setUnitCols] = useState<UnitCol[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    dateTo: todayLocalISO(),
    regime: 'competencia' as 'competencia' | 'caixa',
  });
  const reportRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  type DcSecKey = 'showConsolidated' | 'showSemUnidade' | 'hideZero' | 'onlySubtotals' | 'compact';
  const dcGroups: SectionGroup<DcSecKey>[] = [
    {
      label: 'Colunas fixas',
      items: [
        { key: 'showConsolidated', label: 'Coluna Consolidado' },
        { key: 'showSemUnidade', label: 'Coluna "Sem unidade"', hint: 'Só aparece se houver lançamentos sem unidade no período.' },
      ],
    },
    {
      label: 'Linhas',
      items: [
        { key: 'hideZero', label: 'Ocultar linhas zeradas em todas as colunas visíveis' },
        { key: 'onlySubtotals', label: 'Somente subtotais' },
        { key: 'compact', label: 'Densidade compacta' },
      ],
    },
  ];
  const dcSec = useReportSections<DcSecKey>('dre-comparativo.sections.v1', {
    showConsolidated: true, showSemUnidade: true, hideZero: false, onlySubtotals: false, compact: false,
  });

  // Per-unit visibility (built dynamically after generating)
  const [hiddenUnits, setHiddenUnits] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('dre-comparativo.hiddenUnits.v1') || '{}'); } catch { return {}; }
  });
  const toggleUnit = (id: string) => setHiddenUnits((h) => {
    const next = { ...h, [id]: !h[id] };
    try { localStorage.setItem('dre-comparativo.hiddenUnits.v1', JSON.stringify(next)); } catch { /* */ }
    return next;
  });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      // 1. Fetch DRE lines, categories, units
      const [dreRes, catRes, unitRes] = await Promise.all([
        supabase.from('dre_lines').select('*').eq('active', true).order('sort_order'),
        supabase.from('categories').select('id, dre_line_id, type').eq('active', true).not('dre_line_id', 'is', null),
        supabase.from('units').select('id, name').eq('active', true).order('name'),
      ]);

      if (dreRes.error) throw dreRes.error;
      if (catRes.error) throw catRes.error;

      const dreLines = dreRes.data ?? [];
      const categories = catRes.data ?? [];
      const units = unitRes.data ?? [];

      // 2. Fetch transactions
      const dateField = filters.regime === 'caixa' ? 'payment_date' : 'competence_date';
      let txQuery = supabase
        .from('transactions')
        .select('id, amount, tax_amount, net_amount, category_id, type, status, unit_id')
        .gte(dateField, filters.dateFrom)
        .lte(dateField, filters.dateTo);

      if (filters.regime === 'caixa') {
        txQuery = txQuery.in('status', ['pago', 'recebido'] as any);
      }

      const { data: transactions, error: txErr } = await txQuery;
      if (txErr) throw txErr;

      // 3. Fetch allocations
      const txIds = (transactions ?? []).map((t: any) => t.id);
      const allocMap = new Map<string, { unit_id: string | null; allocation_type: string; percentage: number; amount: number | null }[]>();

      if (txIds.length > 0) {
        const { data: allocs } = await supabase
          .from('transaction_allocations')
          .select('transaction_id, unit_id, allocation_type, percentage, amount')
          .in('transaction_id', txIds);

        (allocs ?? []).forEach((a: any) => {
          const list = allocMap.get(a.transaction_id) || [];
          list.push(a);
          allocMap.set(a.transaction_id, list);
        });
      }

      // 4. Map category -> dre_line
      const catToDre = new Map<string, string>();
      categories.forEach((c: any) => { if (c.dre_line_id) catToDre.set(c.id, c.dre_line_id); });

      // 5. Build columns: consolidated + each unit with data + "Sem unidade"
      // lineValues[dre_line_id][unit_key] = sum
      const lineValues = new Map<string, Map<string, number>>();
      const unitsWithData = new Set<string>();

      const addValue = (dreLineId: string, unitKey: string, val: number) => {
        if (!lineValues.has(dreLineId)) lineValues.set(dreLineId, new Map());
        const m = lineValues.get(dreLineId)!;
        m.set(unitKey, (m.get(unitKey) || 0) + val);
        m.set('__all__', (m.get('__all__') || 0) + val);
        if (unitKey !== '__none__') unitsWithData.add(unitKey);
      };

      (transactions ?? []).forEach((tx: any) => {
        if (!tx.category_id) return;
        const dreLineId = catToDre.get(tx.category_id);
        if (!dreLineId) return;
        const totalVal = Number(tx.net_amount) || 0;
        const txAllocs = allocMap.get(tx.id);

        if (txAllocs && txAllocs.length > 0) {
          txAllocs.forEach(a => {
            const key = a.unit_id || '__none__';
            let allocVal = 0;
            if (a.allocation_type === 'percentual' && a.percentage) {
              allocVal = totalVal * (a.percentage / 100);
            } else if (a.amount) {
              allocVal = Number(a.amount);
            }
            addValue(dreLineId, key, allocVal);
            if (a.unit_id) unitsWithData.add(a.unit_id);
          });
        } else if (tx.unit_id) {
          addValue(dreLineId, tx.unit_id, totalVal);
          unitsWithData.add(tx.unit_id);
        } else {
          addValue(dreLineId, '__none__', totalVal);
        }
      });

      // 6. Build unit columns (only units with data)
      const cols: UnitCol[] = [{ id: '__all__', label: 'Consolidado' }];
      units.forEach(u => {
        if (unitsWithData.has(u.id)) cols.push({ id: u.id, label: u.name });
      });
      // Check if there's any "sem unidade" data
      let hasNone = false;
      lineValues.forEach(m => { if (m.has('__none__') && m.get('__none__') !== 0) hasNone = true; });
      if (hasNone) cols.push({ id: '__none__', label: 'Sem unidade' });

      // 7. Depths
      const depthMap = new Map<string, number>();
      const getDepth = (id: string): number => {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const line = dreLines.find((l: any) => l.id === id);
        if (!line || !line.parent_id) { depthMap.set(id, 0); return 0; }
        const d = getDepth(line.parent_id) + 1;
        depthMap.set(id, d);
        return d;
      };
      dreLines.forEach((l: any) => getDepth(l.id));

      // 8. Compute values per column with subtotals
      const computedValues = new Map<string, Map<string, number>>();

      const getLineValue = (line: any, colId: string): number => {
        const key = `${line.id}__${colId}`;
        if (computedValues.has(line.id) && computedValues.get(line.id)!.has(colId)) {
          return computedValues.get(line.id)!.get(colId)!;
        }

        let val: number;
        if (!line.is_subtotal) {
          const raw = lineValues.get(line.id)?.get(colId) || 0;
          val = raw * (line.sign ?? 1);
        } else {
          const children = dreLines.filter((c: any) => c.parent_id === line.id);
          if (children.length > 0) {
            val = children.reduce((sum: number, child: any) => sum + getLineValue(child, colId), 0);
          } else {
            const code = line.code;
            if (code === '3') {
              const g1 = dreLines.find((l: any) => l.code === '1');
              const g2 = dreLines.find((l: any) => l.code === '2');
              val = (g1 ? getLineValue(g1, colId) : 0) + (g2 ? getLineValue(g2, colId) : 0);
            } else if (code === '5') {
              const g3 = dreLines.find((l: any) => l.code === '3');
              const g4 = dreLines.find((l: any) => l.code === '4');
              val = (g3 ? getLineValue(g3, colId) : 0) + (g4 ? getLineValue(g4, colId) : 0);
            } else if (code === '8') {
              const g5 = dreLines.find((l: any) => l.code === '5');
              const g6 = dreLines.find((l: any) => l.code === '6');
              const g7 = dreLines.find((l: any) => l.code === '7');
              val = (g5 ? getLineValue(g5, colId) : 0) + (g6 ? getLineValue(g6, colId) : 0) + (g7 ? getLineValue(g7, colId) : 0);
            } else {
              val = 0;
            }
          }
        }

        if (!computedValues.has(line.id)) computedValues.set(line.id, new Map());
        computedValues.get(line.id)!.set(colId, val);
        return val;
      };

      const result: DreLineComparative[] = dreLines.map((l: any) => {
        const values: Record<string, number> = {};
        cols.forEach(col => { values[col.id] = getLineValue(l, col.id); });
        return {
          id: l.id, code: l.code, name: l.name, sort_order: l.sort_order,
          is_subtotal: l.is_subtotal, sign: l.sign, parent_id: l.parent_id,
          depth: depthMap.get(l.id) || 0, values,
        };
      });

      setLines(result);
      setUnitCols(cols);
      setGenerated(true);
    } catch (err: any) {
      toast({ title: 'Erro ao gerar DRE Comparativo', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const visibleCols = unitCols.filter((c) => {
    if (c.id === '__all__') return dcSec.isOn('showConsolidated');
    if (c.id === '__none__') return dcSec.isOn('showSemUnidade');
    return !hiddenUnits[c.id];
  });
  const visibleLines = lines
    .filter((l) => !dcSec.isOn('onlySubtotals') || l.is_subtotal)
    .filter((l) => {
      if (!dcSec.isOn('hideZero')) return true;
      return visibleCols.some((c) => (l.values[c.id] ?? 0) !== 0);
    });

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportToPdf({
        title: 'DRE Comparativo por Unidade',
        subtitle: `Período: ${filters.dateFrom} a ${filters.dateTo} | Regime: ${filters.regime === 'competencia' ? 'Competência' : 'Caixa'}`,
        filename: `DRE_Comparativo_${filters.dateFrom}_${filters.dateTo}.pdf`,
        element: reportRef.current,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Código', 'Linha', ...unitCols.map(c => c.label)];
    const rows = lines.map(l => [
      l.code || '',
      '  '.repeat(l.depth) + l.name,
      ...unitCols.map(c => (l.values[c.id] ?? 0).toFixed(2).replace('.', ',')),
    ]);
    exportToCsv(`DRE_Comparativo_${filters.dateFrom}_${filters.dateTo}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <Columns3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">DRE Comparativo por Unidade</CardTitle>
            <p className="text-xs text-muted-foreground">Todas as unidades lado a lado</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <Label className="text-xs">Regime</Label>
              <Select value={filters.regime} onValueChange={(v: any) => setFilters(f => ({ ...f, regime: v }))}>
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
              {generated && lines.length > 0 && (
                <>
                  <Button variant="outline" size="icon" onClick={handleExportCsv} title="Exportar CSV">
                    <FileSpreadsheet className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleExportPdf} disabled={exporting} title="Exportar PDF">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {generated && unitCols.filter(c => c.id !== '__all__' && c.id !== '__none__').map((c) => {
                const hidden = !!hiddenUnits[c.id];
                return (
                  <Button
                    key={c.id}
                    type="button"
                    variant={hidden ? 'outline' : 'secondary'}
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => toggleUnit(c.id)}
                    title={hidden ? 'Mostrar unidade' : 'Ocultar unidade'}
                  >
                    {hidden ? `+ ${c.label}` : c.label}
                  </Button>
                );
              })}
            </div>
            <ReportCustomizer<DcSecKey>
              groups={dcGroups}
              sections={dcSec.sections}
              onToggle={dcSec.toggle}
              onReset={() => { dcSec.reset(); setHiddenUnits({}); try { localStorage.removeItem('dre-comparativo.hiddenUnits.v1'); } catch { /* */ } }}
              inlineKeys={['hideZero', 'onlySubtotals']}
              description="Mostre/oculte colunas de unidade, Consolidado e Sem unidade, e ajuste as linhas exibidas."
            />
          </div>
        </CardContent>
      </Card>

      {generated && (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="p-0 overflow-x-auto" ref={reportRef}>
            {lines.length === 0 && !loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma linha DRE configurada ou sem dados no período.
              </div>
            ) : (
              <Table className={cn(dcSec.isOn('compact') && '[&_td]:py-1.5 [&_th]:py-2')}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 sticky left-0 bg-background z-10">#</TableHead>
                    <TableHead className="min-w-[200px] sticky left-12 bg-background z-10">Linha</TableHead>
                    {visibleCols.map(col => (
                      <TableHead key={col.id} className={cn(
                        'text-right min-w-[120px]',
                        col.id === '__all__' && 'font-bold bg-muted/30',
                        col.id === '__none__' && 'bg-warning/10 text-warning border-l border-warning/30'
                      )}>
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLines.map(line => (
                    <TableRow
                      key={line.id}
                      className={cn(
                        line.is_subtotal && 'bg-muted/50 font-semibold',
                        line.depth === 0 && line.is_subtotal && 'border-t-2 border-border'
                      )}
                    >
                      <TableCell className="text-xs text-muted-foreground sticky left-0 bg-inherit z-10">
                        {line.code || ''}
                      </TableCell>
                      <TableCell
                        style={{ paddingLeft: `${(line.depth * 1.5) + 1}rem` }}
                        className={cn(
                          'sticky left-12 bg-inherit z-10 whitespace-nowrap',
                          line.is_subtotal ? 'font-semibold' : 'text-sm'
                        )}
                      >
                        {line.name}
                      </TableCell>
                      {visibleCols.map(col => {
                        const v = line.values[col.id] ?? 0;
                        return (
                          <TableCell key={col.id} className={cn(
                            'text-right tabular-nums text-sm',
                            v > 0 && 'text-[hsl(var(--success))]',
                            v < 0 && 'text-destructive',
                            line.is_subtotal && 'font-semibold',
                            col.id === '__all__' && 'bg-muted/30',
                            col.id === '__none__' && 'bg-warning/10 border-l border-warning/30'
                          )}>
                            {fmt(v)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
