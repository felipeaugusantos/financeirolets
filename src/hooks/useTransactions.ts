import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface TransactionRow {
  id: string;
  type: 'receita' | 'despesa';
  description: string;
  amount: number;
  tax_amount: number;
  net_amount: number;
  competence_date: string;
  due_date: string | null;
  payment_date: string | null;
  status: 'pendente' | 'pago' | 'recebido' | 'cancelado' | 'agendado';
  payment_method: string | null;
  category_id: string | null;
  account_id: string | null;
  partner_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_recurring?: boolean;
  recurrence_frequency?: 'semanal' | 'mensal' | 'anual' | null;
  recurrence_end_date?: string | null;
  recurrence_parent_id?: string | null;
  affects_dre?: boolean;
  affects_cashflow?: boolean;
  card_sale_group_id?: string | null;
  // joined
  category?: { name: string; type: string } | null;
  account?: { name: string } | null;
  partner?: { name: string } | null;
  unit?: { name: string } | null;
  front?: { name: string } | null;
}

export interface TransactionFilters {
  search?: string;
  type?: 'receita' | 'despesa' | '';
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  category_id?: string;
  account_id?: string;
  unit_id?: string;
  front_id?: string;
  partner_id?: string;
  payment_method?: string;
}

export interface AllocationInput {
  unit_id?: string;
  front_id?: string;
  allocation_type: 'percentual' | 'valor';
  percentage?: number;
  amount?: number;
}

export interface TransactionInput {
  type: 'receita' | 'despesa';
  description: string;
  amount: number;
  tax_amount: number;
  competence_date: string;
  due_date?: string;
  payment_date?: string;
  status: string;
  payment_method?: string;
  category_id?: string;
  account_id?: string;
  partner_id?: string;
  unit_id?: string;
  front_id?: string;
  notes?: string;
  is_installment?: boolean;
  installment_count?: number;
  allocations?: AllocationInput[];
  files?: File[];
  is_recurring?: boolean;
  recurrence_frequency?: 'semanal' | 'mensal' | 'anual';
  recurrence_end_date?: string;
  affects_dre?: boolean;
  affects_cashflow?: boolean;
  card_sale_group_id?: string | null;
}

