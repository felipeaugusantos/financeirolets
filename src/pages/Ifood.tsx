import { useEffect, useMemo, useState } from 'react';
import { Bike } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { weekPostingLines, profitIndicators, weeklyStatement, cancelRate, type BankLine, type IfoodOrderRow, type PayoutStatus } from '@/lib/ifoodProfit';

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const payoutLabel: Record<PayoutStatus, { text: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  conferido: { text: 'Conferido', variant: 'default' }, divergente: { text: 'Divergente', variant: 'destructive' },
  sem_credito: { text: 'Sem crédito', variant: 'destructive' }, a_receber: { text: 'A receber', variant: 'outline' },
};

export default function Ifood() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [month, setMonth] = useState(today.slice(0, 7));
  const [storeId, setStoreId] = useState('all');
  const [stores, setStores] = useState<{ id: string; name: string; unit_id: string | null }[]>([]);
  const [orders, setOrders] = useState<IfoodOrderRow[]>([]);
  const [bank, setBank] = useState<BankLine[]>([]);
  const [costs, setCosts] = useState({ rider: 0, product: 0 });
  const { user } = useAuth();
  const { roles } = useCurrentUserRoles();
  const { toast } = useToast();
  const canPost = roles.some(r => r === 'admin' || r === 'financeiro');
  const [postings, setPostings] = useState<{ store_id: string; week_start: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; type: string }[]>([]);
  const [posting, setPosting] = useState<ReturnType<typeof weeklyStatement>[number] | null>(null);
  const [cat, setCat] = useState({ revenue: '', fees: '', promo: '' });
  const [busy, setBusy] = useState(false);
  const loadPostings = () => supabase.from('ifood_payout_postings').select('store_id,week_start').then(({ data }) => setPostings(data ?? []));
  useEffect(() => { void loadPostings(); supabase.from('categories').select('id,name,type').eq('active', true).order('name').then(({ data }) => setCategories(data ?? [])); }, []);
  const store = stores.find(s => s.id === storeId);
  const isPosted = (week: string) => postings.some(p => p.store_id === storeId && p.week_start === week);

  const post = async () => {
    if (!posting || !store || !user) return;
    const lines = weekPostingLines(posting);
    if (!cat.revenue || lines.expenses.some(e => !cat[e.kind])) { toast({ title: 'Escolha as categorias', variant: 'destructive' }); return; }
    setBusy(true);
    const due = posting.payoutDate ?? posting.end;
    const desc = `iFood ${store.name} — vendas ${dateLabel(posting.start)} a ${dateLabel(posting.end)}`;
    const base = { competence_date: posting.end, due_date: due, status: 'pendente' as const, unit_id: store.unit_id, created_by: user.id, tax_amount: 0, payment_method: 'transferencia' as const };
    const { data: rec, error } = await supabase.from('transactions').insert({ ...base, type: 'receita', description: desc, amount: lines.revenue, net_amount: lines.revenue, category_id: cat.revenue, notes: `Repasse previsto ${money(lines.net)} (líquido). Gerado pela tela iFood.` }).select('id').single();
    if (error || !rec) { setBusy(false); toast({ title: 'Não foi possível lançar', description: error?.message, variant: 'destructive' }); return; }
    const exp = lines.expenses.length ? await supabase.from('transactions').insert(lines.expenses.map(e => ({ ...base, type: 'despesa' as const, description: `${e.label} — ${dateLabel(posting.start)} a ${dateLabel(posting.end)} (${store.name})`, amount: e.amount, net_amount: e.amount, category_id: cat[e.kind], notes: 'Descontado do repasse iFood. Baixa junto com o repasse na conciliação.' }))).select('id') : { data: [], error: null };
    const link = await supabase.from('ifood_payout_postings').insert({ store_id: store.id, week_start: posting.start, receivable_id: rec.id, expense_ids: (exp.data ?? []).map(x => x.id), gross: lines.revenue, net: lines.net, created_by: user.id });
    setBusy(false);
    if (exp.error || link.error) { toast({ title: 'Lançamento incompleto', description: (exp.error ?? link.error)?.message, variant: 'destructive' }); return; }
    toast({ title: 'Repasse lançado no Contas a Receber', description: `Recebimento previsto ${money(lines.net)} em ${dateLabel(due)}` });
    setPosting(null); void loadPostings();
  };

  useEffect(() => { supabase.from('ifood_stores').select('id,name,unit_id').eq('active', true).then(({ data }) => setStores(data ?? [])); }, []);

  useEffect(() => {
    const start = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    (async () => {
      let q = supabase.from('ifood_orders').select('id,store_id,ordered_at,status,delivery_fee,ifood_order_financials(*)')
        .gte('ordered_at', `${start}T03:00:00Z`).lt('ordered_at', `${end}T23:59:59-03:00`);
      if (storeId !== 'all') q = q.eq('store_id', storeId);
      const { data } = await q;
      setOrders((data ?? []).map((o: any) => ({ ...o, financial: Array.isArray(o.ifood_order_financials) ? o.ifood_order_financials[0] ?? null : o.ifood_order_financials })));
      const { data: b } = await supabase.from('bank_statement_entries').select('id,posted_at,amount,memo').ilike('memo', '%ifood%').gte('posted_at', start).lte('posted_at', new Date(Date.UTC(y, m, 10)).toISOString().slice(0, 10));
      setBank(b ?? []);
      const units = (storeId === 'all' ? stores : stores.filter(s => s.id === storeId)).map(s => s.unit_id).filter(Boolean) as string[];
      if (!units.length) { setCosts({ rider: 0, product: 0 }); return; }
      const { data: tx } = await supabase.from('transactions').select('amount,type,categories(name)').in('unit_id', units).eq('type', 'despesa').gte('competence_date', start).lte('competence_date', end);
      const sum = (re: RegExp) => (tx ?? []).filter((t: any) => re.test(t.categories?.name ?? '')).reduce((s, t: any) => s + Number(t.amount), 0);
      setCosts({ rider: sum(/motob|motoq|entrega/i), product: sum(/mat[eé]ria|embalag/i) });
    })();
  }, [month, storeId, stores]);

  const ind = useMemo(() => profitIndicators(orders, costs), [orders, costs]);
  const weeks = useMemo(() => weeklyStatement(orders, bank, today), [orders, bank, today]);
  const cards = [
    { t: 'Faturamento', v: money(ind.gross) },
    { t: 'Descontos', v: money(ind.discountStore + ind.discountIfood), s: `Loja ${money(ind.discountStore)} · iFood ${money(ind.discountIfood)}` },
    { t: 'Custo motoqueiro', v: money(ind.rider), s: `Após taxas do cliente: ${money(ind.riderAfterFees)}` },
    { t: 'Custo produto', v: money(ind.product), s: 'Matéria-prima e embalagens' },
    { t: 'Líquido recebido', v: money(ind.net), s: `Sobra ${money(ind.left)} (${ind.margin}%)` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><Bike className="h-6 w-6" /> iFood</h1>
        <p className="text-sm text-muted-foreground">Os números são só conferência. O financeiro só recebe um repasse semanal quando Admin ou Financeiro clica em Lançar.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as lojas</SelectItem>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {ind.missingFinancial > 0 && <p className="text-sm text-muted-foreground">{ind.missingFinancial} pedido(s) ainda sem valores financeiros do iFood.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(c => <Card key={c.t} className="rounded-2xl"><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{c.t}</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{c.v}</p>{c.s && <p className="text-xs text-muted-foreground">{c.s}</p>}</CardContent></Card>)}
      </div>
      <p className="text-xs text-muted-foreground">Cancelamentos no mês: {cancelRate(orders)}% · Custos de motoqueiro e produto vêm do financeiro da unidade e incluem vendas de balcão.</p>
      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">Repasses semanais</h2>
        {weeks.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma semana com valores do iFood neste mês.</p> : <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Semana de vendas</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Comissão</TableHead><TableHead className="text-right">Taxa pagamento</TableHead><TableHead className="text-right">Promoções loja</TableHead><TableHead className="text-right">Líquido previsto</TableHead><TableHead>Repasse x extrato</TableHead><TableHead>Financeiro</TableHead></TableRow></TableHeader>
          <TableBody>{weeks.map(w => <TableRow key={w.start}>
            <TableCell>{dateLabel(w.start)} a {dateLabel(w.end)}</TableCell><TableCell className="text-right">{w.orders}</TableCell>
            <TableCell className="text-right">{money(w.gross)}</TableCell><TableCell className="text-right">{money(w.commission)}</TableCell><TableCell className="text-right">{money(w.paymentFee)}</TableCell><TableCell className="text-right">{money(w.promo)}</TableCell>
            <TableCell className="text-right font-medium">{money(w.net)}</TableCell>
            <TableCell><span className="block text-xs text-muted-foreground">{w.payoutDate ? `repasse ${dateLabel(w.payoutDate)}` : 'sem data'}{w.received ? ` · banco ${money(w.received)}` : ''}</span><Badge variant={payoutLabel[w.status].variant}>{payoutLabel[w.status].text}</Badge></TableCell>
            <TableCell>{storeId === 'all' ? <span className="text-xs text-muted-foreground">escolha a loja</span> : isPosted(w.start) ? <Badge variant="secondary">Lançado</Badge> : canPost ? <Button size="sm" variant="outline" onClick={() => setPosting(w)}>Lançar</Button> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
          </TableRow>)}</TableBody></Table></div>}
      </section>
      <Dialog open={!!posting} onOpenChange={o => !o && setPosting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lançar repasse no financeiro</DialogTitle></DialogHeader>
          {posting && (() => { const l = weekPostingLines(posting); const pick = (k: 'revenue' | 'fees' | 'promo', type: string, label: string, v: number) => <div><Label>{label} · {money(v)}</Label>
            <Select value={cat[k]} onValueChange={x => setCat({ ...cat, [k]: x })}><SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent>{categories.filter(c => c.type === type).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>;
            return <div className="space-y-3 text-sm">
              <p>{store?.name} · vendas de {dateLabel(posting.start)} a {dateLabel(posting.end)}. Cria uma <strong>conta a receber</strong> pelo bruto e as despesas do iFood, todas pendentes. Quando o crédito de <strong>{money(l.net)}</strong> entrar no extrato, vincule-o à conta a receber: ela e as despesas recebem baixa juntas.</p>
              {pick('revenue', 'receita', 'Receita bruta', l.revenue)}
              {l.expenses.map(e => <div key={e.kind}>{pick(e.kind, 'despesa', e.label, e.amount)}</div>)}
            </div>; })()}
          <DialogFooter><Button variant="outline" onClick={() => setPosting(null)}>Voltar</Button><Button disabled={busy} onClick={() => void post()}>Lançar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
