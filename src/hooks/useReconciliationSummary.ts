import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { reconciliationSummary, type ReconciliationEntry, type ReconciliationSnapshot, type ReconciliationTransaction } from '@/lib/reconciliationSummary';

/** Paginated reads preserve totals above PostgREST's row limit. */
async function readPages<T>(query: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await query(offset);
    if (page.error) throw new Error(page.error.message);
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 1000) return rows;
  }
}

export function useReconciliationSummary(from: string, to: string, unitId?: string, refreshKey?: number | null) {
  const [data, setData] = useState<ReturnType<typeof reconciliationSummary> | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    let running = false;
    setData(null);
    setError(false);
    const load = async () => {
      if (running) return;
      running = true;
      if (alive) setRefreshing(true);
      try {
        if (from > to) throw new Error('Período inválido');
        const accounts = await readPages(offset => {
          let q = supabase.from('accounts').select('id, name, initial_balance, initial_balance_date')
            .eq('active', true).eq('type', 'banco');
          if (unitId) q = q.eq('default_unit_id', unitId);
          return q.order('id').range(offset, offset + 999);
        });
        const groups = await Promise.all(accounts.map(async account => {
          const [entries, snapshots, transactions] = await Promise.all([
            readPages<ReconciliationEntry>(offset => supabase.from('bank_statement_entries')
              .select('account_id, status, amount').eq('account_id', account.id)
              .gte('posted_at', from).lte('posted_at', to).order('id').range(offset, offset + 999)),
            readPages<ReconciliationSnapshot>(offset => supabase.from('bank_balance_snapshots')
              .select('account_id, ref_date, ledger_balance, checking_balance, created_at')
              .eq('account_id', account.id).eq('ref_date', to).order('id').range(offset, offset + 999)),
            readPages<ReconciliationTransaction>(offset => {
              let q = supabase.from('transactions').select('account_id, type, amount, net_amount, payment_date')
                .eq('account_id', account.id).in('status', ['pago', 'recebido'])
                .eq('affects_cashflow', true).lte('payment_date', to);
              if (account.initial_balance_date) q = q.gt('payment_date', account.initial_balance_date);
              return q.order('id').range(offset, offset + 999);
            }),
          ]);
          return { entries, snapshots, transactions };
        }));
        if (!alive) return;
        setData(reconciliationSummary(accounts, groups.flatMap(g => g.entries), groups.flatMap(g => g.snapshots), groups.flatMap(g => g.transactions), to));
        setError(false);
      } catch { if (alive) setError(true); }
      finally { running = false; if (alive) setRefreshing(false); }
    };
    void load();
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [from, to, unitId, refreshKey, retry]);
  return { data, error, refreshing, reload: () => setRetry(v => v + 1) };
}