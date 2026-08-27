import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Search, TrendingUp, TrendingDown, Wallet, AlertTriangle, CreditCard, Undo2, Redo2, History, Trash2 } from 'lucide-react';
import { useTransactions, TransactionFilters as TFilters, TransactionRow } from '@/hooks/useTransactions';
import TransactionFormDialog from '@/components/transactions/TransactionFormDialog';
import CardSaleDialog from '@/components/transactions/CardSaleDialog';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionList from '@/components/transactions/TransactionList';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useDeleteHistory, DeletedCapture } from '@/hooks/useDeleteHistory';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<TFilters>({});
  // Permite abrir a tela já filtrada a partir da Conferência de lançamentos.
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cardSaleOpen, setCardSaleOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRow | null>(null);

  const appliedFilters = { ...filters, search: search || undefined };
  const { data, loading, totals, listComplete, create, update, remove, restore, markAs, fetchData } = useTransactions(appliedFilters);
  const { toast } = useToast();
  const history = useDeleteHistory();

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

  const handleUndoEntry = async (entry: DeletedCapture) => {
    const ok = await restore({ row: entry.row, allocations: entry.allocations });
    if (ok) {
      // Move from undo → redo stack (persisted)
      const popped = history.popUndo();
      // If the popped one isn't the same (e.g. user clicked an older entry),
      // we still want the chosen entry to flow into redo.
      if (popped && popped.row?.id !== entry.row?.id) {
        // restore order: put popped back and remove the target one manually
        // (rare path — fallback: just clear redo and rebuild)
        history.removeFromUndo(entry.row.id);
      }
      toast({
        title: 'Lançamento restaurado',
        action: (
          <ToastAction altText="Refazer" onClick={() => handleRedoEntry(entry)}>
            <Redo2 className="h-3 w-3 mr-1" /> Refazer
          </ToastAction>
        ),
      });
    }
  };

  const handleRedoEntry = async (entry: DeletedCapture) => {
    const recaptured = await remove(entry.row.id, { action: 'REDO_DELETE' });
    if (recaptured) {
      // Consume from redo stack and re-push to undo (persisted)
      history.popRedo();
      history.pushDeleted({
        row: recaptured.row,
        allocations: recaptured.allocations,
        label: entry.label,
      });
      toast({
        title: 'Lançamento excluído novamente',
        action: (
          <ToastAction altText="Desfazer" onClick={() => handleUndoEntry({
            row: recaptured.row,
            allocations: recaptured.allocations,
            deletedAt: new Date().toISOString(),
            label: entry.label,
          })}>
            <Undo2 className="h-3 w-3 mr-1" /> Desfazer
          </ToastAction>
        ),
      });
    }
  };

  const handleDelete = async (id: string) => {
    const target = data.find(t => t.id === id);
    const captured = await remove(id);
    if (captured) {
      const label = target ? `${target.description} • ${formatCurrency(Number(target.amount))}` : undefined;
      history.pushDeleted({ row: captured.row, allocations: captured.allocations, label });
      toast({
        title: 'Lançamento excluído',
        action: (
          <ToastAction altText="Desfazer" onClick={() => handleUndoEntry({
            row: captured.row,
            allocations: captured.allocations,
            deletedAt: new Date().toISOString(),
            label,
          })}>
            <Undo2 className="h-3 w-3 mr-1" /> Desfazer
          </ToastAction>
        ),
      });
    }
  };

  const lastUndo = history.undoStack[0];
  const lastRedo = history.redoStack[0];

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

      {!listComplete && (
        <Alert variant="default" className="border-warning/50 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs text-warning">
            A lista mostra as {data.length} linhas mais recentes do filtro, mas os cartões acima somam
            todos os {totals.count} lançamentos do período. Refine o filtro (ex.: "De" e "Até" no mesmo mês)
            para ver linha a linha.
          </AlertDescription>
        </Alert>
      )}

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

      {/* Persistent undo/redo bar */}
      {(lastUndo || lastRedo) && (
        <Card className="rounded-2xl border-border shadow-card">
          <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-1">
              <History className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {lastUndo
                  ? <>Última exclusão: <span className="text-card-foreground">{lastUndo.label ?? lastUndo.row?.description ?? '—'}</span></>
                  : <>Sem exclusões para desfazer. Há {history.redoStack.length} restauração{history.redoStack.length > 1 ? 'ões' : ''} para refazer.</>}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1"
                disabled={!lastUndo}
                onClick={() => lastUndo && handleUndoEntry(lastUndo)}
              >
                <Undo2 className="h-3 w-3" /> Desfazer
                {history.undoStack.length > 1 && <span className="text-muted-foreground">({history.undoStack.length})</span>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1"
                disabled={!lastRedo}
                onClick={() => lastRedo && handleRedoEntry(lastRedo)}
              >
                <Redo2 className="h-3 w-3" /> Refazer
                {history.redoStack.length > 1 && <span className="text-muted-foreground">({history.redoStack.length})</span>}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => history.clear()}
                title="Limpar histórico"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <TransactionList
        data={data}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
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
