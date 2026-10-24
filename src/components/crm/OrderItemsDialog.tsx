import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { orderLinesTotals, productPackageCost, type Ingredient, type Recipe } from '@/lib/factoryRules';

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type Product = { id: string; name: string; price: number; cookies_per_package: number; package: string };
type Line = { key: string; product_id: string; packages: number; cookies_per_package: number; unit_price: number; unit_cost: number };

interface Props { orderId: string; locked: boolean; onClose: () => void; onSaved: () => void }

export function OrderItemsDialog({ orderId, locked, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => {
    const [p, r, i, it] = await Promise.all([
      supabase.from('crm_products').select('id,name,price,cookies_per_package,package').eq('active', true).order('name'),
      supabase.from('factory_recipes').select('product_id,yield_units,factory_recipe_items(ingredient_id,quantity)'),
      supabase.from('factory_ingredients').select('id,name,unit,package_size,package_cost'),
      supabase.from('crm_order_items').select('*').eq('order_id', orderId).order('created_at'),
    ]);
    setProducts(p.data ?? []);
    setRecipes((r.data ?? []).map((x: any) => ({ product_id: x.product_id, yield_units: x.yield_units, items: x.factory_recipe_items })));
    setIngredients(i.data ?? []);
    setLines((it.data ?? []).map(l => ({ key: l.id, product_id: l.product_id, packages: l.packages, cookies_per_package: l.cookies_per_package, unit_price: l.unit_price, unit_cost: l.unit_cost })));
  })(); }, [orderId]);

  const totals = useMemo(() => orderLinesTotals(lines), [lines]);
  const name = (id: string) => products.find(p => p.id === id)?.name ?? 'Produto arquivado';
  const missingCost = lines.filter(l => !l.unit_cost).length;

  const addProduct = (id: string) => {
    const p = products.find(x => x.id === id); if (!p) return;
    setLines(ls => [...ls, { key: crypto.randomUUID(), product_id: p.id, packages: 1, cookies_per_package: p.cookies_per_package, unit_price: Number(p.price), unit_cost: productPackageCost(p, recipes, ingredients) ?? 0 }]);
  };
  const patch = (key: string, v: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...v } : l)));

  const save = async () => {
    if (lines.some(l => !(l.packages > 0) || !(l.unit_price >= 0))) { toast({ title: 'Confira quantidades e preços', variant: 'destructive' }); return; }
    setBusy(true);
    const del = await supabase.from('crm_order_items').delete().eq('order_id', orderId);
    const ins = lines.length ? await supabase.from('crm_order_items').insert(lines.map(({ key: _k, ...l }) => ({ ...l, order_id: orderId }))) : { error: null };
    const upd = await supabase.from('crm_orders').update({ quantity_boxes: Math.round(totals.boxes), quantity_cookies: Math.round(totals.cookies), total_amount: totals.total, total_cost: totals.cost }).eq('id', orderId);
    setBusy(false);
    const err = del.error ?? ins.error ?? upd.error;
    if (err) { toast({ title: 'Não foi possível salvar os produtos', description: err.message, variant: 'destructive' }); return; }
    toast({ title: 'Produtos do pedido salvos', description: `${totals.boxes} embalagens · ${money(totals.total)}` });
    onSaved(); onClose();
  };

  return <Dialog open onOpenChange={o => !o && onClose()}>
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Produtos do pedido</DialogTitle></DialogHeader>
      {locked && <p className="text-sm text-muted-foreground">Pedido faturado: os produtos ficam só para consulta.</p>}
      <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Embalagens</TableHead><TableHead className="text-right">Preço un.</TableHead><TableHead className="text-right">Custo fábrica un.</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{lines.map(l => <TableRow key={l.key}>
          <TableCell>{name(l.product_id)}<span className="block text-xs text-muted-foreground">{l.cookies_per_package} cookies por embalagem</span></TableCell>
          <TableCell className="text-right"><Input disabled={locked} type="number" min={1} className="ml-auto w-20 text-right" value={l.packages} onChange={e => patch(l.key, { packages: Number(e.target.value) })} /></TableCell>
          <TableCell className="text-right"><Input disabled={locked} type="number" min={0} step="0.01" className="ml-auto w-24 text-right" value={l.unit_price} onChange={e => patch(l.key, { unit_price: Number(e.target.value) })} /></TableCell>
          <TableCell className="text-right">{l.unit_cost ? money(l.unit_cost) : <span className="text-xs text-destructive">sem ficha</span>}</TableCell>
          <TableCell className="text-right font-medium">{money(l.packages * l.unit_price)}</TableCell>
          <TableCell>{!locked && <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
        </TableRow>)}</TableBody></Table>
      {!locked && <Select value="" onValueChange={addProduct}><SelectTrigger className="w-72"><SelectValue placeholder="+ Adicionar produto" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {money(Number(p.price))}</SelectItem>)}</SelectContent></Select>}
      {!products.length && <p className="text-sm text-muted-foreground">Cadastre os produtos em CRM › Produtos.</p>}
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <div><p className="text-muted-foreground">Embalagens</p><p className="font-semibold">{totals.boxes}</p></div>
        <div><p className="text-muted-foreground">Cookies</p><p className="font-semibold">{totals.cookies}</p></div>
        <div><p className="text-muted-foreground">Total</p><p className="font-semibold">{money(totals.total)}</p></div>
        <div><p className="text-muted-foreground">Custo fábrica</p><p className="font-semibold">{money(totals.cost)}</p></div>
        <div><p className="text-muted-foreground">Margem</p><p className="font-semibold text-primary">{money(totals.margin)} ({totals.marginPct}%)</p></div>
      </div>
      {missingCost > 0 && <p className="text-xs text-muted-foreground">{missingCost} produto(s) sem ficha técnica: o custo entra como zero.</p>}
      <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button>{!locked && <Button disabled={busy} onClick={() => void save()}>Salvar produtos</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
