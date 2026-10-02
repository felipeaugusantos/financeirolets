import { useCallback, useEffect, useState } from 'react';
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

/** Status da conferência: o banco é a fonte oficial (tabela transaction_reviews). */
type DbStatus = 'pending' | 'reviewed' | 'corrected' | 'ignored';

const TO_DB: Record<ReviewStatus, DbStatus> = {
  pendente: 'pending',
  revisado: 'reviewed',
  corrigido: 'corrected',
  ignorado: 'ignored',
};
const FROM_DB: Record<DbStatus, ReviewStatus> = {
  pending: 'pendente',
  reviewed: 'revisado',
  corrected: 'corrigido',
  ignored: 'ignorado',
};

const CACHE_KEY = 'lets:conferencia:review-cache';

export interface ReviewEntry {
  status: ReviewStatus;
  note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

function readCache(): Record<string, ReviewEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Carrega e persiste o andamento da conferência. Nenhum registro é criado
 * automaticamente: sem linha em transaction_reviews o lançamento é apenas
 * exibido como "Pendente".
 */
export function useReviewStatus() {
  const { toast } = useToast();
  const [map, setMap] = useState<Record<string, ReviewEntry>>(readCache);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transaction_reviews')
      .select('transaction_id, status, note, reviewed_at, reviewed_by');
    setLoading(false);
    if (error) {
      toast({ title: 'Não foi possível carregar as marcações', description: error.message, variant: 'destructive' });
      return;
    }
    const next: Record<string, ReviewEntry> = {};
    (data ?? []).forEach((r) => {
      next[r.transaction_id] = {
        status: FROM_DB[r.status as DbStatus] ?? 'pendente',
        note: r.note ?? null,
        reviewed_at: r.reviewed_at ?? null,
        reviewed_by: r.reviewed_by ?? null,
      };
    });
    setMap(next);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      /* cache opcional */
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = useCallback(
    async (id: string, status: ReviewStatus, note?: string | null) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        toast({ title: 'Sessão expirada', description: 'Entre novamente para marcar a conferência.', variant: 'destructive' });
        return;
      }
      const payload = {
        transaction_id: id,
        status: TO_DB[status],
        note: note === undefined ? map[id]?.note ?? null : note || null,
        reviewed_by: uid,
        reviewed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('transaction_reviews')
        .upsert(payload as any, { onConflict: 'transaction_id' });
      if (error) {
        toast({ title: 'Erro ao salvar marcação', description: error.message, variant: 'destructive' });
        return;
      }
      setMap((prev) => {
        const next = {
          ...prev,
          [id]: { status, note: payload.note, reviewed_at: payload.reviewed_at, reviewed_by: uid },
        };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* cache opcional */
        }
        return next;
      });
    },
    [map, toast]
  );

  return { reviewStatus: map, setReviewStatus: setStatus, reloadReviews: load, reviewsLoading: loading };
}

export interface AllocationDraft {
  unit_id: string | null;
  front_id?: string | null;
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
              front_id: r.front_id ?? null,
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
