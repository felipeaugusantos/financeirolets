import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Ações MANUAIS da Conferência de lançamentos.
 *
 * Regra de ouro: nenhuma função aqui é chamada automaticamente. Todas exigem
 * que o usuário selecione os registros e confirme a alteração no diálogo de
 * confirmação (antes / depois / impacto).
 */

export type ReviewStatus = 'pendente' | 'revisado' | 'corrigido' | 'ignorado';

const REVIEW_KEY = 'lets:conferencia:review-status';

function loadReview(): Record<string, ReviewStatus> {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}');
  } catch {
    return {};
  }
}

export function useReviewStatus() {
  const [map, setMap] = useState<Record<string, ReviewStatus>>(loadReview);

  const setStatus = useCallback((id: string, status: ReviewStatus) => {
    setMap((prev) => {
      const next = { ...prev, [id]: status };
      if (status === 'pendente') delete next[id];
      try {
        localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
      } catch {
        /* storage indisponível: o controle vira apenas de sessão */
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setMap({});
    try {
      localStorage.removeItem(REVIEW_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { reviewStatus: map, setReviewStatus: setStatus, clearReviewStatus: clearAll };
}

export interface AllocationDraft {
  unit_id: string | null;
  allocation_type: 'percentual' | 'valor';
  percentage: number | null;
  amount: number | null;
}

export function useReviewActions(onDone?: () => void) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const logAudit = async (id: string, before: unknown, after: unknown) => {
    try {
      await supabase.rpc('log_reconciliation_fix' as any, {
        _record_id: id,
        _old_data: before ?? {},
        _new_data: after ?? {},
      });
    } catch (e) {
      console.warn('[conferencia] audit log falhou', e);
    }
  };

  /** Aplica o MESMO patch nos ids informados, um a um, com log de auditoria. */
  const applyPatch = useCallback(
    async (ids: string[], patch: Record<string, unknown>, label: string): Promise<boolean> => {
      if (ids.length === 0) return false;
      setBusy(true);
      let ok = 0;
      try {
        for (const id of ids) {
          const { data: before } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', id)
            .maybeSingle();
          const { data: after, error } = await supabase
            .from('transactions')
            .update(patch as never)
            .eq('id', id)
            .select('*')
            .maybeSingle();
          if (error) throw error;
          await logAudit(id, before, after ?? patch);
          ok += 1;
        }
        toast({ title: label, description: `${ok} lançamento(s) atualizado(s).` });
        onDone?.();
        return true;
      } catch (e: any) {
        toast({
          title: 'Não foi possível concluir',
          description: `${e.message}. ${ok} registro(s) já haviam sido alterados.`,
          variant: 'destructive',
        });
        onDone?.();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onDone, toast]
  );

  /** Exclusão definitiva — só é chamada após confirmação explícita e digitada. */
  const deleteTransactions = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (ids.length === 0) return false;
      setBusy(true);
      try {
        for (const id of ids) {
          const { data: before } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', id)
            .maybeSingle();
          try {
            await supabase.rpc('log_transaction_action' as any, {
              _record_id: id,
              _action: 'DELETE',
              _old_data: before ?? {},
              _new_data: {},
              _context: 'conferencia',
            });
          } catch (e) {
            console.warn('[conferencia] audit log falhou', e);
          }
          const { error } = await supabase.from('transactions').delete().eq('id', id);
          if (error) throw error;
        }
        toast({ title: 'Lançamento excluído', description: `${ids.length} registro(s) removido(s).` });
        onDone?.();
        return true;
      } catch (e: any) {
        toast({ title: 'Não foi possível excluir', description: e.message, variant: 'destructive' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onDone, toast]
  );

  /** Grava o rateio definido manualmente pelo usuário para um lançamento. */
  const saveAllocations = useCallback(
    async (transactionId: string, rows: AllocationDraft[]): Promise<boolean> => {
      setBusy(true);
      try {
        const { data: before } = await supabase
          .from('transaction_allocations')
          .select('*')
          .eq('transaction_id', transactionId);
        const { error: delErr } = await supabase
          .from('transaction_allocations')
          .delete()
          .eq('transaction_id', transactionId);
        if (delErr) throw delErr;
        if (rows.length > 0) {
          const { error } = await supabase.from('transaction_allocations').insert(
            rows.map((r) => ({
              transaction_id: transactionId,
              unit_id: r.unit_id,
              allocation_type: r.allocation_type,
              percentage: r.allocation_type === 'percentual' ? r.percentage : null,
              amount: r.allocation_type === 'valor' ? r.amount : null,
            })) as never
          );
          if (error) throw error;
        }
        await logAudit(transactionId, { allocations: before ?? [] }, { allocations: rows });
        toast({ title: 'Rateio salvo', description: 'O valor do lançamento não foi alterado.' });
        onDone?.();
        return true;
      } catch (e: any) {
        toast({ title: 'Não foi possível salvar o rateio', description: e.message, variant: 'destructive' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onDone, toast]
  );

  return { applyPatch, deleteTransactions, saveAllocations, busy };
}
