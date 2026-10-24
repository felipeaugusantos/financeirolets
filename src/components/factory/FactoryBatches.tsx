import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Play, Plus, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { batchRealCost, batchesSummary, recipeCost, type Ingredient, type Recipe } from '@/lib/factoryRules';
import type { Tables } from '@/integrations/supabase/types';

type Batch = Tables<'factory_batches'>;
const money = (v: number, d = 2) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dateLabel = (d: string) => d.split('-').reverse().join('/');
const statusInfo: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  planejada: { label: 'Planejada', variant: 'outline' }, produzindo: { label: 'Produzindo', variant: 'default' },
  concluida: { label: 'Concluída', variant: 'secondary' }, cancelada: { label: 'Cancelada', variant: 'destructive' },
};

interface Props {
  products: { id: string; name: string }[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  plannedToday: { date: string; items: { product_id: string; units: number }[] };
}

export function FactoryBatches({ products, recipes, ingredients, plannedToday }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const monthStart = new Date().toLocaleDateString('en-CA').slice(0, 8) + '01';
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'));
  const [status, setStatus] = useState('all');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [finishing, setFinishing] = useState<Batch | null>(null);
  const [form, setForm] = useState({ produced: '', lost: '0', notes: '' });
  const [adding, setAdding] = useState(false);
  const [newBatch, setNewBatch] = useState({ product_id: '', date: new Date().toLocaleDateString('en-CA'), units: '' });

  const perUnit = useCallback((productId: string) => { const r = recipes.find(x => x.product_id === productId); return r ? recipeCost(r, ingredients).perUnit : 0; }, [recipes, ingredients]);
  const productName = (id: string) => products.find(p => p.id === id)?.name ?? '—';
  const fail = (e: { message: string } | null) => { if (e) toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }); return !e; };

  const load = useCallback(async () => {
    const { data } = await supabase.from('factory_batches').select('*').gte('production_date', from).lte('production_date', to).order('production_date', { ascending: false }).order('created_at', { ascending: false });
    setBatches(data ?? []);
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const visible = batches.filter(b => status === 'all' || b.status === status);
  const summary = useMemo(() => batchesSummary(visible), [visible]);

  const insert = async (rows: { product_id: string; production_date: string; planned_units: number }[]) => {
    const payload = rows.filter(r => r.planned_units > 0).map(r => ({ ...r, estimated_cost: Math.round(perUnit(r.product_id) * r.planned_units * 100) / 100, created_by: user?.id ?? null }));
    if (!payload.length) { toast({ title: 'Nada a registrar', variant: 'destructive' }); return false; }
    const ok = fail((await supabase.from('factory_batches').insert(payload)).error);
    if (ok) { toast({ title: `${payload.length} fornada(s) registrada(s)` }); void load(); }
    return ok;
  };
  const fromPlan = () => insert(plannedToday.items.map(i => ({ product_id: i.product_id, production_date: plannedToday.date, planned_units: i.units })));
  const addManual = async () => { if (await insert([{ product_id: newBatch.product_id, production_date: newBatch.date, planned_units: Number(newBatch.units) }])) { setAdding(false); setNewBatch({ ...newBatch, product_id: '', units: '' }); } };
  const setStatusOf = async (b: Batch, s: string) => { if (fail((await supabase.from('factory_batches').update({ status: s }).eq('id', b.id)).error)) void load(); };
  const finish = async () => {
    if (!finishing) return;
    const produced = Number(form.produced), lost = Number(form.lost || 0);
    if (!(produced >= 0) || !(lost >= 0) || produced + lost <= 0) { toast({ title: 'Informe quantos cookies saíram', variant: 'destructive' }); return; }
    const cost = batchRealCost(perUnit(finishing.product_id), produced, lost);
    if (fail((await supabase.from('factory_batches').update({ status: 'concluida', produced_units: produced, lost_units: lost, real_cost: cost.total, notes: form.notes || finishing.notes, finished_at: new Date().toISOString() }).eq('id', finishing.id)).error)) {
      toast({ title: 'Fornada concluída', description: `Custo real ${money(cost.total)} · ${money(cost.perGoodUnit, 4)} por cookie` }); setFinishing(null); void load();
    }
  };

  const preview = finishing ? batchRealCost(perUnit(finishing.product_id), Number(form.produced || 0), Number(form.lost || 0)) : null;
  const plannedCount = plannedToday.items.filter(i => i.units > 0).length;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-2">
      <div><Label>De</Label><Input type="date" className="w-40" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div><Label>Até</Label><Input type="date" className="w-40" value={to} onChange={e => setTo(e.target.value)} /></div>
      <div><Label>Situação</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem>{Object.entries(statusInfo).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="ml-auto flex flex-wrap gap-2">
        {plannedCount > 0 && <Button variant="outline" onClick={() => void fromPlan()}>Registrar plano de {dateLabel(plannedToday.date)} ({plannedCount})</Button>}
        <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Nova fornada</Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Fornadas concluídas</p><p className="text-lg font-bold">{summary.done}</p><p className="text-xs text-muted-foreground">{summary.open} em aberto</p></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Cookies produzidos</p><p className="text-lg font-bold">{num(summary.produced)}</p></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Perdas</p><p className={`text-lg font-bold ${summary.lossPct > 5 ? 'text-destructive' : ''}`}>{num(summary.lost)} <span className="text-sm font-normal">({num(summary.lossPct)}%)</span></p></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Custo real</p><p className="text-lg font-bold">{money(summary.cost)}</p></CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Custo por cookie bom</p><p className="text-lg font-bold text-primary">{money(summary.perUnit, 4)}</p></CardContent></Card>
    </div>

    <div className="overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Planejado</TableHead><TableHead className="text-right">Produzido</TableHead><TableHead className="text-right">Perdas</TableHead><TableHead className="text-right">Custo previsto</TableHead><TableHead className="text-right">Custo real</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>
        {visible.map(b => { const diff = Number(b.real_cost) - Number(b.estimated_cost); return <TableRow key={b.id}>
          <TableCell>{dateLabel(b.production_date)}</TableCell>
          <TableCell>{productName(b.product_id)}{!recipes.some(r => r.product_id === b.product_id) && <Badge variant="destructive" className="ml-1">sem ficha</Badge>}</TableCell>
          <TableCell className="text-right">{num(Number(b.planned_units))}</TableCell>
          <TableCell className="text-right">{b.status === 'concluida' ? num(Number(b.produced_units)) : '—'}</TableCell>
          <TableCell className="text-right">{b.status === 'concluida' ? num(Number(b.lost_units)) : '—'}</TableCell>
          <TableCell className="text-right">{money(Number(b.estimated_cost))}</TableCell>
          <TableCell className="text-right">{b.status === 'concluida' ? <span>{money(Number(b.real_cost))}{Math.abs(diff) >= 0.01 && <span className={`block text-xs ${diff > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{diff > 0 ? '+' : ''}{money(diff)}</span>}</span> : '—'}</TableCell>
          <TableCell><Badge variant={statusInfo[b.status]?.variant ?? 'outline'}>{statusInfo[b.status]?.label ?? b.status}</Badge></TableCell>
          <TableCell><div className="flex justify-end gap-1">
            {b.status === 'planejada' && <Button size="sm" variant="secondary" onClick={() => void setStatusOf(b, 'produzindo')}><Play className="mr-1 h-3 w-3" />Iniciar</Button>}
            {(b.status === 'planejada' || b.status === 'produzindo') && <>
              <Button size="sm" onClick={() => { setFinishing(b); setForm({ produced: String(b.planned_units), lost: '0', notes: '' }); }}><CheckCircle2 className="mr-1 h-3 w-3" />Concluir</Button>
              <Button size="icon" variant="ghost" aria-label="Cancelar fornada" onClick={() => window.confirm('Cancelar esta fornada?') && void setStatusOf(b, 'cancelada')}><XCircle className="h-4 w-4" /></Button>
            </>}
          </div></TableCell>
        </TableRow>; })}
        {!visible.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhuma fornada no período.</TableCell></TableRow>}
      </TableBody>
    </Table></div>
    <p className="text-xs text-muted-foreground">Custo real = ingredientes usados (cookies bons + perdidos) ao custo atual das fichas técnicas, gravado no momento em que a fornada é concluída. Nada é lançado no financeiro.</p>

    <Dialog open={!!finishing} onOpenChange={o => !o && setFinishing(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Concluir fornada — {finishing && productName(finishing.product_id)}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Cookies bons</Label><Input type="number" min={0} value={form.produced} onChange={e => setForm({ ...form, produced: e.target.value })} /></div>
          <div><Label>Perdidos / descartados</Label><Input type="number" min={0} value={form.lost} onChange={e => setForm({ ...form, lost: e.target.value })} /></div>
          <div className="col-span-2"><Label>Observações</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        {preview && <p className="text-sm">Custo real: <strong>{money(preview.total)}</strong> · {money(preview.perGoodUnit, 4)} por cookie bom</p>}
        <DialogFooter><Button variant="outline" onClick={() => setFinishing(null)}>Voltar</Button><Button onClick={() => void finish()}>Concluir</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={adding} onOpenChange={setAdding}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova fornada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Produto</Label><Select value={newBatch.product_id} onValueChange={product_id => setNewBatch({ ...newBatch, product_id })}><SelectTrigger><SelectValue placeholder="Escolha o produto" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={newBatch.date} onChange={e => setNewBatch({ ...newBatch, date: e.target.value })} /></div>
            <div><Label>Cookies planejados</Label><Input type="number" min={1} value={newBatch.units} onChange={e => setNewBatch({ ...newBatch, units: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setAdding(false)}>Voltar</Button><Button disabled={!newBatch.product_id || !(Number(newBatch.units) > 0)} onClick={() => void addManual()}>Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
