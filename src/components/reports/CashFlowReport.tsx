import { useState, useEffect, useRef } from 'react';
import { useCashFlowReport, CashFlowFilters } from '@/hooks/useCashFlowReport';
import { useCashFlowProjected } from '@/hooks/useCashFlowProjected';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, TrendingUp, Loader2, Download, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { cn, toLocalISODate } from '@/lib/utils';
import { exportToPdf } from '@/lib/exportPdf';
import { exportToCsv, csvNumber, CsvCell } from '@/lib/exportCsv';
import { FilterPresets } from './FilterPresets';
import { ReportCustomizer, useReportSections, SectionGroup } from './ReportCustomizer';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
};

type Mode = 'realizado' | 'projetado' | 'comparativo';

export default function CashFlowReport({ onBack }: { onBack: () => void }) {
  const { data: realizedData, loading: loadingReal, generate: genRealized } = useCashFlowReport();
  const { data: projectedData, loading: loadingProj, generate: genProjected } = useCashFlowProjected();
  const [mode, setMode] = useState<Mode>('realizado');
  const [units, setUnits] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState<CashFlowFilters>({
    dateFrom: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    dateTo: toLocalISODate(new Date(new Date().getFullYear(), 11, 31)),
  });
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  type CfSecKey =
    | 'showKpis' | 'showChart' | 'showTable'
    | 'colReceitas' | 'colDespesas' | 'colSaldo' | 'colAcumulado'
    | 'colReceitasProj' | 'colDespesasProj'
    | 'hideZeroRows';
  const cfGroups: SectionGroup<CfSecKey>[] = [
    {
      label: 'Blocos',
      items: [
        { key: 'showKpis', label: 'KPIs (totais do período)' },
        { key: 'showChart', label: 'Gráfico' },
        { key: 'showTable', label: 'Tabela mensal' },
      ],
    },
    {
      label: 'Colunas da tabela (Realizado)',
      items: [
        { key: 'colReceitas', label: 'Receitas' },
        { key: 'colDespesas', label: 'Despesas' },
        { key: 'colSaldo', label: 'Saldo do mês' },
        { key: 'colAcumulado', label: 'Acumulado' },
      ],
    },
    {
      label: 'Colunas extras (Projetado)',
      items: [
        { key: 'colReceitasProj', label: 'Receitas projetadas' },
        { key: 'colDespesasProj', label: 'Despesas projetadas' },
      ],
    },
    {
      label: 'Filtros visuais',
      items: [
        { key: 'hideZeroRows', label: 'Ocultar meses sem movimento' },
      ],
    },
  ];
  const cfSec = useReportSections<CfSecKey>('cashflow.sections.v1', {
    showKpis: true, showChart: true, showTable: true,
    colReceitas: true, colDespesas: true, colSaldo: true, colAcumulado: true,
    colReceitasProj: true, colDespesasProj: true,
    hideZeroRows: false,
  });
  const hideZero = cfSec.isOn('hideZeroRows');

  const defaultFilters: CashFlowFilters = {
    dateFrom: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    dateTo: toLocalISODate(new Date(new Date().getFullYear(), 11, 31)),
  };

  const handleClearFilters = () => setFilters(defaultFilters);

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name').then(({ data }) => {
      setUnits(data ?? []);
    });
    supabase.from('categories').select('id, name').order('name').then(({ data }) => {
      setCategories(data ?? []);
    });
  }, []);

  const loading = loadingReal || loadingProj;

  const handleGenerate = async () => {
    if (mode === 'realizado') {
      await genRealized(filters);
    } else if (mode === 'projetado') {
      await genProjected(filters);
    } else {
      await Promise.all([genRealized(filters), genProjected(filters)]);
    }
    setGenerated(true);
  };

  const handleExport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportToPdf({
        title: `Fluxo de Caixa — ${mode === 'realizado' ? 'Realizado' : mode === 'projetado' ? 'Projetado' : 'Comparativo'}`,
        subtitle: `Período: ${filters.dateFrom} a ${filters.dateTo}`,
        filename: `FluxoCaixa_${mode}_${filters.dateFrom}_${filters.dateTo}.pdf`,
        element: reportRef.current,
      });
    } finally {
      setExporting(false);
    }
  };

  // CSV depending on mode
  const handleExportCsv = () => {
    if (mode === 'realizado') {
      const headers: CsvCell[] = ['Mês', 'Receitas', 'Despesas', 'Saldo', 'Acumulado'];
      const rows: CsvCell[][] = realizedData.map(d => [
        d.label,
        csvNumber(d.receitas),
        csvNumber(d.despesas),
        csvNumber(d.receitas - d.despesas),
        csvNumber(d.acumulado),
      ]);
      exportToCsv(`FluxoCaixa_${filters.dateFrom}_${filters.dateTo}.csv`, headers, rows);
    } else if (mode === 'projetado') {
      const headers: CsvCell[] = ['Mês', 'Receitas Realiz.', 'Receitas Proj.', 'Despesas Realiz.', 'Despesas Proj.', 'Saldo', 'Acumulado'];
      const rows: CsvCell[][] = projectedData.map(d => [
        d.label,
        csvNumber(d.receitasRealizadas),
        csvNumber(d.receitasProjetadas),
        csvNumber(d.despesasRealizadas),
        csvNumber(d.despesasProjetadas),
        csvNumber(d.saldoTotal),
        csvNumber(d.acumulado),
      ]);
      exportToCsv(`FluxoCaixa_Projetado_${filters.dateFrom}_${filters.dateTo}.csv`, headers, rows);
    } else {
      // Comparativo: realizado vs projetado lado a lado
      const headers: CsvCell[] = ['Mês', 'Saldo Realizado', 'Saldo Projetado', 'Diferença'];
      const rows: CsvCell[][] = comparativeData.map(d => [
        d.label,
        csvNumber(d.realizado),
        csvNumber(d.projetado),
        csvNumber(d.projetado - d.realizado),
      ]);
      exportToCsv(`FluxoCaixa_Comparativo_${filters.dateFrom}_${filters.dateTo}.csv`, headers, rows);
    }
  };

  const totalRecReal = realizedData.reduce((s, d) => s + d.receitas, 0);
  const totalDespReal = realizedData.reduce((s, d) => s + d.despesas, 0);
  const totalSaldoReal = totalRecReal - totalDespReal;

  const totalRecProj = projectedData.reduce((s, d) => s + d.receitasProjetadas, 0);
  const totalDespProj = projectedData.reduce((s, d) => s + d.despesasProjetadas, 0);

  // Comparativo dataset
  const comparativeData = (() => {
    const months = new Set<string>([
      ...realizedData.map(d => d.month),
      ...projectedData.map(d => d.month),
    ]);
    return Array.from(months).sort().map(m => {
      const r = realizedData.find(d => d.month === m);
      const p = projectedData.find(d => d.month === m);
      return {
        month: m,
        label: r?.label || p?.label || m,
        realizado: r ? r.receitas - r.despesas : 0,
        projetado: p ? p.saldoTotal : 0,
      };
    });
  })();

  const dataAvailable =
    (mode === 'realizado' && realizedData.length > 0) ||
    (mode === 'projetado' && projectedData.length > 0) ||
    (mode === 'comparativo' && comparativeData.length > 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">Fluxo de Caixa</CardTitle>
            <p className="text-xs text-muted-foreground">Realizado, projetado e comparativo</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setGenerated(false); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="realizado">Realizado</TabsTrigger>
              <TabsTrigger value="projetado">Projetado</TabsTrigger>
              <TabsTrigger value="comparativo">Comparativo</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <div className="flex items-end gap-2">
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
              </Button>
              <Button variant="outline" size="icon" onClick={handleClearFilters} title="Limpar filtros">
                <RotateCcw className="h-4 w-4" />
              </Button>
              {generated && dataAvailable && (
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

          <FilterPresets<CashFlowFilters>
            storageKey="cashflow.filterPresets.v1"
            currentFilters={filters}
            onApply={(p) => setFilters(p)}
          />

          <div className="flex justify-end">
            <ReportCustomizer<CfSecKey>
              groups={cfGroups}
              sections={cfSec.sections}
              onToggle={cfSec.toggle}
              onReset={cfSec.reset}
              inlineKeys={['showChart', 'showTable']}
              description="Escolha quais blocos e colunas aparecem em cada aba. A exportação (CSV/PDF) inclui tudo."
            />
          </div>
        </CardContent>
      </Card>

      {generated && (
        <div ref={reportRef} className="space-y-4">
          {mode === 'realizado' && realizedData.length > 0 && (
            <>
              {cfSec.isOn('showKpis') && (
              <div className="grid grid-cols-3 gap-3">
                <Card className="shadow-card rounded-2xl border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Receitas</p>
                    <p className="text-lg font-bold text-emerald-600">{fmt(totalRecReal)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-card rounded-2xl border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Despesas</p>
                    <p className="text-lg font-bold text-red-500">{fmt(totalDespReal)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-card rounded-2xl border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Saldo Período</p>
                    <p className={cn('text-lg font-bold', totalSaldoReal >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(totalSaldoReal)}</p>
                  </CardContent>
                </Card>
              </div>
              )}

              {cfSec.isOn('showChart') && (
              <Card className="shadow-card rounded-2xl border-border">
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={realizedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                      <Legend />
                      {cfSec.isOn('colReceitas') && <Bar dataKey="receitas" name="Receitas" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />}
                      {cfSec.isOn('colDespesas') && <Bar dataKey="despesas" name="Despesas" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />}
                      {cfSec.isOn('colAcumulado') && <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              )}

              {cfSec.isOn('showTable') && (
              <Card className="shadow-card rounded-2xl border-border">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        {cfSec.isOn('colReceitas') && <TableHead className="text-right">Receitas</TableHead>}
                        {cfSec.isOn('colDespesas') && <TableHead className="text-right">Despesas</TableHead>}
                        {cfSec.isOn('colSaldo') && <TableHead className="text-right">Saldo</TableHead>}
                        {cfSec.isOn('colAcumulado') && <TableHead className="text-right">Acumulado</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {realizedData
                        .filter(row => !hideZero || row.receitas !== 0 || row.despesas !== 0)
                        .map(row => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          {cfSec.isOn('colReceitas') && <TableCell className="text-right text-emerald-600 tabular-nums">{fmt(row.receitas)}</TableCell>}
                          {cfSec.isOn('colDespesas') && <TableCell className="text-right text-red-500 tabular-nums">{fmt(row.despesas)}</TableCell>}
                          {cfSec.isOn('colSaldo') && <TableCell className={cn('text-right tabular-nums font-medium', row.saldo >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.saldo)}</TableCell>}
                          {cfSec.isOn('colAcumulado') && <TableCell className={cn('text-right tabular-nums font-semibold', row.acumulado >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.acumulado)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              )}
            </>
          )}

          {mode === 'projetado' && projectedData.length > 0 && (
            <>
              {cfSec.isOn('showKpis') && (
              <div className="grid grid-cols-3 gap-3">
                <Card className="shadow-card rounded-2xl border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Receitas Projetadas</p>
                    <p className="text-lg font-bold text-emerald-600">{fmt(totalRecProj)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-card rounded-2xl border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Despesas Projetadas</p>
                    <p className="text-lg font-bold text-red-500">{fmt(totalDespProj)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-card rounded-2xl border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Saldo Final Projetado</p>
                    <p className={cn('text-lg font-bold', (projectedData[projectedData.length - 1]?.acumulado ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {fmt(projectedData[projectedData.length - 1]?.acumulado ?? 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>
              )}

              {cfSec.isOn('showChart') && (
              <Card className="shadow-card rounded-2xl border-border">
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={projectedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                      <Legend />
                      {cfSec.isOn('colReceitas') && <Bar dataKey="receitasRealizadas" name="Receitas Realiz." stackId="r" fill="hsl(142, 71%, 45%)" />}
                      {cfSec.isOn('colReceitasProj') && <Bar dataKey="receitasProjetadas" name="Receitas Proj." stackId="r" fill="hsl(142, 71%, 70%)" />}
                      {cfSec.isOn('colDespesas') && <Bar dataKey="despesasRealizadas" name="Despesas Realiz." stackId="d" fill="hsl(0, 84%, 60%)" />}
                      {cfSec.isOn('colDespesasProj') && <Bar dataKey="despesasProjetadas" name="Despesas Proj." stackId="d" fill="hsl(0, 84%, 78%)" />}
                      {cfSec.isOn('colAcumulado') && <Line type="monotone" dataKey="acumulado" name="Saldo Acumulado" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              )}

              {cfSec.isOn('showTable') && (
              <Card className="shadow-card rounded-2xl border-border">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        {cfSec.isOn('colReceitas') && <TableHead className="text-right">Receitas Realiz.</TableHead>}
                        {cfSec.isOn('colReceitasProj') && <TableHead className="text-right">Receitas Proj.</TableHead>}
                        {cfSec.isOn('colDespesas') && <TableHead className="text-right">Despesas Realiz.</TableHead>}
                        {cfSec.isOn('colDespesasProj') && <TableHead className="text-right">Despesas Proj.</TableHead>}
                        {cfSec.isOn('colSaldo') && <TableHead className="text-right">Saldo</TableHead>}
                        {cfSec.isOn('colAcumulado') && <TableHead className="text-right">Acumulado</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectedData
                        .filter(row => !hideZero || row.receitasRealizadas !== 0 || row.despesasRealizadas !== 0 || row.receitasProjetadas !== 0 || row.despesasProjetadas !== 0)
                        .map(row => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          {cfSec.isOn('colReceitas') && <TableCell className="text-right tabular-nums text-emerald-600">{fmt(row.receitasRealizadas)}</TableCell>}
                          {cfSec.isOn('colReceitasProj') && <TableCell className="text-right tabular-nums text-emerald-600/70">{fmt(row.receitasProjetadas)}</TableCell>}
                          {cfSec.isOn('colDespesas') && <TableCell className="text-right tabular-nums text-red-500">{fmt(row.despesasRealizadas)}</TableCell>}
                          {cfSec.isOn('colDespesasProj') && <TableCell className="text-right tabular-nums text-red-500/70">{fmt(row.despesasProjetadas)}</TableCell>}
                          {cfSec.isOn('colSaldo') && <TableCell className={cn('text-right tabular-nums font-medium', row.saldoTotal >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.saldoTotal)}</TableCell>}
                          {cfSec.isOn('colAcumulado') && <TableCell className={cn('text-right tabular-nums font-semibold', row.acumulado >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.acumulado)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              )}
            </>
          )}

          {mode === 'comparativo' && comparativeData.length > 0 && (
            <>
              {cfSec.isOn('showChart') && (
              <Card className="shadow-card rounded-2xl border-border">
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={comparativeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                      <Legend />
                      <Bar dataKey="realizado" name="Realizado" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="projetado" name="Projetado" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              )}

              {cfSec.isOn('showTable') && (
              <Card className="shadow-card rounded-2xl border-border">
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">Saldo Realizado</TableHead>
                        <TableHead className="text-right">Saldo Projetado</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparativeData
                        .filter(row => !hideZero || row.realizado !== 0 || row.projetado !== 0)
                        .map(row => {
                        const diff = row.projetado - row.realizado;
                        return (
                          <TableRow key={row.month}>
                            <TableCell className="font-medium">{row.label}</TableCell>
                            <TableCell className={cn('text-right tabular-nums', row.realizado >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.realizado)}</TableCell>
                            <TableCell className={cn('text-right tabular-nums', row.projetado >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.projetado)}</TableCell>
                            <TableCell className={cn('text-right tabular-nums font-medium', diff >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(diff)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              )}
            </>
          )}

          {!dataAvailable && !loading && (
            <Card className="shadow-card rounded-2xl border-border">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Nenhum dado encontrado para o período selecionado.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
