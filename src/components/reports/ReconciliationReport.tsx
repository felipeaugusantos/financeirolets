import { Fragment, useEffect, useState } from 'react';
import { useReconciliation, ReconciliationFilters, BridgeRow, BucketKey, SideData } from '@/hooks/useReconciliation';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, GitCompare, Loader2, Info, ChevronDown, ChevronRight, Tag, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null) => d ? d.split('-').reverse().join('/') : '—';

function DetailPanel({ side, bucketKey }: { side: SideData; bucketKey: BucketKey }) {
  const d = side.details[bucketKey];
  if (!d || d.count === 0) {
    return <p className="text-xs text-muted-foreground p-3">Sem lançamentos nesta diferença.</p>;
  }
  return (
    <div className="space-y-3 p-3 bg-muted/20 rounded-xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
            <Tag className="h-3 w-3" /> Por categoria
          </div>
          <div className="space-y-1">
            {d.byCategory.map((g) => (
              <div key={g.name} className="flex items-center justify-between text-xs">
                <span className="truncate">{g.name} <span className="text-muted-foreground">({g.count})</span></span>
                <span className="tabular-nums font-medium">{fmt(g.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
            <Layers className="h-3 w-3" /> Por frente
          </div>
          <div className="space-y-1">
            {d.byFront.map((g) => (
              <div key={g.name} className="flex items-center justify-between text-xs">
                <span className="truncate">{g.name} <span className="text-muted-foreground">({g.count})</span></span>
                <span className="tabular-nums font-medium">{fmt(g.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1.5">Lançamentos ({d.count})</div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left p-2">Descrição</th>
                <th className="text-left p-2">Categoria</th>
                <th className="text-left p-2">Frente</th>
                <th className="text-left p-2">Comp.</th>
                <th className="text-left p-2">Pgto.</th>
                <th className="text-left p-2">Status</th>
                <th className="text-right p-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="p-2">
                    <div className="truncate max-w-[220px]" title={it.description}>{it.description}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{it.id.slice(0, 8)}</div>
                  </td>
                  <td className="p-2 text-muted-foreground">{it.category_name}</td>
                  <td className="p-2 text-muted-foreground">{it.front_name}</td>
                  <td className="p-2">{fmtDate(it.competence_date)}</td>
                  <td className="p-2">{fmtDate(it.payment_date)}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{it.status}</Badge>
                  </td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmt(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Bridge({ title, side, color }: { title: string; side: SideData; color: 'success' | 'destructive' }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (i: number) => setOpen((s) => ({ ...s, [i]: !s[i] }));

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
            {side.rows.map((r, i) => {
              const expandable = !!r.key && (side.details[r.key]?.count ?? 0) > 0;
              const isOpen = !!open[i];
              return (
                <Fragment key={i}>
                  <TableRow
                    className={cn(
                      r.emphasis === 'total' && 'bg-muted/40 font-semibold',
                      expandable && 'cursor-pointer hover:bg-muted/30',
                    )}
                    onClick={expandable ? () => toggle(i) : undefined}
                  >
                    <TableCell className="text-sm">
                      <div className="flex items-start gap-2">
                        {expandable ? (
                          isOpen ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                                 : <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                        ) : <span className="w-3.5" />}
                        <span>{r.label}</span>
                        {expandable && (
                          <Badge variant="secondary" className="text-[10px] ml-1">
                            {side.details[r.key!].count}
                          </Badge>
                        )}
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
                  {expandable && isOpen && (
                    <TableRow>
                      <TableCell colSpan={2} className="p-2">
                        <DetailPanel side={side} bucketKey={r.key!} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
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
          <Bridge title="Receitas" side={data.receitas} color="success" />
          <Bridge title="Despesas" side={data.despesas} color="destructive" />
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