export function useTransactions(filters: TransactionFilters = {}) {
  const [data, setData] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ receitas: 0, despesas: 0, saldo: 0 });
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('transactions')
      .select(`
        *,
        category:categories(name, type),
        account:accounts(name),
        partner:partners(name),
        unit:units(name),
        front:business_fronts(name)
      `)
      .order('competence_date', { ascending: false });

    if (filters.type) query = query.eq('type', filters.type as any);
    if (filters.status) query = query.eq('status', filters.status as any);
    if (filters.category_id) query = filters.category_id === '__null__' ? query.is('category_id', null) : query.eq('category_id', filters.category_id);
    if (filters.account_id) query = filters.account_id === '__null__' ? query.is('account_id', null) : query.eq('account_id', filters.account_id);
    if (filters.unit_id) query = filters.unit_id === '__null__' ? query.is('unit_id', null) : query.eq('unit_id', filters.unit_id);
    if (filters.front_id) query = filters.front_id === '__null__' ? query.is('front_id', null) : query.eq('front_id', filters.front_id);
    if (filters.partner_id) query = filters.partner_id === '__null__' ? query.is('partner_id', null) : query.eq('partner_id', filters.partner_id);
    if (filters.payment_method) query = filters.payment_method === '__null__' ? query.is('payment_method', null) : query.eq('payment_method', filters.payment_method as any);
    if (filters.dateFrom) query = query.gte('competence_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('competence_date', filters.dateTo);
    if (filters.search) {
      const raw = filters.search.trim();
      // Tenta interpretar como valor numérico (pt-BR: "1.234,56" ou "100,50" ou "100.50" ou "100")
      const normalized = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const asNumber = Number(normalized);
      const isNumeric = normalized !== '' && !isNaN(asNumber) && /^[\d.,]+$/.test(raw);
      if (isNumeric) {
        const safe = raw.replace(/[%,()]/g, ' ');
        query = query.or(
          `description.ilike.%${safe}%,amount.eq.${asNumber},net_amount.eq.${asNumber}`
        );
      } else {
        query = query.ilike('description', `%${raw}%`);
      }
    }

    const { data: rows, error } = await query;
    if (error) {
      toast({ title: 'Erro ao carregar lançamentos', description: error.message, variant: 'destructive' });
      setData([]);
    } else {
      const typed = (rows ?? []) as unknown as TransactionRow[];
      setData(typed);
      const receitas = typed.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.net_amount), 0);
      const despesas = typed.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.net_amount), 0);
      setTotals({ receitas, despesas, saldo: receitas - despesas });
    }
    setLoading(false);
  }, [filters.type, filters.status, filters.category_id, filters.account_id, filters.unit_id, filters.front_id, filters.partner_id, filters.payment_method, filters.dateFrom, filters.dateTo, filters.search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const create = async (input: TransactionInput) => {
    if (!user) return false;
    const net = input.amount - input.tax_amount;
    const count = input.is_installment && input.installment_count && input.installment_count > 1 ? input.installment_count : 1;
    const groupId = count > 1 ? crypto.randomUUID() : null;
    const perAmount = Math.round((input.amount / count) * 100) / 100;
    const perTax = Math.round((input.tax_amount / count) * 100) / 100;
    const perNet = Math.round((net / count) * 100) / 100;

    const baseRow = {
      type: input.type as any,
      description: input.description,
      status: input.status as any,
      payment_method: (input.payment_method || null) as any,
      category_id: input.category_id || null,
      account_id: input.account_id || null,
      partner_id: input.partner_id || null,
      unit_id: input.unit_id || null,
      front_id: input.front_id || null,
      notes: input.notes || null,
      created_by: user.id,
      affects_dre: input.affects_dre ?? true,
      affects_cashflow: input.affects_cashflow ?? true,
      card_sale_group_id: input.card_sale_group_id ?? null,
      // Recorrência só é aplicada à 1ª linha (matriz). Veja loop abaixo.
    };

    const isRecurring = !!input.is_recurring && !!input.recurrence_frequency && count === 1;

    const rows = Array.from({ length: count }, (_, i) => {
      let dueDate: string | null = null;
      if (input.due_date) {
        const base = new Date(input.due_date + 'T12:00:00');
        base.setMonth(base.getMonth() + i);
        dueDate = base.toISOString().split('T')[0];
      }
      return {
        ...baseRow,
        amount: perAmount,
        tax_amount: perTax,
        net_amount: perNet,
        competence_date: input.competence_date,
        due_date: dueDate,
        payment_date: i === 0 ? (input.payment_date || null) : null,
        installment_group_id: groupId,
        installment_number: count > 1 ? i + 1 : null,
        installment_total: count > 1 ? count : null,
        is_recurring: i === 0 && isRecurring,
        recurrence_frequency: i === 0 && isRecurring ? (input.recurrence_frequency as any) : null,
        recurrence_end_date: i === 0 && isRecurring ? (input.recurrence_end_date || null) : null,
      };
    });

    const { data: inserted, error } = await supabase.from('transactions').insert(rows).select();
    if (error) {
      toast({ title: 'Erro ao criar lançamento', description: error.message, variant: 'destructive' });
      return false;
    }

    // Allocations
    if (input.allocations && input.allocations.length > 0 && inserted) {
      const allocs = inserted.flatMap(tx =>
        input.allocations!.map(a => ({
          transaction_id: tx.id,
          unit_id: (a.unit_id && a.unit_id !== '__none__') ? a.unit_id : null,
          front_id: (a.front_id && a.front_id !== '__none__') ? a.front_id : null,
          allocation_type: a.allocation_type as any,
          percentage: a.percentage ?? null,
          amount: a.amount ?? null,
        }))
      );
      const { error: allocErr } = await supabase.from('transaction_allocations').insert(allocs);
      if (allocErr) {
        console.error('Allocation insert error:', allocErr);
        toast({ title: 'Erro ao salvar rateio', description: allocErr.message, variant: 'destructive' });
      }
    }

    // File uploads
    if (input.files && input.files.length > 0 && inserted) {
      const firstTxId = inserted[0].id;
      for (const file of input.files) {
        const path = `${user.id}/${firstTxId}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage.from('attachments').upload(path, file);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
          await supabase.from('attachments').insert({
            transaction_id: firstTxId,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user.id,
          });
        }
      }
    }

    toast({ title: 'Lançamento criado com sucesso' });
    await fetchData();
    return true;
  };

  const update = async (id: string, input: Partial<TransactionInput>) => {
    const updateData: Record<string, unknown> = {};
    if (input.type !== undefined) updateData.type = input.type;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.amount !== undefined) updateData.amount = input.amount;
    if (input.tax_amount !== undefined) updateData.tax_amount = input.tax_amount;
    if (input.amount !== undefined || input.tax_amount !== undefined) {
      const amt = input.amount ?? 0;
      const tax = input.tax_amount ?? 0;
      updateData.net_amount = amt - tax;
    }
    if (input.competence_date !== undefined) updateData.competence_date = input.competence_date;
    if (input.due_date !== undefined) updateData.due_date = input.due_date || null;
    if (input.payment_date !== undefined) updateData.payment_date = input.payment_date || null;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.payment_method !== undefined) updateData.payment_method = input.payment_method || null;
    if (input.category_id !== undefined) updateData.category_id = input.category_id || null;
    if (input.account_id !== undefined) updateData.account_id = input.account_id || null;
    if (input.partner_id !== undefined) updateData.partner_id = input.partner_id || null;
    if (input.unit_id !== undefined) updateData.unit_id = input.unit_id || null;
    if (input.front_id !== undefined) updateData.front_id = input.front_id || null;
    if (input.notes !== undefined) updateData.notes = input.notes || null;
    if (input.is_recurring !== undefined) updateData.is_recurring = input.is_recurring;
    if (input.recurrence_frequency !== undefined) updateData.recurrence_frequency = input.recurrence_frequency || null;
    if (input.recurrence_end_date !== undefined) updateData.recurrence_end_date = input.recurrence_end_date || null;
    if (input.affects_dre !== undefined) updateData.affects_dre = input.affects_dre;
    if (input.affects_cashflow !== undefined) updateData.affects_cashflow = input.affects_cashflow;

    const { error } = await supabase.from('transactions').update(updateData).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      return false;
    }

    // Update allocations if provided
    if (input.allocations !== undefined) {
      await supabase.from('transaction_allocations').delete().eq('transaction_id', id);
      if (input.allocations && input.allocations.length > 0) {
        const allocs = input.allocations.map(a => ({
          transaction_id: id,
          unit_id: (a.unit_id && a.unit_id !== '__none__') ? a.unit_id : null,
          front_id: (a.front_id && a.front_id !== '__none__') ? a.front_id : null,
          allocation_type: a.allocation_type as any,
          percentage: a.percentage ?? null,
          amount: a.amount ?? null,
        }));
        const { error: allocErr } = await supabase.from('transaction_allocations').insert(allocs);
        if (allocErr) {
          console.error('Allocation update error:', allocErr);
          toast({ title: 'Erro ao salvar rateio', description: allocErr.message, variant: 'destructive' });
        }
      }
    }
    toast({ title: 'Atualizado com sucesso' });
    await fetchData();
    return true;
  };

  const remove = async (id: string, opts?: { action?: 'DELETE' | 'REDO_DELETE' }): Promise<{ row: any; allocations: any[] } | null> => {
    const backup = [...data];
    // Capture row + allocations BEFORE deleting so we can undo
    const { data: rowFull } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle();
    const { data: allocs } = await supabase.from('transaction_allocations').select('*').eq('transaction_id', id);

    // Optimistic removal from UI
    setData(prev => prev.filter(t => t.id !== id));

    // Delete attachments first (no CASCADE on FK)
    await supabase.from('attachments').delete().eq('transaction_id', id);

    // Delete transaction and verify it was actually removed
    const { data: deleted, error } = await supabase.from('transactions').delete().eq('id', id).select();
    if (error || !deleted || deleted.length === 0) {
      toast({ title: 'Erro ao excluir', description: error?.message || 'Não foi possível excluir o lançamento. Verifique suas permissões.', variant: 'destructive' });
      setData(backup); // revert
      return null;
    }
    // Audit log (DELETE / REDO_DELETE)
    try {
      await supabase.rpc('log_transaction_action' as any, {
        _record_id: id,
        _action: opts?.action ?? 'DELETE',
        _old_data: { row: rowFull, allocations: allocs ?? [] } as any,
        _new_data: null as any,
        _context: 'transactions',
      });
    } catch (e) {
      console.warn('Audit log failed', e);
    }
    // Recalculate totals from current state
    setData(prev => {
      const receitas = prev.filter(t => t.type === 'receita').reduce((s, t) => s + Number(t.net_amount), 0);
      const despesas = prev.filter(t => t.type === 'despesa').reduce((s, t) => s + Number(t.net_amount), 0);
      setTotals({ receitas, despesas, saldo: receitas - despesas });
      return prev;
    });
    return { row: rowFull, allocations: allocs ?? [] };
  };

  const restore = async (captured: { row: any; allocations: any[] }) => {
    if (!captured?.row) return false;
    const { category, account, partner, unit, front, ...rowOnly } = captured.row;
    const { error } = await supabase.from('transactions').insert(rowOnly as any);
    if (error) {
      toast({ title: 'Erro ao restaurar', description: error.message, variant: 'destructive' });
      return false;
    }
    if (captured.allocations.length > 0) {
      await supabase.from('transaction_allocations').insert(captured.allocations as any);
    }
    try {
      await supabase.rpc('log_transaction_action' as any, {
        _record_id: rowOnly.id,
        _action: 'UNDO_DELETE',
        _old_data: null as any,
        _new_data: { row: rowOnly, allocations: captured.allocations } as any,
        _context: 'transactions',
      });
    } catch (e) {
      console.warn('Audit log (UNDO_DELETE) failed', e);
    }
    await fetchData();
    return true;
  };

  const markAs = async (id: string, status: 'pago' | 'recebido') => {
    const payment_date = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('transactions').update({ status, payment_date }).eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: `Marcado como ${status}` });
    await fetchData();
    return true;
  };

  const generateRecurring = async () => {
    const { data, error } = await supabase.rpc('generate_recurring_transactions' as any);
    if (error) {
      toast({ title: 'Erro ao gerar recorrências', description: error.message, variant: 'destructive' });
      return 0;
    }
    const count = (data as number) ?? 0;
    toast({
      title: count > 0 ? `${count} lançamento(s) gerados` : 'Tudo em dia',
      description: count > 0 ? 'Próximas ocorrências de lançamentos recorrentes foram criadas.' : 'Nenhuma nova ocorrência a gerar.',
    });
    if (count > 0) await fetchData();
    return count;
  };

  return { data, loading, totals, fetchData, create, update, remove, restore, markAs, generateRecurring };
}
