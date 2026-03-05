import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBills, BillRow } from '@/hooks/useBills';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import SelectWithAdd from '@/components/ui/select-with-add';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Banknote,
  Copy,
  Building2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import BillFilters, { BillFiltersState, emptyFilters } from '@/components/accounts/BillFilters';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function getStatusInfo(bill: BillRow) {
  const today = new Date().toISOString().substring(0, 10);
  if (bill.status === 'pago' || bill.status === 'recebido') {
    return { label: bill.status === 'pago' ? 'Pago' : 'Recebido', variant: 'default' as const, className: 'bg-success text-success-foreground' };
  }
  if (bill.due_date && bill.due_date < today) {
    return { label: 'Vencida', variant: 'destructive' as const, className: '' };
  }
  if (bill.due_date === today) {
    return { label: 'Vence Hoje', variant: 'outline' as const, className: 'border-warning text-warning' };
  }
  return { label: 'Pendente', variant: 'secondary' as const, className: '' };
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const paymentMethods = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'outro', label: 'Outro' },
];

function BillsTab({ tab }: { tab: 'pagar' | 'receber' }) {
  const [filters, setFilters] = useState<BillFiltersState>(emptyFilters);
  const { data, summary, loading, markAs } = useBills(tab, filters);
  const { data: accounts, create: createAccount } = useSupabaseCrud('accounts');
  const { toast } = useToast();
  const [payDialog, setPayDialog] = useState<BillRow | null>(null);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('pix');
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!payDialog) return;
    setPaying(true);
    const status = tab === 'pagar' ? 'pago' : 'recebido';
    await markAs(payDialog.id, status as any, selectedAccount || undefined, selectedMethod || undefined);
    setPaying(false);
    setPayDialog(null);
    setSelectedAccount('');
    setSelectedMethod('pix');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  const pixTypeLabels: Record<string, string> = {
    cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Chave Aleatória',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <BillFilters filters={filters} onChange={setFilters} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card rounded-xl border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Total a Pagar</span>
            </div>
            <span className="text-lg font-bold font-heading text-card-foreground">{fmt(summary.totalPagar)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-xl border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-xs text-muted-foreground">Total a Receber</span>
            </div>
            <span className="text-lg font-bold font-heading text-card-foreground">{fmt(summary.totalReceber)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-xl border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Vencidas (Pagar)</span>
            </div>
            <span className="text-lg font-bold font-heading text-destructive">{fmt(summary.vencidasPagar)}</span>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-xl border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-warning" />
              <span className="text-xs text-muted-foreground">Vencendo Hoje</span>
            </div>
            <span className="text-lg font-bold font-heading text-card-foreground">{summary.vencendoHoje}</span>
          </CardContent>
        </Card>
      </div>

      {/* Bills List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : data.length === 0 ? (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              Nenhuma conta {tab === 'pagar' ? 'a pagar' : 'a receber'} pendente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map(bill => {
            const statusInfo = getStatusInfo(bill);
            const isOverdue = statusInfo.label === 'Vencida';
            return (
              <Card
                key={bill.id}
                className={`shadow-card rounded-xl border-border transition-colors ${isOverdue ? 'border-l-4 border-l-destructive' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm text-card-foreground truncate">
                          {bill.description}
                        </span>
                        <Badge variant={statusInfo.variant} className={`text-[10px] ${statusInfo.className}`}>
                          {statusInfo.label}
                        </Badge>
                        {bill.installment_total && bill.installment_total > 1 && (
                          <Badge variant="outline" className="text-[10px]">
                            {bill.installment_number}/{bill.installment_total}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {bill.partner?.name && <span>{bill.partner.name}</span>}
                        {bill.unit?.name && <span>• {bill.unit.name}</span>}
                        {bill.category?.name && <span>• {bill.category.name}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>Venc: {formatDate(bill.due_date)}</span>
                        {bill.account?.name && <span>• {bill.account.name}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`text-base font-bold font-heading ${tab === 'pagar' ? 'text-destructive' : 'text-success'}`}>
                        {fmt(Number(bill.net_amount))}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setPayDialog(bill)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {tab === 'pagar' ? 'Pagar' : 'Receber'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {tab === 'pagar' ? 'Confirmar Pagamento' : 'Confirmar Recebimento'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium">{payDialog?.description}</p>
              <p className="text-xl font-bold font-heading text-primary">
                {payDialog && fmt(Number(payDialog.net_amount))}
              </p>
              {payDialog?.partner?.name && (
                <p className="text-xs text-muted-foreground">{payDialog.partner.name}</p>
              )}
            </div>

            {/* Partner bank info */}
            {payDialog?.partner && (payDialog.partner.pix_key || payDialog.partner.bank_name) && (
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Dados Bancários
                </p>
                {payDialog.partner.pix_key && (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        PIX ({pixTypeLabels[payDialog.partner.pix_key_type || ''] || 'Chave'})
                      </p>
                      <p className="text-sm font-mono">{payDialog.partner.pix_key}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => copyToClipboard(payDialog.partner!.pix_key!)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {payDialog.partner.bank_name && (
                  <div className="text-xs space-y-0.5">
                    <p>Banco: {payDialog.partner.bank_name}</p>
                    {payDialog.partner.bank_agency && <p>Agência: {payDialog.partner.bank_agency}</p>}
                    {payDialog.partner.bank_account && <p>Conta: {payDialog.partner.bank_account}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Forma de Pagamento</label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Conta</label>
                <SelectWithAdd
                  value={selectedAccount}
                  onValueChange={setSelectedAccount}
                  options={(accounts as any[])?.filter((a: any) => a.active).map((a: any) => ({ id: a.id, name: a.name })) ?? []}
                  placeholder="Selecione..."
                  noneLabel="Selecione..."
                  addLabel="+ Nova Conta"
                  dialogTitle="Nova Conta"
                  extraFields={[{ key: 'type', label: 'Tipo', type: 'select', options: [
                    { value: 'banco', label: 'Banco' }, { value: 'caixa', label: 'Caixa' }, { value: 'carteira', label: 'Carteira Digital' },
                  ]}]}
                  onAdd={async (d) => {
                    const id = await createAccount({ name: d.name, type: d.type || 'banco', active: true } as any);
                    return id || null;
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
            <Button onClick={handlePay} disabled={paying}>
              <Banknote className="h-4 w-4 mr-1" />
              {paying ? 'Processando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Accounts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Contas a Pagar / Receber</h1>
        <p className="text-sm text-muted-foreground">Gerencie vencimentos e pagamentos</p>
      </div>

      <Tabs defaultValue="pagar" className="w-full">
        <TabsList className="w-full grid grid-cols-2 rounded-xl bg-muted">
          <TabsTrigger value="pagar" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            A Pagar
          </TabsTrigger>
          <TabsTrigger value="receber" className="rounded-lg data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground">
            A Receber
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pagar" className="mt-4">
          <BillsTab tab="pagar" />
        </TabsContent>
        <TabsContent value="receber" className="mt-4">
          <BillsTab tab="receber" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
