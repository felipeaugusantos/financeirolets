import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lançamentos de linhas patrimoniais/de transferência (grupo 6 do DRE) que ainda
 * estão marcados como `affects_dre`. Somente leitura: quem decide é o usuário.
 */
export interface DreTransferRow {
  id: string;
  description: string;
  net_amount: number;
  type: string;
  status: string;
  competence_date: string;
  payment_date: string | null;
  account_id: string | null;
  categoryName: string;
  dreCode: string;
  dreName: string;
}

export function useDreTransfers(range: { from: string; to: string }) {
  const [rows, setRows] = useState<DreTransferRow[]>([]);
  const [accountNameById, setAccountNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sel = (s: string): string => s;
      const { data } = await supabase
        .from('transactions')
        .select(
          sel(
            'id, description, net_amount, type, status, competence_date, payment_date, account_id, categories!inner(name, dre_lines!inner(code, name))'
          )
        )
        .gte('competence_date', range.from)
        .lte('competence_date', range.to)
        .not('status', 'eq', 'cancelado')
        .eq('affects_dre', true)
        .limit(5000);

      const { data: accs } = await supabase.from('accounts').select('id, name');
      setAccountNameById(new Map((accs ?? []).map((a) => [a.id, a.name])));

      // O select usa string não-literal (sel) e não é inferido pelo Supabase; formato declarado aqui.
      type RawRow = Omit<DreTransferRow, 'net_amount' | 'categoryName' | 'dreCode' | 'dreName'> & {
        net_amount: number | string;
        categories: { name: string; dre_lines: { code: string; name: string } | null } | null;
      };
      const mapped: DreTransferRow[] = ((data ?? []) as unknown as RawRow[])
        .map((t) => ({
          id: t.id,
          description: t.description,
          net_amount: Number(t.net_amount) || 0,
          type: t.type,
          status: t.status,
          competence_date: t.competence_date,
          payment_date: t.payment_date,
          account_id: t.account_id,
          categoryName: t.categories?.name ?? '—',
          dreCode: t.categories?.dre_lines?.code ?? '',
          dreName: t.categories?.dre_lines?.name ?? '—',
        }))
        .filter((r) => r.dreCode.startsWith('6.'))
        .sort((a, b) => b.net_amount - a.net_amount);
      setRows(mapped);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const total = rows.reduce((s, r) => s + (r.type === 'receita' ? r.net_amount : -r.net_amount), 0);

  return { rows, total, accountNameById, loading, reload: load };
}