import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import type { Tables } from '@/integrations/supabase/types';
import { CrmOrders } from '@/components/crm/CrmOrders';
import { CrmProducts } from '@/components/crm/CrmProducts';
import { FactoryBatches } from '@/components/factory/FactoryBatches';
import { ChefHat, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ordersDemand, purchaseToIngredient, ingredientCostPerUnit, productionPlan, recipeCost, type Ingredient, type Recipe } from '@/lib/factoryRules';

const money = (v: number, d = 2) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
type Row = { id: string; name: string };
type ProductRow = Row & { cookies_per_package: number; price: number };
type RecipeRow = { id: string; product_id: string; yield_units: number; factory_recipe_items: { id: string; ingredient_id: string; quantity: number }[] };

export default function Factory() {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname.split('/')[2] || 'producao';
  const companies = useSupabaseCrud<Tables<'crm_companies'>>('crm_companies');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [units, setUnits] = useState<Row[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); });
  const [forecasts, setForecasts] = useState<{ id: string; unit_id: string; product_id: string; quantity: number }[]>([]);
  const [newIng, setNewIng] = useState({ name: '', unit: 'g', package_size: '1000', package_cost: '' });
  const [productId, setProductId] = useState('');
  type Payable = { id: string; description: string; amount: number; competence_date: string; status: string; categories: { name: string } | null; partners: { name: string } | null };
  const [payables, setPayables] = useState<Payable[]>([]);
  const [buyFor, setBuyFor] = useState<Ingredient | null>(null);
  const [buy, setBuy] = useState({ tx: '', qty: '' });
  const [linked, setLinked] = useState<Record<string, { tx: string | null; date: string | null }>>({});
  useEffect(() => {
    const since = new Date(); since.setMonth(since.getMonth() - 3);
    supabase.from('transactions').select('id,description,amount,competence_date,status,categories(name),partners(name)').eq('type', 'despesa').neq('status', 'cancelado')
      .gte('competence_date', since.toLocaleDateString('en-CA')).order('competence_date', { ascending: false }).limit(1000)
      .then(({ data }) => setPayables(((data ?? []) as unknown as Payable[]).filter(t => /mat[eé]ria|embalag|insumo|ingred/i.test(t.categories?.name ?? ''))));
  }, []);
  const monthStart = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const realMonth = payables.filter(p => p.competence_date.startsWith(monthStart)).reduce((s, p) => s + Number(p.amount), 0);
  const registerPurchase = async () => {
    const tx = payables.find(p => p.id === buy.tx); const calc = tx && purchaseToIngredient(Number(tx.amount), Number(buy.qty));
    if (!buyFor || !tx || !calc) { toast({ title: 'Escolha a conta e a quantidade comprada', variant: 'destructive' }); return; }
    const { error } = await supabase.from('factory_ingredients').update({ package_size: calc.package_size, package_cost: calc.package_cost, last_purchase_tx_id: tx.id, last_purchase_date: tx.competence_date }).eq('id', buyFor.id);
    if (fail(error)) { toast({ title: 'Custo atualizado pela compra', description: `${money(calc.costPerUnit, 4)} por ${buyFor.unit}` }); setBuyFor(null); setBuy({ tx: '', qty: '' }); void load(); }
  };

  const fail = (e: { message: string } | null) => { if (e) toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }); return !e; };
  const load = useCallback(async () => {
    const [i, p, u, r] = await Promise.all([
      supabase.from('factory_ingredients').select('id,name,unit,package_size,package_cost,last_purchase_tx_id,last_purchase_date').eq('active', true).order('name'),
      supabase.from('crm_products').select('id,name,cookies_per_package,price').eq('active', true).order('name'),
      supabase.from('units').select('id,name').eq('active', true).order('name'),
      supabase.from('factory_recipes').select('id,product_id,yield_units,factory_recipe_items(id,ingredient_id,quantity)'),
    ]);
    setIngredients(i.data ?? []); setLinked(Object.fromEntries((i.data ?? []).map(x => [x.id, { tx: x.last_purchase_tx_id, date: x.last_purchase_date }]))); setProducts(p.data ?? []); setUnits(u.data ?? []); setRecipes((r.data ?? []) as RecipeRow[]);
  }, []);
  type DemandOrder = { id: string; unit_id: string; company_id: string; delivery_date: string | null; status: string; crm_order_items: { product_id: string; packages: number; cookies_per_package: number }[] };
  const [demandOrders, setDemandOrders] = useState<DemandOrder[]>([]);
  const horizon = (() => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();
  const loadDemand = useCallback(async () => {
    const { data } = await supabase.from('crm_orders').select('id,unit_id,company_id,delivery_date,status,crm_order_items(product_id,packages,cookies_per_package)')
      .eq('active', true).in('status', ['pendente', 'em_producao']).gte('delivery_date', date).lte('delivery_date', horizon).order('delivery_date');
    setDemandOrders((data ?? []) as DemandOrder[]);
  }, [date, horizon]);
  useEffect(() => { void loadDemand(); }, [loadDemand]);
  const demand = useMemo(() => ordersDemand(demandOrders.map(o => ({ unit_id: o.unit_id, items: o.crm_order_items }))), [demandOrders]);
  const startProduction = async () => {
    const ids = demandOrders.filter(o => o.status === 'pendente').map(o => o.id);
    if (!ids.length) return;
    if (fail((await supabase.from('crm_orders').update({ status: 'em_producao' }).in('id', ids)).error)) { toast({ title: `${ids.length} pedido(s) em produção` }); void loadDemand(); }
  };
  const loadForecasts = useCallback(async () => {
    const { data } = await supabase.from('factory_forecasts').select('id,unit_id,product_id,quantity').eq('production_date', date);
    setForecasts(data ?? []);
  }, [date]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadForecasts(); }, [loadForecasts]);

  const recipeList: Recipe[] = useMemo(() => recipes.map(r => ({ product_id: r.product_id, yield_units: r.yield_units, items: r.factory_recipe_items })), [recipes]);
  const plan = useMemo(() => productionPlan([...forecasts, ...demand], recipeList, ingredients), [forecasts, demand, recipeList, ingredients]);
  const productName = (id: string) => products.find(p => p.id === id)?.name ?? '—';
  const ingById = (id: string) => ingredients.find(i => i.id === id);

  const addIngredient = async () => {
    const size = Number(newIng.package_size), cost = Number(newIng.package_cost.replace(',', '.'));
    if (!newIng.name.trim() || !(size > 0) || !(cost >= 0)) { toast({ title: 'Confira nome, tamanho e preço da embalagem', variant: 'destructive' }); return; }
    if (fail((await supabase.from('factory_ingredients').insert({ name: newIng.name.trim(), unit: newIng.unit, package_size: size, package_cost: cost })).error)) { setNewIng({ name: '', unit: 'g', package_size: '1000', package_cost: '' }); void load(); }
  };
  const updateIngredient = async (id: string, patch: { package_cost?: number; active?: boolean }) => { if (fail((await supabase.from('factory_ingredients').update(patch).eq('id', id)).error)) void load(); };

  const recipe = recipes.find(r => r.product_id === productId);
  const product = products.find(p => p.id === productId);
  const ensureRecipe = async () => {
    if (recipe) return recipe.id;
    const { data, error } = await supabase.from('factory_recipes').insert({ product_id: productId, yield_units: 1 }).select('id').single();
    fail(error); return data?.id;
  };
  const addItem = async (ingredient_id: string) => { const id = await ensureRecipe(); if (id && fail((await supabase.from('factory_recipe_items').insert({ recipe_id: id, ingredient_id, quantity: 0 })).error)) void load(); };
  const setItemQty = async (id: string, quantity: number) => { if (fail((await supabase.from('factory_recipe_items').update({ quantity }).eq('id', id)).error)) void load(); };
  const removeItem = async (id: string) => { if (fail((await supabase.from('factory_recipe_items').delete().eq('id', id)).error)) void load(); };
  const setYield = async (v: number) => { const id = await ensureRecipe(); if (id && v > 0 && fail((await supabase.from('factory_recipes').update({ yield_units: v }).eq('id', id)).error)) void load(); };

  const qty = (unit_id: string, product_id: string) => forecasts.find(f => f.unit_id === unit_id && f.product_id === product_id)?.quantity ?? 0;
  const setForecast = async (unit_id: string, product_id: string, quantity: number) => {
    if (fail((await supabase.from('factory_forecasts').upsert({ production_date: date, unit_id, product_id, quantity: Math.max(0, quantity) }, { onConflict: 'production_date,unit_id,product_id' })).error)) void loadForecasts();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold"><ChefHat className="h-6 w-6 text-primary" /> Fábrica & Operações</h1>
        <p className="text-sm text-muted-foreground">Pedidos e distribuição, produtos, fichas técnicas, ingredientes e sugestão de produção.</p>
      </div>
      <Tabs value={tab} onValueChange={v => navigate(v === 'producao' ? '/fabrica' : `/fabrica/${v}`)}>
        <TabsList className="flex h-auto flex-wrap"><TabsTrigger value="pedidos">Distribuição & pedidos</TabsTrigger><TabsTrigger value="producao">Sugestão de produção</TabsTrigger><TabsTrigger value="fornadas">Fornadas</TabsTrigger><TabsTrigger value="fichas">Fichas técnicas</TabsTrigger><TabsTrigger value="ingredientes">Ingredientes</TabsTrigger><TabsTrigger value="produtos">Produtos</TabsTrigger></TabsList>
        <TabsContent value="pedidos"><CrmOrders companies={companies.data} unitFilter="all" search="" /></TabsContent>
        <TabsContent value="produtos"><CrmProducts /></TabsContent>
        <TabsContent value="fornadas"><FactoryBatches products={products} recipes={recipeList} ingredients={ingredients} plannedToday={{ date, items: plan.products.map(p => ({ product_id: p.product_id, units: p.units })) }} /></TabsContent>

        <TabsContent value="ingredientes" className="space-y-3">
          <Card className="rounded-2xl"><CardContent className="p-3 text-sm"><p className="text-muted-foreground">Matéria-prima e embalagens no Contas a Pagar neste mês</p><p className="text-lg font-bold">{money(realMonth)}</p><p className="text-xs text-muted-foreground">Use "Pela conta a pagar" para atualizar o custo do ingrediente com o valor real da compra.</p></CardContent></Card>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>Ingrediente</Label><Input value={newIng.name} onChange={e => setNewIng({ ...newIng, name: e.target.value })} placeholder="Farinha de trigo" /></div>
            <div><Label>Medida</Label><Select value={newIng.unit} onValueChange={unit => setNewIng({ ...newIng, unit })}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{['g', 'ml', 'un'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Tamanho da embalagem</Label><Input type="number" className="w-36" value={newIng.package_size} onChange={e => setNewIng({ ...newIng, package_size: e.target.value })} /></div>
            <div><Label>Preço da embalagem (R$)</Label><Input className="w-36" value={newIng.package_cost} onChange={e => setNewIng({ ...newIng, package_cost: e.target.value })} /></div>
            <Button onClick={addIngredient}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
          </div>
          <Table><TableHeader><TableRow><TableHead>Ingrediente</TableHead><TableHead className="text-right">Embalagem</TableHead><TableHead className="text-right">Preço</TableHead><TableHead className="text-right">Custo por medida</TableHead><TableHead>Última compra</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{ingredients.map(i => <TableRow key={i.id}>
              <TableCell>{i.name}</TableCell><TableCell className="text-right">{num(i.package_size)} {i.unit}</TableCell>
              <TableCell className="text-right"><Input className="ml-auto w-28 text-right" defaultValue={i.package_cost} onBlur={e => Number(e.target.value) !== Number(i.package_cost) && updateIngredient(i.id, { package_cost: Number(e.target.value) })} /></TableCell>
              <TableCell className="text-right">{money(ingredientCostPerUnit(i), 4)} / {i.unit}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => setBuyFor(i)}>Pela conta a pagar</Button>{linked[i.id]?.date && <span className="block text-xs text-muted-foreground">{linked[i.id]!.date!.split('-').reverse().join('/')} · {payables.find(p => p.id === linked[i.id]?.tx)?.description ?? 'conta vinculada'}</span>}</TableCell>
              <TableCell><Button size="icon" variant="ghost" aria-label="Arquivar" onClick={() => updateIngredient(i.id, { active: false })}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>)}</TableBody></Table>
        </TabsContent>

        <TabsContent value="fichas" className="space-y-4">
          <Select value={productId} onValueChange={setProductId}><SelectTrigger className="w-72"><SelectValue placeholder="Escolha o produto" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
          {!products.length && <p className="text-sm text-muted-foreground">Cadastre os produtos em CRM › Produtos.</p>}
          {productId && <>
            <div className="flex flex-wrap items-end gap-4">
              <div><Label>Rendimento da receita (cookies)</Label><Input key={productId + (recipe?.yield_units ?? 1)} type="number" className="w-40" defaultValue={recipe?.yield_units ?? 1} onBlur={e => setYield(Number(e.target.value))} /></div>
              {recipe && product && (() => { const c = recipeCost({ product_id: productId, yield_units: recipe.yield_units, items: recipe.factory_recipe_items }, ingredients); const pkg = c.perUnit * product.cookies_per_package; return <>
                <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Custo da receita</p><p className="text-lg font-bold">{money(c.total)}</p></CardContent></Card>
                <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Custo por cookie</p><p className="text-lg font-bold text-primary">{money(c.perUnit, 4)}</p></CardContent></Card>
                <Card className="rounded-2xl"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Custo da embalagem ({product.cookies_per_package} un.)</p><p className="text-lg font-bold">{money(pkg)}</p>{Number(product.price) > 0 && <p className="text-xs text-muted-foreground">margem {num(((product.price - pkg) / product.price) * 100)}% sobre {money(product.price)}</p>}</CardContent></Card>
              </>; })()}
            </div>
            <Table><TableHeader><TableRow><TableHead>Ingrediente</TableHead><TableHead className="text-right">Quantidade na receita</TableHead><TableHead className="text-right">Custo</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{recipe?.factory_recipe_items.map(it => { const ing = ingById(it.ingredient_id); return <TableRow key={it.id}>
                <TableCell>{ing?.name ?? '—'}</TableCell>
                <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Input className="w-28 text-right" defaultValue={it.quantity} onBlur={e => Number(e.target.value) !== Number(it.quantity) && setItemQty(it.id, Number(e.target.value))} /><span className="text-xs text-muted-foreground">{ing?.unit}</span></div></TableCell>
                <TableCell className="text-right">{money(ing ? ingredientCostPerUnit(ing) * it.quantity : 0)}</TableCell>
                <TableCell><Button size="icon" variant="ghost" aria-label="Remover" onClick={() => removeItem(it.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>; })}</TableBody></Table>
            <Select value="" onValueChange={addItem}><SelectTrigger className="w-72"><SelectValue placeholder="+ Adicionar ingrediente" /></SelectTrigger><SelectContent>{ingredients.filter(i => !recipe?.factory_recipe_items.some(it => it.ingredient_id === i.id)).map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select>
          </>}
        </TabsContent>

        <TabsContent value="producao" className="space-y-4">
          <div><Label>Dia da produção</Label><Input type="date" className="w-44" value={date} onChange={e => setDate(e.target.value)} /></div>
          <Card className="rounded-2xl"><CardHeader className="flex flex-row items-center justify-between gap-2 pb-2"><CardTitle className="text-base">Pedidos com entrega até {horizon.split('-').reverse().join('/')}</CardTitle>
            {demandOrders.some(o => o.status === 'pendente') && <Button size="sm" onClick={() => void startProduction()}>Iniciar produção</Button>}</CardHeader>
            <CardContent>{!demandOrders.length ? <p className="text-sm text-muted-foreground">Nenhum pedido pendente para esta fornada.</p> : <Table>
              <TableHeader><TableRow><TableHead>Entrega</TableHead><TableHead>Unidade</TableHead><TableHead>Produtos</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
              <TableBody>{demandOrders.map(o => <TableRow key={o.id}><TableCell>{(o.delivery_date ?? '').split('-').reverse().join('/')}</TableCell><TableCell>{units.find(u => u.id === o.unit_id)?.name ?? '—'}</TableCell>
                <TableCell>{o.crm_order_items.length ? o.crm_order_items.map(it => `${num(it.packages)}× ${productName(it.product_id)}`).join(', ') : <Badge variant="destructive">sem produtos</Badge>}</TableCell>
                <TableCell><Badge variant={o.status === 'em_producao' ? 'default' : 'outline'}>{o.status === 'em_producao' ? 'Em produção' : 'Pendente'}</Badge></TableCell></TableRow>)}</TableBody></Table>}
              <p className="mt-2 text-xs text-muted-foreground">Esses pedidos já entram em "O que produzir" e nos ingredientes, somados à previsão das lojas abaixo.</p></CardContent></Card>
          <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-base">Previsão por unidade (quantidade de cookies)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">{!products.length ? <p className="text-sm text-muted-foreground">Cadastre os produtos em CRM › Produtos.</p> : <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead>{units.map(u => <TableHead key={u.id} className="text-right">{u.name}</TableHead>)}<TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{products.map(p => <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                {units.map(u => <TableCell key={u.id} className="text-right"><Input key={date + qty(u.id, p.id)} type="number" min={0} className="ml-auto w-20 text-right" defaultValue={qty(u.id, p.id) || ''} onBlur={e => Number(e.target.value || 0) !== qty(u.id, p.id) && setForecast(u.id, p.id, Number(e.target.value || 0))} /></TableCell>)}
                <TableCell className="text-right font-semibold">{num(forecasts.filter(f => f.product_id === p.id).reduce((s, f) => s + Number(f.quantity), 0))}</TableCell>
              </TableRow>)}</TableBody></Table>}</CardContent></Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-base">O que produzir</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Cookies</TableHead><TableHead className="text-right">Receitas</TableHead><TableHead className="text-right">Custo</TableHead></TableRow></TableHeader>
                <TableBody>{plan.products.filter(p => p.units > 0).map(p => <TableRow key={p.product_id}><TableCell>{productName(p.product_id)} {p.missingRecipe && <Badge variant="destructive">sem ficha</Badge>}</TableCell><TableCell className="text-right">{num(p.units)}</TableCell><TableCell className="text-right">{num(p.batches)}</TableCell><TableCell className="text-right">{money(p.cost)}</TableCell></TableRow>)}</TableBody></Table>
              <p className="mt-2 text-right text-sm font-semibold">Custo total previsto: {money(plan.totalCost)}</p>
            </CardContent></Card>
            <Card className="rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-base">Ingredientes a separar / comprar</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>Ingrediente</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead className="text-right">Embalagens</TableHead><TableHead className="text-right">Custo</TableHead></TableRow></TableHeader>
                <TableBody>{plan.shopping.map(s => <TableRow key={s.ingredient_id}><TableCell>{s.name}</TableCell><TableCell className="text-right">{num(s.quantity)} {s.unit}</TableCell><TableCell className="text-right">{s.packages}</TableCell><TableCell className="text-right">{money(s.cost)}</TableCell></TableRow>)}</TableBody></Table>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
      <Dialog open={!!buyFor} onOpenChange={o => !o && setBuyFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Custo real de {buyFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div><Label>Conta a pagar da compra (últimos 3 meses)</Label>
              <Select value={buy.tx} onValueChange={tx => setBuy({ ...buy, tx })}><SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                <SelectContent>{payables.map(p => <SelectItem key={p.id} value={p.id}>{p.competence_date.split('-').reverse().join('/')} · {p.partners?.name ?? p.description} · {money(Number(p.amount))}</SelectItem>)}</SelectContent></Select>
              {!payables.length && <p className="text-xs text-muted-foreground">Nenhuma conta de matéria-prima ou embalagens nos últimos 3 meses.</p>}</div>
            <div><Label>Quantidade comprada ({buyFor?.unit})</Label><Input type="number" min={0} value={buy.qty} onChange={e => setBuy({ ...buy, qty: e.target.value })} placeholder="ex.: 50000 para 50 kg" /></div>
            {(() => { const tx = payables.find(p => p.id === buy.tx); const c = tx && purchaseToIngredient(Number(tx.amount), Number(buy.qty)); return c ? <p>Novo custo: <strong>{money(c.costPerUnit, 4)} por {buyFor?.unit}</strong>. A conta a pagar não é alterada.</p> : null; })()}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBuyFor(null)}>Voltar</Button><Button onClick={() => void registerPurchase()}>Atualizar custo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
