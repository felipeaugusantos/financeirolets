import { useState, useEffect, useRef } from 'react';
import { useCashFlowReport, CashFlowFilters } from '@/hooks/useCashFlowReport';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, TrendingUp, Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { cn } from '@/lib/utils';
import { exportToPdf } from '@/lib/exportPdf';
import { exportToCsv } from '@/lib/exportCsv';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
};

export default function CashFlowReport({ onBack }: { onBack: () => void }) {
  const { data, loading, generate } = useCashFlowReport();
  const [units, setUnits] = useState<any[]>([]);
  const [filters, setFilters] = useState<CashFlowFilters>({
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
  });
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name').then(({ data }) => {
      setUnits(data ?? []);
    });
  }, []);

  const handleGenerate = async () => {
    await generate(filters);
    setGenerated(true);
  };

  const handleExport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await exportToPdf({
        title: 'Fluxo de Caixa',
        subtitle: `Período: ${filters.dateFrom} a ${filters.dateTo}`,
        filename: `FluxoCaixa_${filters.dateFrom}_${filters.dateTo}.pdf`,
        element: reportRef.current,
      });
    } finally {
      setExporting(false);
    }
  };

  const totalReceitas = data.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas = data.reduce((s, d) => s + d.despesas, 0);
  const totalSaldo = totalReceitas - totalDespesas;

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
            <p className="text-xs text-muted-foreground">Entradas, saídas e saldo acumulado por mês</p>
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
              <Label className="text-xs">Unidade</Label>
              <Select value={filters.unit_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, unit_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
              </Button>
              {generated && data.length > 0 && (
                <Button variant="outline" size="icon" onClick={handleExport} disabled={exporting} title="Exportar PDF">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {generated && data.length > 0 && (
        <div ref={reportRef} className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="shadow-card rounded-2xl border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Receitas</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(totalReceitas)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card rounded-2xl border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Despesas</p>
                <p className="text-lg font-bold text-red-500">{fmt(totalDespesas)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-card rounded-2xl border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Saldo Período</p>
                <p className={cn('text-lg font-bold', totalSaldo >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(totalSaldo)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="shadow-card rounded-2xl border-border">
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmt(v), name === 'receitas' ? 'Receitas' : name === 'despesas' ? 'Despesas' : 'Acumulado']}
                    contentStyle={{ borderRadius: 12, fontSize: 13 }}
                  />
                  <Legend formatter={v => v === 'receitas' ? 'Receitas' : v === 'despesas' ? 'Despesas' : 'Acumulado'} />
                  <Bar dataKey="receitas" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="acumulado" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="shadow-card rounded-2xl border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map(row => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right text-emerald-600 tabular-nums">{fmt(row.receitas)}</TableCell>
                      <TableCell className="text-right text-red-500 tabular-nums">{fmt(row.despesas)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums font-medium', row.saldo >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.saldo)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums font-semibold', row.acumulado >= 0 ? 'text-emerald-600' : 'text-red-500')}>{fmt(row.acumulado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {generated && data.length === 0 && !loading && (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma transação paga/recebida no período selecionado.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
