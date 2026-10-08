import { useState, useEffect, useCallback } from 'react';
import { todayLocalISO, toLocalISODate, errorMessage } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json, Tables, TablesInsert } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { FilterableQuery } from '@/lib/finance';
import { callRpc, transactionRpcError } from '@/lib/rpc';
import { EMPTY_TOTALS, PAGE_SIZE, sumAllPages, sumTotals, Totals, TotalsRow } from '@/lib/transactionTotals';

type Enums = Database['public']['Enums'];

/** Linha de transactions + alocações capturadas antes de excluir (para desfazer). */
export interface DeletedCapture {
  row: (Tables<'transactions'> & Record<string, unknown>) | null;
  allocations: Tables<'transaction_allocations'>[];
}

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
  /**
   * Visão do Dashboard: 'caixa' = pagos/recebidos que afetam o caixa, período pela data de pagamento;
   * 'dashboard' = o mesmo + provisionados que afetam o DRE, período pela competência.
   */
  regime?: 'caixa' | 'dashboard';
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
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  /** false quando a lista exibida é apenas a primeira página do resultado. */
  const [listComplete, setListComplete] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  /** Aplica exatamente os mesmos filtros na listagem e na agregação de totais. */
  const applyFilters = useCallback(<Q,>(q: Q): Q => {
    // O tipo recursivo do builder estoura o compilador; trabalhamos no subconjunto acima.
    let query = q as unknown as FilterableQuery;
    if (filters.type) query = query.eq('type', filters.type as Enums['transaction_type']);
    if (filters.status) query = query.eq('status', filters.status as Enums['transaction_status']);
    if (filters.category_id) query = filters.category_id === '__null__' ? query.is('category_id', null) : query.eq('category_id', filters.category_id);
    if (filters.account_id) query = filters.account_id === '__null__' ? query.is('account_id', null) : query.eq('account_id', filters.account_id);
    if (filters.unit_id) query = filters.unit_id === '__null__' ? query.is('unit_id', null) : query.eq('unit_id', filters.unit_id);
    if (filters.front_id) query = filters.front_id === '__null__' ? query.is('front_id', null) : query.eq('front_id', filters.front_id);
    if (filters.partner_id) query = filters.partner_id === '__null__' ? query.is('partner_id', null) : query.eq('partner_id', filters.partner_id);
    if (filters.payment_method) query = filters.payment_method === '__null__' ? query.is('payment_method', null) : query.eq('payment_method', filters.payment_method as Enums['payment_method']);
    if (filters.regime === 'caixa') {
      query = query.in('status', ['pago', 'recebido']).eq('affects_cashflow', true);
      if (filters.dateFrom) query = query.gte('payment_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('payment_date', filters.dateTo);
    } else if (filters.regime === 'dashboard' && filters.dateFrom && filters.dateTo) {
      const paid = `status.in.(pago,recebido),affects_cashflow.eq.true,payment_date.gte.${filters.dateFrom},payment_date.lte.${filters.dateTo}`;
      const prov = `status.in.(pendente,agendado),affects_dre.eq.true,competence_date.gte.${filters.dateFrom},competence_date.lte.${filters.dateTo}`;
      query = query.not('status', 'eq', 'cancelado').or(`and(${paid}),and(${prov})`);
    } else {
      if (filters.dateFrom) query = query.gte('competence_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('competence_date', filters.dateTo);
    }
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

    return query as unknown as Q;
  }, [filters.type, filters.status, filters.category_id, filters.account_id, filters.unit_id, filters.front_id, filters.partner_id, filters.payment_method, filters.dateFrom, filters.dateTo, filters.regime, filters.search]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // 1) Lista exibida — limitada a uma página do backend.
    const listQuery = applyFilters(
      supabase
        .from('transactions')
        .select(`
          *,
          category:categories(name, type),
          account:accounts(name),
          partner:partners(name),
          unit:units(name),
          front:business_fronts(name)
        `)
    )
      .order('competence_date', { ascending: false })
      .order('id', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    // 2) Totais — agregação de TODAS as linhas do filtro, em páginas.
    // A ordenação precisa ser ESTÁVEL (id como desempate): sem isso, linhas com
    // a mesma data trocam de lugar entre uma página e outra, e a soma duplica
    // ou perde lançamentos nas bordas.
    const totalsPromise = sumAllPages(async (fromIdx, toIdx) => {
      const { data: rows, error } = await applyFilters(
        supabase.from('transactions').select('id, type, net_amount, status')
      )
        .order('competence_date', { ascending: false })
        .order('id', { ascending: false })
        .range(fromIdx, toIdx);
      if (error) throw error;
      return (rows ?? []) as TotalsRow[];
    });

    const [listRes, aggregated] = await Promise.all([
      listQuery,
      totalsPromise.catch((err: unknown) => {
        toast({ title: 'Erro ao somar os totais', description: errorMessage(err), variant: 'destructive' });
        return null;
      }),
    ]);

    if (listRes.error) {
      toast({ title: 'Erro ao carregar lançamentos', description: listRes.error.message, variant: 'destructive' });
      setData([]);
      setTotals(EMPTY_TOTALS);
      setListComplete(true);
    } else {
      const typed = (listRes.data ?? []) as unknown as TransactionRow[];
      setData(typed);
      const complete = typed.length < PAGE_SIZE;
      setListComplete(complete);
      setTotals(aggregated ?? sumTotals(typed));
    }
    setLoading(false);
  }, [applyFilters, toast]);

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
      type: input.type as Enums['transaction_type'],
      description: input.description,
      status: input.status as Enums['transaction_status'],
      payment_method: (input.payment_method || null) as Enums['payment_method'] | null,
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
        dueDate = toLocalISODate(base);
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
        recurrence_frequency: i === 0 && isRecurring ? (input.recurrence_frequency as Enums['recurrence_frequency']) : null,
        recurrence_end_date: i === 0 && isRecurring ? (input.recurrence_end_date || null) : null,
      };
    });

    // Lançamentos e rateio entram NA MESMA transação do banco: se o rateio falhar, nada é criado.
    // Em parcelamento, o rateio em R$ precisa ser dividido pelo nº de parcelas,
    // senão cada parcela recebe o valor cheio e o rateio estoura o lançamento.
    const allocations = (input.allocations ?? []).map(a => ({
      unit_id: (a.unit_id && a.unit_id !== '__none__') ? a.unit_id : null,
      front_id: (a.front_id && a.front_id !== '__none__') ? a.front_id : null,
      allocation_type: a.allocation_type,
      percentage: a.percentage ?? null,
      amount: a.amount != null ? Math.round((a.amount / count) * 100) / 100 : null,
    }));
    let { data: insertedIds, error } = await callRpc<string[]>('create_transactions_with_allocations', {
      p_rows: rows,
      p_allocations: allocations,
    });
    if (error?.code === 'PGRST202') {
      // Banco sem a função atômica: grava pelo caminho direto.
      const ins = await supabase.from('transactions').insert(rows as never).select('id');
      error = ins.error;
      insertedIds = (ins.data ?? []).map(r => r.id);
      if (!error && allocations.length > 0 && insertedIds.length > 0) {
        const allocRes = await supabase.from('transaction_allocations').insert(
          insertedIds.flatMap(tid => allocations.map(a => ({ ...a, transaction_id: tid }))) as never,
        );
        if (allocRes.error) toast({ title: 'Rateio não salvo', description: allocRes.error.message, variant: 'destructive' });
      }
    }
    if (error || !insertedIds || insertedIds.length === 0) {
      toast({
        title: 'Erro ao criar lançamento',
        description: error ? transactionRpcError('create_transactions_with_allocations', error) : 'Nenhum lançamento foi criado.',
        variant: 'destructive',
      });
      return false;
    }
    const inserted = insertedIds.map(id => ({ id }));

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

    // Campos, rateio e reajuste do rateio em R$ (quando o valor muda sem rateio novo) numa só transação.
    const allocations = input.allocations === undefined
      ? undefined
      : (input.allocations ?? []).map(a => ({
          unit_id: (a.unit_id && a.unit_id !== '__none__') ? a.unit_id : null,
          front_id: (a.front_id && a.front_id !== '__none__') ? a.front_id : null,
          allocation_type: a.allocation_type,
          percentage: a.percentage ?? null,
          amount: a.amount ?? null,
        }));
    let { error } = await callRpc('update_transaction_with_allocations', {
      p_id: id,
      p_patch: updateData,
      ...(allocations !== undefined ? { p_allocations: allocations } : {}),
    });
    if (error?.code === 'PGRST202') {
      // Banco sem a função atômica: atualiza pelo caminho direto.
      const upd = await supabase.from('transactions').update(updateData as never).eq('id', id).select('id');
      error = upd.error ?? (upd.data?.length ? null : { message: 'transaction_not_found' });
      if (!error && allocations !== undefined) {
        await supabase.from('transaction_allocations').delete().eq('transaction_id', id);
        if (allocations.length > 0) {
          const r = await supabase.from('transaction_allocations')
            .insert(allocations.map(a => ({ ...a, transaction_id: id })) as never);
          if (r.error) error = r.error;
        }
      }
    }
    if (error) {
      toast({ title: 'Erro ao atualizar', description: transactionRpcError('update_transaction_with_allocations', error), variant: 'destructive' });
      return false;
    }
    toast({ title: 'Atualizado com sucesso' });
    await fetchData();
    return true;
  };

  const remove = async (id: string, opts?: { action?: 'DELETE' | 'REDO_DELETE' }): Promise<DeletedCapture | null> => {
    const backup = [...data];

    // Optimistic removal from UI
    setData(prev => prev.filter(t => t.id !== id));

    // Lançamento, rateio e anexos saem numa única transação; em mês fechado o banco recusa
    // tudo e nada é perdido. A função devolve o que removeu, para o desfazer.
    let { data: removed, error } = await callRpc<{
      row: DeletedCapture['row'];
      allocations: DeletedCapture['allocations'];
    }>('delete_transaction_with_children', { p_id: id });
    if (error?.code === 'PGRST202') {
      // Banco sem a função atômica: guarda o registro e exclui pelo caminho direto.
      const [{ data: row }, { data: allocs }] = await Promise.all([
        supabase.from('transactions').select('*').eq('id', id).maybeSingle(),
        supabase.from('transaction_allocations').select('*').eq('transaction_id', id),
      ]);
      const del = await supabase.from('transactions').delete().eq('id', id).select('id');
      error = del.error ?? (del.data?.length ? null : { message: 'transaction_not_found' });
      removed = error || !row ? null : { row: row as DeletedCapture['row'], allocations: (allocs ?? []) as DeletedCapture['allocations'] };
    }
    if (error || !removed) {
      toast({
        title: 'Erro ao excluir',
        description: error ? transactionRpcError('delete_transaction_with_children', error) : 'Não foi possível excluir o lançamento. Verifique suas permissões.',
        variant: 'destructive',
      });
      setData(backup); // revert
      return null;
    }
    const rowFull = removed.row;
    const allocs = removed.allocations;
    // Audit log (DELETE / REDO_DELETE)
    try {
      await supabase.rpc('log_transaction_action', {
        _record_id: id,
        _action: opts?.action ?? 'DELETE',
        _old_data: { row: rowFull, allocations: allocs ?? [] } as unknown as Json,
        _new_data: null,
        _context: 'transactions',
      });
    } catch (e) {
      console.warn('Audit log failed', e);
    }
    // Totais vêm sempre da agregação no banco — nunca das linhas em memória.
    await fetchData();
    return { row: rowFull as DeletedCapture['row'], allocations: allocs ?? [] };
  };

  const restore = async (captured: DeletedCapture) => {
    if (!captured?.row) return false;
    const { category, account, partner, unit, front, ...rowOnly } = captured.row;
    const { error } = await supabase.from('transactions').insert(rowOnly as TablesInsert<'transactions'>);
    if (error) {
      toast({ title: 'Erro ao restaurar', description: error.message, variant: 'destructive' });
      return false;
    }
    if (captured.allocations.length > 0) {
      await supabase.from('transaction_allocations').insert(captured.allocations);
    }
    try {
      await supabase.rpc('log_transaction_action', {
        _record_id: rowOnly.id as string,
        _action: 'UNDO_DELETE',
        _old_data: null,
        _new_data: { row: rowOnly, allocations: captured.allocations } as unknown as Json,
        _context: 'transactions',
      });
    } catch (e) {
      console.warn('Audit log (UNDO_DELETE) failed', e);
    }
    await fetchData();
    return true;
  };

  const markAs = async (id: string, status: 'pago' | 'recebido') => {
    const payment_date = todayLocalISO();
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
    const { data, error } = await supabase.rpc('generate_recurring_transactions');
    if (error) {
      toast({ title: 'Erro ao gerar recorrências', description: error.message, variant: 'destructive' });
      return 0;
    }
    const count = data ?? 0;
    toast({
      title: count > 0 ? `${count} lançamento(s) gerados` : 'Tudo em dia',
      description: count > 0 ? 'Próximas ocorrências de lançamentos recorrentes foram criadas.' : 'Nenhuma nova ocorrência a gerar.',
    });
    if (count > 0) await fetchData();
    return count;
  };

  return { data, loading, totals, listComplete, fetchData, create, update, remove, restore, markAs, generateRecurring };
}
