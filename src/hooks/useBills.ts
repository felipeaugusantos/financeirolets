import { useState, useEffect, useCallback } from 'react';
import { todayLocalISO } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

export interface BillRow {
  id: string;
  type: 'receita' | 'despesa';
  description: string;
  net_amount: number;
  due_date: string | null;
  payment_date: string | null;
  status: 'pendente' | 'pago' | 'recebido' | 'cancelado' | 'agendado';
  payment_method: string | null;
  partner_id: string | null;
  account_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_recurring?: boolean;
  recurrence_parent_id?: string | null;
  partner?: {
    name: string;
    pix_key: string | null;
    pix_key_type: string | null;
    bank_name: string | null;
    bank_agency: string | null;
    bank_account: string | null;
  } | null;
  account?: { name: string } | null;
  category?: { name: string } | null;
  unit?: { name: string } | null;
}

export interface BillSummary {
  totalPagar: number;
  totalReceber: number;
  vencidasPagar: number;
  vencidasReceber: number;
  vencendoHoje: number;
}

export interface BillFilters {
  dateFrom?: string | null;
  dateTo?: string | null;
  partnerId?: string | null;
  unitId?: string | null;
}

export function useBills(tab: 'pagar' | 'receber', filters?: BillFilters) {
  const [data, setData] = useState<BillRow[]>([]);
  const [summary, setSummary] = useState<BillSummary>({
    totalPagar: 0, totalReceber: 0, vencidasPagar: 0, vencidasReceber: 0, vencendoHoje: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = todayLocalISO();
    const type = tab === 'pagar' ? 'despesa' : 'receita';

    let query = supabase
      .from('transactions')
      .select(`
        id, type, description, net_amount, due_date, payment_date, status,
        payment_method, partner_id, account_id, installment_number, installment_total,
        is_recurring, recurrence_parent_id,
        partner:partners(name, pix_key, pix_key_type, bank_name, bank_agency, bank_account),
        account:accounts(name),
        category:categories(name),
        unit:units(name)
      `)
      .eq('type', type)
      .in('status', ['pendente', 'agendado'] as Database['public']['Enums']['transaction_status'][]);

    if (filters?.dateFrom) query = query.gte('due_date', filters.dateFrom);
    if (filters?.dateTo) query = query.lte('due_date', filters.dateTo);
    if (filters?.partnerId) query = query.eq('partner_id', filters.partnerId);
    if (filters?.unitId) query = query.eq('unit_id', filters.unitId);

    const { data: rows, error } = await query.order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: 'Erro ao carregar contas', description: error.message, variant: 'destructive' });
      setData([]);
    } else {
      setData((rows ?? []) as unknown as BillRow[]);
    }

    // Summary across both types
    const { data: allPending } = await supabase
      .from('transactions')
      .select('type, net_amount, due_date, status')
      .in('status', ['pendente', 'agendado'] as Database['public']['Enums']['transaction_status'][]);

    const s: BillSummary = { totalPagar: 0, totalReceber: 0, vencidasPagar: 0, vencidasReceber: 0, vencendoHoje: 0 };
    (allPending ?? []).forEach((tx) => {
      const val = Number(tx.net_amount) || 0;
      const overdue = tx.due_date && tx.due_date < today;
      const dueToday = tx.due_date === today;
      if (tx.type === 'despesa') {
        s.totalPagar += val;
        if (overdue) s.vencidasPagar += val;
      } else {
        s.totalReceber += val;
        if (overdue) s.vencidasReceber += val;
      }
      if (dueToday) s.vencendoHoje++;
    });
    setSummary(s);
    setLoading(false);
  }, [tab, toast, filters?.dateFrom, filters?.dateTo, filters?.partnerId, filters?.unitId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const markAs = async (id: string, status: 'pago' | 'recebido', accountId?: string, paymentMethod?: string) => {
    const payment_date = todayLocalISO();
    const updateData: Record<string, unknown> = { status, payment_date };
    if (accountId) updateData.account_id = accountId;
    if (paymentMethod) updateData.payment_method = paymentMethod;

    const { error } = await supabase.from('transactions').update(updateData).eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: `Marcado como ${status}` });
    await fetchData();
    return true;
  };

  return { data, summary, loading, fetchData, markAs };
}
