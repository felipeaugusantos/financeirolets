import { useState, useEffect, useRef, useMemo } from 'react';
import { useDreGerencial, DreGerencialFilters, DreGerencialLine } from '@/hooks/useDreGerencial';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, BarChart3, Loader2, Download, FileSpreadsheet, AlertTriangle,
  RotateCcw, ArrowUp, ArrowDown, Minus, Info,
} from 'lucide-react';
import { cn, toLocalISODate, todayLocalISO } from '@/lib/utils';
import { exportToPdf } from '@/lib/exportPdf';
import { exportToCsv, csvNumber, csvCode, csvIndent, CsvCell } from '@/lib/exportCsv';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const startOfYear = () => toLocalISODate(new Date(new Date().getFullYear(), 0, 1));

const defaultFilters: DreGerencialFilters = {
  dateFrom: startOfYear(),
  dateTo: todayLocalISO(),
  regime: 'competencia',
  onlyRealized: false,
  comparison: 'none',
};

interface SummaryCard {
  label: string;
  value: number;
  /** Percentual sobre a receita líquida (null = a própria base). */
  pct: number | null;
  previous?: number;
}

/** Indicador de variação com ícone + texto (nunca só cor). */
function Variation({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null;
  if (previous === 0) {
    return <p className="text-xs text-muted-foreground">sem base de comparação</p>;
  }
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  const up = diff > 0;
  const flat = Math.abs(diff) < 0.005;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <p className={cn(
      'text-xs flex items-center gap-1',
      flat ? 'text-muted-foreground' : up ? 'text-emerald-600' : 'text-red-500'
    )}>
      <Icon className="h-3 w-3 shrink-0" />
      <span>
        {flat ? 'estável' : `${up ? 'aumento' : 'redução'} de ${Math.abs(pct).toFixed(1)}%`} vs período comparado
      </span>
    </p>
  );
}

