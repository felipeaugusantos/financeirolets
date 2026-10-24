import { useEffect, useMemo, useState } from 'react';
import { Bike } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { profitIndicators, weeklyStatement, cancelRate, type BankLine, type IfoodOrderRow, type PayoutStatus } from '@/lib/ifoodProfit';

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
        <p className="text-sm text-muted-foreground">Modo sombra: só leitura. Nada aqui lança no financeiro, DRE ou conciliação.</p>
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
          <TableHeader><TableRow><TableHead>Semana de vendas</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Comissão</TableHead><TableHead className="text-right">Taxa pagamento</TableHead><TableHead className="text-right">Promoções loja</TableHead><TableHead className="text-right">Líquido previsto</TableHead><TableHead>Repasse x extrato</TableHead></TableRow></TableHeader>
          <TableBody>{weeks.map(w => <TableRow key={w.start}>
            <TableCell>{dateLabel(w.start)} a {dateLabel(w.end)}</TableCell><TableCell className="text-right">{w.orders}</TableCell>
            <TableCell className="text-right">{money(w.gross)}</TableCell><TableCell className="text-right">{money(w.commission)}</TableCell><TableCell className="text-right">{money(w.paymentFee)}</TableCell><TableCell className="text-right">{money(w.promo)}</TableCell>
            <TableCell className="text-right font-medium">{money(w.net)}</TableCell>
            <TableCell><span className="block text-xs text-muted-foreground">{w.payoutDate ? `repasse ${dateLabel(w.payoutDate)}` : 'sem data'}{w.received ? ` · banco ${money(w.received)}` : ''}</span><Badge variant={payoutLabel[w.status].variant}>{payoutLabel[w.status].text}</Badge></TableCell>
          </TableRow>)}</TableBody></Table></div>}
      </section>
    </div>
  );
}
