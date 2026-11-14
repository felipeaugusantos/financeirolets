import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, RefreshCw, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useReconciliationSummary } from '@/hooks/useReconciliationSummary';
import type { ClosingStatus } from '@/lib/reconciliationSummary';

const labels: Record<ClosingStatus, string> = {
  sem_extrato: 'Sem extrato', pendente: 'Em andamento', sem_saldo: 'Saldo não verificado',
  divergente: 'Saldo divergente', fechado: 'Fechamento conferido',
};
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ReconciliationCard({ from, to, unitId, refreshKey }: { from: string; to: string; unitId?: string; refreshKey?: number | null }) {
  const { data, error, refreshing, reload } = useReconciliationSummary(from, to, unitId, refreshKey);
  const href = (accountId?: string) => `/conciliacao/conciliar?${new URLSearchParams({ from, to, ...(accountId ? { accountId } : {}) })}`;
  const allClosed = !!data?.rows.length && data.closedCount === data.rows.length;
  return (
    <Card aria-label="Conciliação bancária executiva" className="border-border shadow-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-5 w-5 text-secondary" />Conciliação bancária</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={reload} disabled={refreshing} aria-label="Atualizar conciliação" title="Atualizar conciliação">
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" asChild><Link to={href()}>Abrir conciliação<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" aria-busy={refreshing}>
        {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">Não foi possível consultar a conciliação.<Button variant="outline" size="sm" onClick={reload}>Tentar novamente</Button></div>
          : !data ? <Skeleton className="h-28 w-full" /> : <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">Progresso do extrato</p>
                <p className="text-2xl font-heading font-bold tabular-nums">{data.pct}%</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso da conciliação" aria-valuenow={data.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cn('h-full transition-all motion-reduce:transition-none', data.total > 0 && data.pendingCount === 0 ? 'bg-success' : 'bg-secondary')} style={{ width: `${data.pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{data.done} de {data.total} linhas resolvidas · {data.pendingCount} pendentes</p>
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">Saldo líquido pendente</p>
                <p className={cn('break-words text-2xl font-heading font-bold tabular-nums', data.pendingCount ? 'text-warning' : 'text-success')}>{money(data.pendingBalance)}</p>
                <p className="text-xs text-muted-foreground">Entradas {money(data.incoming)} · Saídas {money(data.outgoing)}</p>
                <p className="text-xs text-muted-foreground">Total a conciliar: {money(data.pendingVolume)}</p>
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">Status de fechamento</p>
                <Badge variant="outline" className={cn('whitespace-normal', allClosed ? 'border-success/40 text-success' : 'text-muted-foreground')}>
                  {allClosed && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                  {!data.rows.length ? 'Sem contas bancárias' : allClosed ? 'Fechamento conferido' : data.pendingCount ? 'Em andamento' : data.total ? 'A conferir' : 'Sem extrato no período'}
                </Badge>
                <p className="text-xs text-muted-foreground">{data.closedCount} de {data.rows.length} contas com saldo conferido</p>
              </div>
            </div>
            <div className="divide-y divide-border border-t border-border">
              {data.rows.map(row => <Link key={row.id} to={href(row.id)} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-muted/40">
                <span className="min-w-0 break-words font-medium">{row.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">{row.pct}% · {row.pendingCount} pendentes</span>
                  <span className={cn(row.status === 'fechado' ? 'text-success' : row.status === 'divergente' ? 'text-destructive' : 'text-muted-foreground')}>{labels[row.status]}</span>
                  {row.difference !== null && row.difference !== 0 && <span className="text-destructive">Desvio {money(row.difference)}</span>}<ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>)}
            </div>
          </>}
        <p className="text-xs text-muted-foreground">Extratos de {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')} · {unitId ? 'Contas vinculadas à unidade selecionada' : 'Todas as contas bancárias ativas'}. Sem filtro por frente de negócio ou competência. Fechamento exige saldo bancário na data final e saldo inicial configurado.</p>
      </CardContent>
    </Card>
  );
}