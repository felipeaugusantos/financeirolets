import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { parseIfoodSheet, type IfoodSheetOrder } from '@/lib/ifoodSheet';

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function IfoodSheetImport({ storeId, storeName, onDone }: { storeId: string; storeName: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [orders, setOrders] = useState<IfoodSheetOrder[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const read = async (f: File | undefined) => {
    if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    let res = { orders: [] as IfoodSheetOrder[], missing: ['cabeçalho com pedido e valor'] };
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      const r = parseIfoodSheet(rows);
      if (r.orders.length) { res = r; break; }
    }
    if (ref.current) ref.current.value = '';
    if (!res.orders.length) { toast({ title: 'Não encontrei os pedidos na planilha', description: 'Use o relatório financeiro do Portal do Parceiro, com colunas de pedido e valor.', variant: 'destructive' }); return; }
    setOrders(res.orders); setMissing(res.missing);
  };

  const save = async () => {
    if (!orders) return;
    setBusy(true);
    try {
      for (let i = 0; i < orders.length; i += 200) {
        const chunk = orders.slice(i, i + 200);
        const { data, error } = await supabase.from('ifood_orders').upsert(chunk.map((o) => ({
          store_id: storeId, ifood_order_id: o.orderId, status: o.status || 'CONCLUDED',
          ordered_at: o.orderedAt ? `${o.orderedAt}T12:00:00-03:00` : null,
          sub_total: o.gross, delivery_fee: o.deliveryFee, order_amount: o.gross,
          raw: { origem: 'planilha do portal' },
        })), { onConflict: 'store_id,ifood_order_id' }).select('id,ifood_order_id');
        if (error) throw error;
        const byId = new Map((data ?? []).map((d) => [d.ifood_order_id, d.id]));
        const { error: e2 } = await supabase.from('ifood_order_financials').upsert(chunk.filter((o) => byId.has(o.orderId)).map((o) => ({
          order_id: byId.get(o.orderId)!, gross_value: o.gross, commission: o.commission, payment_fee: o.paymentFee,
          delivery_cost: 0, merchant_promo: o.merchantPromo, ifood_promo: o.ifoodPromo, net_value: o.net,
          expected_payout_date: o.payoutDate, raw: { origem: 'planilha do portal' },
        })), { onConflict: 'order_id' });
        if (e2) throw e2;
      }
      toast({ title: `${orders.length} pedido(s) importado(s) em ${storeName}`, description: 'Pedidos repetidos foram atualizados, não duplicados.' });
      setOrders(null); onDone();
    } catch (e) {
      toast({ title: 'Erro ao importar', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const sum = (k: keyof IfoodSheetOrder) => (orders ?? []).reduce((s, o) => s + (Number(o[k]) || 0), 0);

  return (
    <>
      <Button variant="outline" onClick={() => ref.current?.click()}><FileUp className="mr-2 h-4 w-4" />Importar planilha do portal</Button>
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
      <Dialog open={!!orders} onOpenChange={(o) => !o && setOrders(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar pedidos em {storeName}</DialogTitle></DialogHeader>
          <div className="space-y-1 text-sm">
            <p><b>{orders?.length}</b> pedidos encontrados</p>
            <p>Bruto: {money(sum('gross'))}</p>
            <p>Comissão + taxas: {money(sum('commission') + sum('paymentFee'))}</p>
            <p>Promoções da loja: {money(sum('merchantPromo'))}</p>
            <p>Líquido: {money(sum('net'))}</p>
            {missing.length > 0 && <p className="text-xs text-destructive">Coluna não encontrada: {missing.join(', ')}. O líquido será calculado.</p>}
            <p className="pt-2 text-xs text-muted-foreground">Só alimenta os indicadores e o painel de repasses. Nada vai para o financeiro até alguém clicar em Lançar.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOrders(null)}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy ? 'Importando...' : 'Importar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