export default function DreGerencial({ onBack }: { onBack: () => void }) {
  const { lines, loading, error, generate, outOfDreTotal, outOfDreCount, missingCategories } = useDreGerencial();
  const [units, setUnits] = useState<any[]>([]);
  const [fronts, setFronts] = useState<any[]>([]);
  const [filters, setFilters] = useState<DreGerencialFilters>(defaultFilters);
  const [applied, setApplied] = useState<DreGerencialFilters | null>(null);
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setUnits(data ?? []));
    supabase.from('business_fronts').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setFronts(data ?? []));
  }, []);

  const byCode = useMemo(() => {
    const m = new Map<string, DreGerencialLine>();
    lines.forEach(l => { if (l.code) m.set(l.code, l); });
    return m;
  }, [lines]);

  const val = (code: string) => byCode.get(code)?.value ?? 0;
  const prevVal = (code: string) => byCode.get(code)?.previousValue;

  const receitaLiquida = val('C3');
  const depreciacao = val('C6.06'); // negativo
  const ebitda = val('C7') - depreciacao;
  const ebitdaPrev = prevVal('C7') !== undefined
    ? (prevVal('C7') as number) - (prevVal('C6.06') ?? 0)
    : undefined;

  const pctOf = (v: number) => (receitaLiquida !== 0 ? (v / receitaLiquida) * 100 : 0);

  const cards: SummaryCard[] = [
    { label: 'Receita Líquida', value: receitaLiquida, pct: null, previous: prevVal('C3') },
    { label: 'Lucro Bruto', value: val('C5'), pct: pctOf(val('C5')), previous: prevVal('C5') },
    { label: 'Resultado Operacional', value: val('C7'), pct: pctOf(val('C7')), previous: prevVal('C7') },
    { label: 'EBITDA', value: ebitda, pct: pctOf(ebitda), previous: ebitdaPrev },
    { label: 'Lucro Líquido', value: val('C11'), pct: pctOf(val('C11')), previous: prevVal('C11') },
  ];

  const hasComparison = (applied?.comparison ?? 'none') !== 'none';

  const visibleLines = lines.filter(l => {
    if (!hideEmpty) return true;
    return l.value !== 0 || (l.previousValue ?? 0) !== 0 || l.is_subtotal;
  });

  const hasMovement = lines.some(l => l.value !== 0);

  const handleApply = async () => {
    setApplied(filters);
    await generate(filters);
    setGenerated(true);
  };

  const handleClear = () => {
    setFilters(defaultFilters);
  };

  const handleExportCsv = () => {
    const headers: CsvCell[] = ['Código', 'Conta', 'Valor', '% Receita'];
    if (hasComparison) headers.push('Período comparado', 'Diferença R$', 'Variação %');
    const rows = lines.map(l => {
      const r: CsvCell[] = [
        csvCode(l.code),
        csvIndent(l.depth, l.name),
        csvNumber(l.value),
        csvNumber(pctOf(l.value), 1),
      ];
      if (hasComparison) {
        const p = l.previousValue ?? 0;
        r.push(csvNumber(p), csvNumber(l.value - p), csvNumber(p !== 0 ? ((l.value - p) / Math.abs(p)) * 100 : 0, 1));
      }
      return r;
    });
    exportToCsv(`DRE_Gerencial_${filters.dateFrom}_${filters.dateTo}.csv`, headers, rows);
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportToPdf({
        title: 'DRE Gerencial',
        subtitle: `Período: ${filters.dateFrom} a ${filters.dateTo} | Regime: ${filters.regime === 'competencia' ? 'Competência' : 'Caixa'}`,
        filename: `DRE_Gerencial_${filters.dateFrom}_${filters.dateTo}.pdf`,
        element: reportRef.current,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">DRE Gerencial</CardTitle>
            <p className="text-xs text-muted-foreground">
              Estrutura contábil: Receita Líquida, Lucro Bruto, EBITDA e Lucro Líquido
            </p>
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
              <Select value={filters.unit_id || '__all__'}
                onValueChange={v => setFilters(f => ({ ...f, unit_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sem unidade</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frente de negócio</Label>
              <Select value={filters.front_id || '__all__'}
                onValueChange={v => setFilters(f => ({ ...f, front_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {fronts.map(fr => <SelectItem key={fr.id} value={fr.id}>{fr.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div className="space-y-1">
              <Label className="text-xs">Comparação</Label>
              <Select value={filters.comparison} onValueChange={(v: any) => setFilters(f => ({ ...f, comparison: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem comparação</SelectItem>
                  <SelectItem value="previous">Período anterior</SelectItem>
                  <SelectItem value="lastYear">Mesmo período do ano anterior</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {filters.regime === 'competencia' && (
              <div className="flex items-center gap-2">
                <Switch id="dg-realized" checked={!!filters.onlyRealized}
                  onCheckedChange={v => setFilters(f => ({ ...f, onlyRealized: v }))} />
                <Label htmlFor="dg-realized" className="text-sm cursor-pointer">Somente realizado</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="dg-empty" checked={hideEmpty} onCheckedChange={setHideEmpty} />
              <Label htmlFor="dg-empty" className="text-sm cursor-pointer">Ocultar contas sem movimento</Label>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button onClick={handleApply} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar filtros'}
              </Button>
              <Button variant="outline" size="icon" onClick={handleClear} title="Limpar filtros">
                <RotateCcw className="h-4 w-4" />
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
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando o resultado do período...
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Não foi possível gerar o DRE Gerencial: {error}</span>
        </div>
      )}

      {!loading && !error && generated && !hasMovement && (
        <div className="rounded-xl border border-border p-10 text-center text-sm text-muted-foreground">
          Não existem lançamentos financeiros para o período selecionado.
        </div>
      )}

      {!loading && !error && generated && hasMovement && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {cards.map(c => (
              <Card key={c.label} className="shadow-card rounded-2xl border-border">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-heading font-semibold text-card-foreground">{fmt(c.value)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.pct === null ? 'base de 100% da receita' : `margem de ${fmtPct(c.pct)} da receita líquida`}
                  </p>
                  <Variation current={c.value} previous={c.previous} />
                </CardContent>
              </Card>
            ))}
          </div>

          {outOfDreCount > 0 && (() => {
            const patrimoniais = missingCategories.filter(c => c.isPatrimonial);
            const pendentes = missingCategories.filter(c => !c.isPatrimonial);
            const somaPat = patrimoniais.reduce((s, c) => s + Math.abs(c.total), 0);
            const qtdPat = patrimoniais.reduce((s, c) => s + c.count, 0);
            const item = (c: typeof missingCategories[number]) => (
              <li key={c.categoryId ?? '__none__'} className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs opacity-80">
                  {c.count} lançamento(s) · {fmt(Math.abs(c.total))}
                  {c.type ? ` · ${c.type === 'receita' ? 'Receita' : 'Despesa'}` : ''}
                  {c.gerencialCode ? ` · Gerencial: ${c.gerencialCode} ${c.gerencialName ?? ''}` : ''}
                </span>
              </li>
            );
            return (
              <div className="space-y-3">
                {patrimoniais.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        <strong>{qtdPat} lançamento(s)</strong> ({fmt(somaPat)}) são movimentações
                        patrimoniais/financeiras (transferências entre contas, aportes, empréstimos,
                        compra de ativos, ajustes de caixa). Elas ficam fora do DRE Contábil por
                        natureza — aparecem apenas no DRE Gerencial e no Fluxo de Caixa. Nada a corrigir.
                      </p>
                      <ul className="space-y-1">{patrimoniais.map(item)}</ul>
                    </div>
                  </div>
                )}
                {pendentes.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="text-destructive space-y-2">
                      <p>
                        <strong>{pendentes.reduce((s, c) => s + c.count, 0)} lançamento(s)</strong>{' '}
                        ({fmt(pendentes.reduce((s, c) => s + Math.abs(c.total), 0))}) precisam de vínculo:
                        a categoria ainda não está ligada a uma linha da estrutura contábil.
                        Vincule em Configurações → Categorias (campo "Linha do DRE").
                      </p>
                      <ul className="space-y-1">{pendentes.map(item)}</ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <Card className="shadow-card rounded-2xl border-border">
            <CardContent className="p-0 overflow-x-auto" ref={reportRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right w-36">Valor</TableHead>
                    <TableHead className="text-right w-24">% Receita</TableHead>
                    {hasComparison && <TableHead className="text-right w-36 hidden md:table-cell">Comparado</TableHead>}
                    {hasComparison && <TableHead className="text-right w-32 hidden md:table-cell">Diferença</TableHead>}
                    {hasComparison && <TableHead className="text-right w-24 hidden md:table-cell">Var. %</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLines.map(l => {
                    const isResult = !!l.formula;
                    const prev = l.previousValue ?? 0;
                    const diff = l.value - prev;
                    const varPct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
                    return (
                      <TableRow
                        key={l.id}
                        className={cn(
                          l.is_subtotal && 'bg-muted/40 font-semibold',
                          isResult && 'border-t-2 border-border font-bold text-base'
                        )}
                      >
                        <TableCell style={{ paddingLeft: `${12 + l.depth * 18}px` }}>{l.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(l.value)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtPct(pctOf(l.value))}
                        </TableCell>
                        {hasComparison && (
                          <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                            {fmt(prev)}
                          </TableCell>
                        )}
                        {hasComparison && (
                          <TableCell className="text-right tabular-nums hidden md:table-cell">
                            {diff >= 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                          </TableCell>
                        )}
                        {hasComparison && (
                          <TableCell className="text-right tabular-nums hidden md:table-cell">
                            {prev === 0 ? '—' : `${varPct >= 0 ? '+' : '−'}${Math.abs(varPct).toFixed(1)}%`}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
