import { useEffect, useState } from 'react';
import { useReconciliation, ReconciliationFilters, BridgeRow } from '@/hooks/useReconciliation';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ArrowLeft, GitCompare, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Bridge({ title, rows, color }: { title: string; rows: BridgeRow[]; color: 'success' | 'destructive' }) {
  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader>
        <CardTitle className={cn('text-base font-heading', color === 'success' ? 'text-success' : 'text-destructive')}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} className={cn(r.emphasis === 'total' && 'bg-muted/40 font-semibold')}>
                <TableCell className="text-sm">
                  <div className="flex items-start gap-2">
                    <span>{r.label}</span>
                    {r.hint && (
                      <span title={r.hint} className="cursor-help mt-0.5">
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className={cn(
                  'text-right tabular-nums',
                  r.emphasis === 'delta' && (r.value >= 0 ? 'text-emerald-600' : 'text-red-500'),
                  r.emphasis === 'total' && 'font-semibold',
                )}>
                  {fmt(r.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function ReconciliationReport({ onBack }: { onBack: () => void }) {
  const { data, loading, generate } = useReconciliation();
  const [units, setUnits] = useState<any[]>([]);
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [filters, setFilters] = useState<ReconciliationFilters>({
    dateFrom: firstOfMonth,
    dateTo: lastOfMonth,
  });
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name').then(({ data }) => {
      setUnits(data ?? []);
    });
  }, []);

  const handleGenerate = async () => {
    await generate(filters);
    setGenerated(true);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <GitCompare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">Reconciliação Dashboard ↔ DRE</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mostra, no período, a ponte entre Dashboard, DRE Competência (cheio e somente realizado) e DRE Caixa.
            </p>
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
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {generated && data && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Bridge title="Receitas" rows={data.receitas.rows} color="success" />
          <Bridge title="Despesas" rows={data.despesas.rows} color="destructive" />
        </div>
      )}

      {generated && data && (
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Como ler</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p><strong>Dashboard</strong> e <strong>DRE Competência (somente realizado)</strong> devem coincidir — ambos contam o que foi pago/recebido com competência dentro do período.</p>
            <p>A diferença para o <strong>DRE Competência (cheio)</strong> é o valor <strong>provisionado</strong> (pendente/agendado).</p>
            <p>A diferença para o <strong>DRE Caixa</strong> vem de pagamentos cuja competência cai fora do período (entram no caixa) ou cuja competência está dentro mas o pagamento ficou fora (saem do caixa).</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}