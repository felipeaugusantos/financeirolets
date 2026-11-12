import { useEffect, useState } from 'react';
import { Scale, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dreBalanceCheck, type BalanceAccount, type BalanceSnapshot } from '@/lib/dreBalanceCheck';
import type { DreFilters, DreLineResult } from '@/hooks/useDreReport';
import { cn } from '@/lib/utils';

const money = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value.split('-').reverse().join('/');

export default function DreBalanceCard({ filters, lines }: { filters: DreFilters; lines: DreLineResult[] }) {
  const [data, setData] = useState<{ accounts: BalanceAccount[]; snapshots: BalanceSnapshot[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    const openingDate = dreBalanceCheck([], [], filters.dateFrom, filters.dateTo, null).openingDate;
    async function load() {
      const accounts = await supabase.from('accounts').select('id, name').eq('type', 'banco');
      if (accounts.error) throw accounts.error;
      const snapshots: BalanceSnapshot[] = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await supabase.from('bank_balance_snapshots')
          .select('id, account_id, ref_date, ledger_balance, checking_balance, created_at')
          .in('ref_date', [openingDate, filters.dateTo]).order('id').range(offset, offset + 999);
        if (page.error) throw page.error;
        snapshots.push(...(page.data ?? []));
        if ((page.data?.length ?? 0) < 1000) break;
      }
      if (!cancelled) setData({ accounts: accounts.data ?? [], snapshots });
    }
    void load().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [filters.dateFrom, filters.dateTo, lines]);

  const resultLine = lines.find(l => l.code === '8');
  const result = resultLine?.value ?? null;
  const check = data ? dreBalanceCheck(data.accounts, data.snapshots, filters.dateFrom, filters.dateTo, result) : null;
  const restricted = !!(filters.unit_id || filters.category_id || filters.payment_method);
  const comparable = !!check?.complete && !restricted && filters.regime === 'caixa' && result !== null;
  const matched = comparable && check?.deviation === 0;
  return (
    <Card aria-label="Batimento de saldo" className="border-border">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Scale className="h-5 w-5 text-secondary" />Batimento de saldo</CardTitle>
        <span className={cn('flex items-center gap-1.5 text-xs font-medium', matched ? 'text-success' : 'text-muted-foreground')}>
          {!data && !error ? <Loader2 className="h-4 w-4 animate-spin" /> : matched ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {error ? 'Consulta indisponível' : !data ? 'Consultando saldos' : !check?.complete ? 'Extratos incompletos' : !comparable ? 'Comparação informativa' : matched ? 'Saldos conferem' : 'Desvio identificado'}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Saldo inicial do extrato', value: check?.opening ?? null, hint: date(check?.openingDate ?? filters.dateFrom) },
            { label: 'Saldo esperado pelo DRE', value: check?.expected ?? null, hint: `Inicial + ${resultLine?.name ?? 'Fluxo de Caixa Retido'} (${money(result)})` },
            { label: 'Saldo final do extrato', value: check?.closing ?? null, hint: date(filters.dateTo) },
            { label: 'Desvio · extrato − esperado', value: check?.deviation ?? null, hint: comparable ? (matched ? 'Sem diferença' : 'Diferença a conferir') : 'Não representa erro de conciliação' },
          ].map(item => <div key={item.label} className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={cn('break-words text-xl font-semibold tabular-nums', item.label.startsWith('Desvio') && comparable && (matched ? 'text-success' : 'text-destructive'))}>{money(item.value)}</p>
            <p className="break-words text-xs text-muted-foreground">{item.hint}</p>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">
          {error ? 'Não foi possível consultar os saldos bancários. Gere o relatório novamente para tentar.' : !data ? 'Aguardando saldos bancários.' : !check?.complete ? `Sem saldo bancário nas duas datas para ${check?.missing.join(', ') || 'as contas bancárias'}. Saldos ausentes não são considerados zero.` : 'Saldos consolidados das contas bancárias, sem limite de crédito ou investimentos.'}
          {filters.regime !== 'caixa' && ' Em competência, o resultado inclui valores de períodos diferentes dos recebimentos e pagamentos; o desvio é apenas informativo.'}
          {restricted && ' O DRE está filtrado, mas o extrato é consolidado: os escopos são diferentes.'}
          {result === null && ' A linha Fluxo de Caixa Retido (8) não está disponível para comparação.'}
          {' Transferências, valores fora do DRE e movimentos sem efeito no resultado também podem gerar diferenças.'}
        </p>
      </CardContent>
    </Card>
  );
}