import { useState, useEffect, useRef } from 'react';
import { useDreReport, DreFilters } from '@/hooks/useDreReport';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, FileText, Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportToPdf } from '@/lib/exportPdf';
import { exportToCsv } from '@/lib/exportCsv';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function DreReport({ onBack }: { onBack: () => void }) {
  const { lines, loading, generate } = useDreReport();
  const [units, setUnits] = useState<any[]>([]);
  const [filters, setFilters] = useState<DreFilters>({
    dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    regime: 'competencia',
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
    const headers = ['Código', 'Linha', 'Tipo', 'Valor'];
    const rows = lines.map(l => [
      l.code || '',
      '  '.repeat(l.depth) + l.name,
      l.is_subtotal ? 'Subtotal' : 'Linha',
      l.value.toFixed(2).replace('.', ','),
    ]);
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
            <p className="text-xs text-muted-foreground">Configure período, unidade e regime</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
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
            <div className="flex items-end gap-2">
              <Button onClick={handleGenerate} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
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
        </CardContent>
      </Card>

      {generated && (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="p-0" ref={reportRef}>
            {lines.length === 0 && !loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma linha DRE configurada ou sem dados no período.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Linha</TableHead>
                    <TableHead className="text-right w-40">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => (
                    <TableRow
                      key={line.id}
                      className={cn(
                        line.is_subtotal && 'bg-muted/50 font-semibold',
                        line.depth === 0 && line.is_subtotal && 'border-t-2 border-border'
                      )}
                    >
                      <TableCell className="text-xs text-muted-foreground">{line.code || ''}</TableCell>
                      <TableCell
                        style={{ paddingLeft: `${(line.depth * 1.5) + 1}rem` }}
                        className={cn(line.is_subtotal ? 'font-semibold' : 'text-sm')}
                      >
                        {line.name}
                      </TableCell>
                      <TableCell className={cn(
                        'text-right tabular-nums',
                        line.value > 0 && 'text-emerald-600',
                        line.value < 0 && 'text-red-500',
                        line.is_subtotal && 'font-semibold'
                      )}>
                        {fmt(line.value)}
                      </TableCell>
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
