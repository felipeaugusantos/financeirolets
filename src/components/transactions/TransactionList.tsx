import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MoreHorizontal, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import type { TransactionRow } from '@/hooks/useTransactions';

interface Props {
  data: TransactionRow[];
  loading: boolean;
  onEdit: (tx: TransactionRow) => void;
  onDelete: (id: string) => void;
  onMarkAs: (id: string, status: 'pago' | 'recebido') => void;
}

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning-foreground))] border-[hsl(var(--warning))]/30',
  pago: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  recebido: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  cancelado: 'bg-destructive/15 text-destructive border-destructive/30',
  agendado: 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
  agendado: 'Agendado',
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function TransactionList({ data, loading, onEdit, onDelete, onMarkAs }: Props) {
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="shadow-card rounded-2xl border-border">
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Nenhum lançamento encontrado.</p>
          <p className="text-sm text-muted-foreground mt-1">Clique em "+ Novo" para começar.</p>
        </CardContent>
      </Card>
    );
  }

  const Actions = ({ tx }: { tx: TransactionRow }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(tx)}>
          <Pencil className="h-3 w-3 mr-2" /> Editar
        </DropdownMenuItem>
        {tx.status === 'pendente' && (
          <DropdownMenuItem onClick={() => onMarkAs(tx.id, tx.type === 'receita' ? 'recebido' : 'pago')}>
            <CheckCircle className="h-3 w-3 mr-2" /> Marcar como {tx.type === 'receita' ? 'recebido' : 'pago'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-destructive" onClick={() => onDelete(tx.id)}>
          <Trash2 className="h-3 w-3 mr-2" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isMobile) {
    return (
      <div className="space-y-2">
        {data.map(tx => (
          <Card key={tx.id} className="rounded-2xl border-border shadow-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${tx.type === 'receita' ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                      {tx.type === 'receita' ? '▲' : '▼'}
                    </span>
                    <p className="text-sm font-medium truncate text-card-foreground">{tx.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(tx.competence_date), 'dd/MM/yy')}</span>
                    {tx.category && <span>• {tx.category.name}</span>}
                  </div>
                  {tx.installment_total && (
                    <span className="text-[10px] text-muted-foreground">{tx.installment_number}/{tx.installment_total}</span>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className={`text-sm font-semibold ${tx.type === 'receita' ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                    {tx.type === 'receita' ? '+' : '-'} {formatCurrency(Number(tx.net_amount))}
                  </span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[tx.status] || ''}`}>
                    {STATUS_LABELS[tx.status]}
                  </Badge>
                </div>
                <Actions tx={tx} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card className="rounded-2xl border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs">Data</TableHead>
            <TableHead className="text-xs">Descrição</TableHead>
            <TableHead className="text-xs">Categoria</TableHead>
            <TableHead className="text-xs text-right">Valor</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(tx => (
            <TableRow key={tx.id} className="hover:bg-muted/30">
              <TableCell className="text-xs text-muted-foreground">
                {format(new Date(tx.competence_date), 'dd/MM/yy')}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${tx.type === 'receita' ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                    {tx.type === 'receita' ? '▲' : '▼'}
                  </span>
                  <span className="text-sm text-card-foreground">{tx.description}</span>
                  {tx.installment_total && (
                    <span className="text-[10px] text-muted-foreground">{tx.installment_number}/{tx.installment_total}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{tx.category?.name || '—'}</TableCell>
              <TableCell className={`text-sm font-semibold text-right ${tx.type === 'receita' ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                {tx.type === 'receita' ? '+' : '-'} {formatCurrency(Number(tx.net_amount))}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[tx.status] || ''}`}>
                  {STATUS_LABELS[tx.status]}
                </Badge>
              </TableCell>
              <TableCell><Actions tx={tx} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
