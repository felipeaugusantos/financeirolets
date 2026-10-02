import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildAllocationMap, isPaidStatus, NO_UNIT_KEY, splitByUnit, type AllocationRow } from '@/lib/finance';
import { cn } from '@/lib/utils';

type Mode = 'ambos' | 'realizado' | 'previsto';
interface Tx {
  id: string; type: string; status: string; net_amount: number; unit_id: string | null;
  category_id: string | null; payment_date: string | null; due_date: string | null;
}
/** Uma parcela já distribuída por unidade. */
interface Part {
  unit: string; type: 'receita' | 'despesa'; category: string; month: string; realized: boolean; value: number;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const monthStart = (m: string) => `${m}-01`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(mo) - 1]}/${y.slice(2)}`;
};
const nowMonth = () => new Date().toISOString().slice(0, 7);

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function CashFlowByUnit({ onBack }: { onBack: () => void }) {
  const [fromM, setFromM] = useState(`${new Date().getFullYear()}-01`);
  const [toM, setToM] = useState(nowMonth());
  const [mode, setMode] = useState<Mode>('ambos');
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [cats, setCats] = useState<Map<string, string>>(new Map());
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [unitSel, setUnitSel] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [u, c] = await Promise.all([
        supabase.from('units').select('id, name').eq('active', true).order('name'),
        supabase.from('categories').select('id, name'),
      ]);
      setUnits((u.data ?? []));
      setCats(new Map((c.data ?? []).map((x) => [x.id, x.name])));
      if (u.data?.[0]) setUnitSel(u.data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!fromM || !toM || fromM > toM) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = monthStart(fromM), end = monthEnd(toM);
      const cols = 'id, type, status, net_amount, unit_id, category_id, payment_date, due_date';
      const [realized, projected] = await Promise.all([
        fetchAll<Tx>((a, b) => supabase.from('transactions').select(cols)
          .in('status', ['pago', 'recebido']).eq('affects_cashflow', true)
          .gte('payment_date', start).lte('payment_date', end).order('id').range(a, b)),
        fetchAll<Tx>((a, b) => supabase.from('transactions').select(cols)
          .in('status', ['pendente', 'agendado']).eq('affects_cashflow', true)
          .gte('due_date', start).lte('due_date', end).order('id').range(a, b)),
      ]);
      const txs = [...realized, ...projected];
      const ids = txs.map(t => t.id);
      const allocs: AllocationRow[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('transaction_allocations')
          .select('transaction_id, unit_id, front_id, allocation_type, percentage, amount')
          .in('transaction_id', ids.slice(i, i + 200));
        allocs.push(...((data ?? [])));
      }
      const map = buildAllocationMap(allocs);
      const out: Part[] = [];
      for (const t of txs) {
        const realizedTx = isPaidStatus(t.status);
        const date = (realizedTx ? t.payment_date : t.due_date) as string;
        for (const s of splitByUnit(t, map)) {
          out.push({
            unit: s.unitKey, type: t.type === 'receita' ? 'receita' : 'despesa',
            category: t.category_id ?? '__sem__', month: date.slice(0, 7), realized: realizedTx, value: s.value,
          });
        }
      }
      if (!cancelled) { setParts(out); setLoading(false); }
    })().catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [fromM, toM]);

  const visible = useMemo(
    () => parts.filter(p => mode === 'ambos' || (mode === 'realizado') === p.realized),
    [parts, mode]
  );
  const catName = (id: string) => (id === '__sem__' ? 'Sem categoria' : cats.get(id) ?? '—');

  // ----- Visão lado a lado -----
  const columns = useMemo(() => {
    const hasNone = visible.some(p => p.unit === NO_UNIT_KEY);
    return [...units.map(u => ({ key: u.id, name: u.name })), ...(hasNone ? [{ key: NO_UNIT_KEY, name: 'Sem unidade' }] : [])];
  }, [units, visible]);

  const grid = useMemo(() => {
    const g = { receita: new Map<string, Map<string, number>>(), despesa: new Map<string, Map<string, number>>() };
    for (const p of visible) {
      const byCat = g[p.type];
      const row = byCat.get(p.category) ?? new Map<string, number>();
      row.set(p.unit, (row.get(p.unit) ?? 0) + p.value);
      byCat.set(p.category, row);
    }
    return g;
  }, [visible]);

  const sumType = (type: 'receita' | 'despesa', unit?: string) => {
    let s = 0;
    grid[type].forEach(row => row.forEach((v, k) => { if (!unit || k === unit) s += v; }));
    return s;
  };

  const renderSection = (type: 'receita' | 'despesa', label: string) => {
    const rows = [...grid[type].entries()]
      .map(([cat, row]) => ({ cat, row, total: [...row.values()].reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    const isOpen = open[type] ?? false;
    return (
      <Fragment key={type}>
        <tr className="bg-muted/50 font-semibold cursor-pointer" onClick={() => setOpen(o => ({ ...o, [type]: !isOpen }))}>
          <td className="p-2 sticky left-0 bg-muted">
            <span className="inline-flex items-center gap-1">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {label}
            </span>
          </td>
          {columns.map(c => <td key={c.key} className="p-2 text-right">{brl(sumType(type, c.key))}</td>)}
          <td className="p-2 text-right">{brl(sumType(type))}</td>
        </tr>
        {isOpen && rows.map(r => (
          <tr key={r.cat} className="border-b border-border/50">
            <td className="p-2 pl-8 sticky left-0 bg-card text-muted-foreground">{catName(r.cat)}</td>
            {columns.map(c => <td key={c.key} className="p-2 text-right">{r.row.get(c.key) ? brl(r.row.get(c.key)!) : '—'}</td>)}
            <td className="p-2 text-right font-medium">{brl(r.total)}</td>
          </tr>
        ))}
      </Fragment>
    );
  };

  // ----- Visão mês a mês -----
  const months = useMemo(() => {
    const list: string[] = [];
    if (!fromM || !toM || fromM > toM) return list;
    let [y, m] = fromM.split('-').map(Number);
    const [ty, tm] = toM.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) { list.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
    return list;
  }, [fromM, toM]);

  const monthly = useMemo(() => {
    const rows = months.map(m => ({ m, recR: 0, recP: 0, desR: 0, desP: 0 }));
    const idx = new Map(rows.map((r, i) => [r.m, i]));
    for (const p of parts) {
      if (p.unit !== unitSel) continue;
      const r = rows[idx.get(p.month) ?? -1];
      if (!r) continue;
      if (p.type === 'receita') {
        if (p.realized) r.recR += p.value; else r.recP += p.value;
      } else if (p.realized) r.desR += p.value;
      else r.desP += p.value;
    }
    let acc = 0;
    return rows.map(r => {
      const rec = (mode !== 'previsto' ? r.recR : 0) + (mode !== 'realizado' ? r.recP : 0);
      const des = (mode !== 'previsto' ? r.desR : 0) + (mode !== 'realizado' ? r.desP : 0);
      acc += rec - des;
      return { ...r, saldo: rec - des, acumulado: acc };
    });
  }, [parts, months, unitSel, mode]);

  const tone = (v: number) => (v < 0 ? 'text-destructive' : 'text-secondary');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Fluxo de Caixa por Unidade</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas por unidade, já com as divisões (rateios) aplicadas.</p>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>De</Label><Input type="month" value={fromM} onChange={e => setFromM(e.target.value)} /></div>
          <div className="space-y-1"><Label>Até</Label><Input type="month" value={toM} onChange={e => setToM(e.target.value)} /></div>
          <div className="space-y-1 min-w-48">
            <Label>Mostrar</Label>
            <Select value={mode} onValueChange={v => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">Realizado + previsto</SelectItem>
                <SelectItem value="realizado">Só realizado</SelectItem>
                <SelectItem value="previsto">Só previsto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />}
        </CardContent>
      </Card>

      <Tabs defaultValue="lado" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lado">Unidades lado a lado</TabsTrigger>
          <TabsTrigger value="mes">Mês a mês</TabsTrigger>
        </TabsList>

        <TabsContent value="lado">
          <Card className="rounded-2xl">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 text-left sticky left-0 bg-card min-w-48">Categoria</th>
                    {columns.map(c => <th key={c.key} className="p-2 text-right whitespace-nowrap">{c.name}</th>)}
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {renderSection('receita', 'Receitas')}
                  {renderSection('despesa', 'Despesas')}
                  <tr className="border-t-2 border-border font-bold">
                    <td className="p-2 sticky left-0 bg-card">Saldo</td>
                    {columns.map(c => {
                      const v = sumType('receita', c.key) - sumType('despesa', c.key);
                      return <td key={c.key} className={cn('p-2 text-right', tone(v))}>{brl(v)}</td>;
                    })}
                    {(() => { const v = sumType('receita') - sumType('despesa'); return <td className={cn('p-2 text-right', tone(v))}>{brl(v)}</td>; })()}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-2">Clique em Receitas ou Despesas para abrir as categorias.</p>
        </TabsContent>

        <TabsContent value="mes">
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base font-heading">Evolução mensal</CardTitle>
              <Select value={unitSel} onValueChange={setUnitSel}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  <SelectItem value={NO_UNIT_KEY}>Sem unidade</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right">
                    <th className="p-2 text-left">Mês</th>
                    {mode !== 'previsto' && <th className="p-2">Receitas realizadas</th>}
                    {mode !== 'realizado' && <th className="p-2">Receitas previstas</th>}
                    {mode !== 'previsto' && <th className="p-2">Despesas realizadas</th>}
                    {mode !== 'realizado' && <th className="p-2">Despesas previstas</th>}
                    <th className="p-2">Saldo do mês</th>
                    <th className="p-2">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map(r => (
                    <tr key={r.m} className="border-b border-border/50 text-right">
                      <td className="p-2 text-left font-medium">{monthLabel(r.m)}</td>
                      {mode !== 'previsto' && <td className="p-2">{brl(r.recR)}</td>}
                      {mode !== 'realizado' && <td className="p-2 text-muted-foreground">{brl(r.recP)}</td>}
                      {mode !== 'previsto' && <td className="p-2">{brl(r.desR)}</td>}
                      {mode !== 'realizado' && <td className="p-2 text-muted-foreground">{brl(r.desP)}</td>}
                      <td className={cn('p-2 font-medium', tone(r.saldo))}>{brl(r.saldo)}</td>
                      <td className={cn('p-2 font-semibold', tone(r.acumulado))}>{brl(r.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
