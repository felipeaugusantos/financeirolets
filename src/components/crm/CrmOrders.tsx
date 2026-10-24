import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CrudTable, type ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, type FieldConfig, type FormValues } from '@/components/settings/CrudDialog';
import { ORDER_STATUSES, PAYMENT_TERMS, customerAverages, inactiveCustomers, monthToDateComparison, orderDueDate } from '@/lib/crmRules';
import type { Tables } from '@/integrations/supabase/types';

type Order = Tables<'crm_orders'>;
type Company = Tables<'crm_companies'>;
const statusLabel: Record<string, string> = { pendente: 'Pendente', em_producao: 'Em produção', enviado: 'Enviado', faturado: 'Faturado', cancelado: 'Cancelado' };
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

interface Props { companies: Company[]; unitFilter: string; search: string }

export function CrmOrders({ companies, unitFilter, search }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const orders = useSupabaseCrud<Order>('crm_orders', 'order_date');
  const categories = useSupabaseCrud<Tables<'categories'>>('categories', 'name');
  const [editor, setEditor] = useState<FormValues | null>(null);
  const [invoicing, setInvoicing] = useState<Order | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');
  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? 'Empresa indisponível';

  const visible = orders.data
    .filter(o => o.active && (unitFilter === 'all' || o.unit_id === unitFilter) && `${companyName(o.company_id)} ${o.seller_name ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => b.order_date.localeCompare(a.order_date));
  const kpi = useMemo(() => monthToDateComparison(visible, today), [visible, today]);
  const inactive = useMemo(() => inactiveCustomers(visible, today), [visible, today]);
  const averages = useMemo(() => customerAverages(visible).sort((a, b) => b.avgAmount - a.avgAmount).slice(0, 8), [visible]);
  const companyOptions = companies.filter(c => c.active && !c.do_not_contact).map(c => ({ value: c.id, label: c.name }));
  const incomeCategories = categories.data.filter(c => c.active && c.type === 'receita');

  const fields: FieldConfig[] = [
    { name: 'company_id', label: 'Cliente', type: 'select', required: true, options: companyOptions },
    { name: 'order_date', label: 'Data do pedido', type: 'date', required: true },
    { name: 'delivery_date', label: 'Data de envio', type: 'date' },
    { name: 'quantity_boxes', label: 'Caixas', type: 'number' },
    { name: 'quantity_cookies', label: 'Cookies', type: 'number' },
    { name: 'total_amount', label: 'Valor do pedido (R$)', type: 'number', required: true },
    { name: 'payment_terms', label: 'Condição de pagamento', type: 'select', required: true, options: Object.entries(PAYMENT_TERMS).map(([value, t]) => ({ value, label: t.label })) },
    { name: 'seller_name', label: 'Vendedor' },
    { name: 'status', label: 'Situação', type: 'select', required: true, options: ORDER_STATUSES.filter(s => s !== 'faturado').map(value => ({ value, label: statusLabel[value] })) },
    { name: 'notes', label: 'Observações', type: 'textarea' },
  ];

  const save = async (raw: FormValues): Promise<boolean | string> => {
    const company = companies.find(c => c.id === raw.company_id);
    if (!company || !user) { toast({ title: 'Escolha o cliente', variant: 'destructive' }); return false; }
    const amount = Number(raw.total_amount || 0), boxes = Number(raw.quantity_boxes || 0), cookies = Number(raw.quantity_cookies || 0);
    if (![amount, boxes, cookies].every(n => Number.isFinite(n) && n >= 0)) { toast({ title: 'Confira valor e quantidades', variant: 'destructive' }); return false; }
    const orderDate = String(raw.order_date || today);
    const delivery = raw.delivery_date ? String(raw.delivery_date) : null;
    const terms = String(raw.payment_terms || 'boleto_7');
    const row = {
      company_id: company.id, unit_id: company.unit_id, owner_id: company.owner_id,
      order_date: orderDate, delivery_date: delivery, quantity_boxes: Math.round(boxes), quantity_cookies: Math.round(cookies),
      total_amount: amount, payment_terms: terms, due_date: orderDueDate(delivery ?? orderDate, terms),
      seller_name: raw.seller_name ? String(raw.seller_name) : null, status: String(raw.status || 'pendente'), notes: raw.notes ? String(raw.notes) : null,
    };
    const id = editor?.id;
    return typeof id === 'string' ? orders.update(id, row) : orders.create(row);
  };

  const invoice = async () => {
    if (!invoicing || !categoryId || !user) return;
    setBusy(true);
    const o = invoicing;
    const { data: tx, error } = await supabase.from('transactions').insert({
      type: 'receita', description: `Pedido distribuição — ${companyName(o.company_id)}`,
      amount: o.total_amount, tax_amount: 0, net_amount: o.total_amount,
      competence_date: o.delivery_date ?? o.order_date, due_date: o.due_date, status: 'pendente',
      payment_method: o.payment_terms.startsWith('boleto') ? 'boleto' : o.payment_terms === 'pix' ? 'pix' : 'outro',
      unit_id: o.unit_id, category_id: categoryId, created_by: user.id,
      notes: `Gerado pelo CRM a partir do pedido de ${dateLabel(o.order_date)} (${o.quantity_boxes} caixas).`,
    }).select('id').single();
    if (error || !tx) { setBusy(false); toast({ title: 'Não foi possível gerar a conta a receber', description: error?.message, variant: 'destructive' }); return; }
    await orders.update(o.id, { status: 'faturado', transaction_id: tx.id });
    setBusy(false); setInvoicing(null); setCategoryId('');
    toast({ title: 'Conta a receber criada', description: `Vencimento ${dateLabel(o.due_date)}` });
  };

  const columns: ColumnConfig<Order>[] = [
    { key: 'order_date', label: 'Pedido', render: (v: string) => dateLabel(v) },
    { key: 'company_id', label: 'Cliente', render: (v: string) => <Link className="text-primary" to={`/crm/empresas/${v}`}>{companyName(v)}</Link> },
    { key: 'delivery_date', label: 'Envio', render: (v: string) => dateLabel(v) },
    { key: 'quantity_boxes', label: 'Caixas' },
    { key: 'total_amount', label: 'Valor', render: (v: number) => money(Number(v)) },
    { key: 'payment_terms', label: 'Condição', render: (v: string, o) => <span>{PAYMENT_TERMS[v]?.label ?? v}<span className="block text-xs text-muted-foreground">vence {dateLabel(o.due_date)}</span></span> },
    { key: 'status', label: 'Situação', render: (v: string, o) => v === 'faturado' || v === 'cancelado'
      ? <Badge variant={v === 'faturado' ? 'secondary' : 'outline'}>{statusLabel[v]}</Badge>
      : <Button size="sm" variant="outline" className="gap-1" onClick={() => setInvoicing(o)}><Receipt className="h-3 w-3" />{statusLabel[v]} · Faturar</Button> },
  ];

  const variation = kpi.variation;
  return <div className="space-y-5">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Vendido no mês até hoje</p><p className="font-heading text-xl font-semibold">{money(kpi.current.amount)}</p><p className="text-xs text-muted-foreground">{kpi.current.orders} pedidos · {kpi.current.boxes} caixas</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Mesmo período do mês anterior</p><p className="font-heading text-xl font-semibold">{money(kpi.previous.amount)}</p><p className="text-xs text-muted-foreground">{kpi.previous.orders} pedidos · {kpi.previous.boxes} caixas</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Variação</p><p className={`font-heading text-xl font-semibold flex items-center gap-1 ${variation != null && variation < 0 ? 'text-destructive' : 'text-primary'}`}>{variation == null ? '—' : <>{variation < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}{(variation * 100).toFixed(1)}%</>}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Clientes sem pedido no mês</p><p className="font-heading text-xl font-semibold">{inactive.length}</p><p className="text-xs text-muted-foreground">compraram nos últimos 3 meses</p></CardContent></Card>
    </div>

    <div className="flex justify-between items-center gap-2"><h2 className="font-heading text-lg font-semibold">Pedidos de distribuição</h2><Button size="sm" onClick={() => setEditor({ order_date: today, payment_terms: 'boleto_7', status: 'pendente' })}><Plus className="h-4 w-4 mr-1" />Novo pedido</Button></div>
    <CrudTable title="Pedidos" hasActive={false} columns={columns} data={visible} loading={orders.loading} onAdd={() => setEditor({ order_date: today, payment_terms: 'boleto_7', status: 'pendente' })} onEdit={o => setEditor({ ...o })} onDelete={id => { if (window.confirm('Arquivar este pedido? O histórico será preservado.')) void orders.update(id, { active: false }); }} />

    <div className="grid md:grid-cols-2 gap-5">
      <section><h3 className="font-heading font-medium mb-2">Consumo médio por cliente</h3>
        <div className="divide-y divide-border text-sm">{averages.map(a => <div key={a.company_id} className="flex justify-between py-2 gap-2"><span>{companyName(a.company_id)}</span><span className="text-muted-foreground">{money(a.avgAmount)}/mês · {a.avgBoxes.toFixed(1)} cx</span></div>)}{!averages.length && <p className="text-muted-foreground py-2">Sem pedidos ainda.</p>}</div></section>
      <section><h3 className="font-heading font-medium mb-2">Clientes que ainda não pediram este mês</h3>
        <div className="divide-y divide-border text-sm">{inactive.map(id => <Link key={id} to={`/crm/empresas/${id}`} className="block py-2 text-primary">{companyName(id)}</Link>)}{!inactive.length && <p className="text-muted-foreground py-2">Todos os clientes recentes já pediram.</p>}</div></section>
    </div>

    {editor && <CrudDialog open onClose={() => setEditor(null)} title={editor.id ? 'Editar pedido' : 'Novo pedido'} fields={fields} initialData={editor} onSave={save} contentClassName="rounded-lg max-w-2xl max-h-[85vh] overflow-y-auto" />}
    <Dialog open={!!invoicing} onOpenChange={o => !o && setInvoicing(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Faturar pedido</DialogTitle></DialogHeader>
        {invoicing && <div className="space-y-3 text-sm">
          <p>Será criada uma <strong>conta a receber pendente</strong> de <strong>{money(Number(invoicing.total_amount))}</strong> para {companyName(invoicing.company_id)}, vencendo em <strong>{dateLabel(invoicing.due_date)}</strong>.</p>
          <div><Label>Categoria da receita</Label>
            <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger aria-label="Categoria da receita"><SelectValue placeholder="Escolha a categoria" /></SelectTrigger><SelectContent>{incomeCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setInvoicing(null)}>Voltar</Button><Button disabled={!categoryId || busy} onClick={() => void invoice()}>Gerar conta a receber</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
