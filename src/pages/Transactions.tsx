import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Search, TrendingUp, TrendingDown, Wallet, AlertTriangle, CreditCard } from 'lucide-react';
import { useTransactions, TransactionFilters as TFilters, TransactionRow } from '@/hooks/useTransactions';
import TransactionFormDialog from '@/components/transactions/TransactionFormDialog';
import CardSaleDialog from '@/components/transactions/CardSaleDialog';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionList from '@/components/transactions/TransactionList';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function Transactions() {
  const [filters, setFilters] = useState<TFilters>({});
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cardSaleOpen, setCardSaleOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRow | null>(null);

  const appliedFilters = { ...filters, search: search || undefined };
  const { data, loading, totals, create, update, remove, markAs, fetchData } = useTransactions(appliedFilters);

  const incompleteStats = useMemo(() => {
    const noCategory = data.filter(t => !t.category_id && t.status !== 'cancelado').length;
    const noUnit = data.filter(t => !t.unit_id && t.status !== 'cancelado').length;
    return { noCategory, noUnit };
  }, [data]);

  const handleEdit = (tx: TransactionRow) => {
    setEditingTx(tx);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingTx(null);
    setDialogOpen(true);
  };

  const handleSave = async (input: any) => {
    if (editingTx) {
      return update(editingTx.id, input);
    }
    return create(input);
  };

  const summaryCards = [
    { label: 'Receitas', value: totals.receitas, icon: TrendingUp, color: 'text-[hsl(var(--success))]' },
    { label: 'Despesas', value: totals.despesas, icon: TrendingDown, color: 'text-destructive' },
    { label: 'Saldo', value: totals.saldo, icon: Wallet, color: totals.saldo >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl gap-2" onClick={() => setCardSaleOpen(true)}>
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Venda no cartão</span>
          </Button>
          <Button className="rounded-xl gap-2" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo</span>
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {summaryCards.map(s => (
          <Card key={s.label} className="rounded-2xl border-border shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase">{s.label}</p>
                <p className={`text-sm sm:text-lg font-bold ${s.color}`}>{formatCurrency(s.value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Incomplete data alerts */}
      {(incompleteStats.noCategory > 0 || incompleteStats.noUnit > 0) && (
        <Alert variant="default" className="border-warning/50 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs text-warning">
            {incompleteStats.noCategory > 0 && (
              <span>{incompleteStats.noCategory} lançamento{incompleteStats.noCategory > 1 ? 's' : ''} sem categoria (não aparecerão no DRE). </span>
            )}
            {incompleteStats.noUnit > 0 && (
              <span>{incompleteStats.noUnit} lançamento{incompleteStats.noUnit > 1 ? 's' : ''} sem unidade (ficarão em "Sem unidade" no DRE). </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Search + filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lançamentos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border rounded-xl"
          />
        </div>
        <TransactionFilters filters={filters} onChange={setFilters} />
      </div>

      {/* List */}
      <TransactionList
        data={data}
        loading={loading}
        onEdit={handleEdit}
        onDelete={remove}
        onMarkAs={markAs}
      />

      {/* Form dialog */}
      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        initialData={editingTx ? {
          id: editingTx.id,
          type: editingTx.type,
          description: editingTx.description,
          amount: Number(editingTx.amount),
          tax_amount: Number(editingTx.tax_amount),
          competence_date: editingTx.competence_date,
          due_date: editingTx.due_date || undefined,
          payment_date: editingTx.payment_date || undefined,
          status: editingTx.status,
          payment_method: editingTx.payment_method || undefined,
          category_id: editingTx.category_id || undefined,
          account_id: editingTx.account_id || undefined,
          partner_id: editingTx.partner_id || undefined,
          unit_id: editingTx.unit_id || undefined,
          front_id: editingTx.front_id || undefined,
          notes: editingTx.notes || undefined,
          affects_dre: (editingTx as any).affects_dre,
          affects_cashflow: (editingTx as any).affects_cashflow,
        } : undefined}
      />

      <CardSaleDialog open={cardSaleOpen} onOpenChange={setCardSaleOpen} onCreated={fetchData} />
    </div>
  );
}
