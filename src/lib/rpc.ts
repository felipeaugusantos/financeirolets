import { supabase } from '@/integrations/supabase/client';

interface RpcResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Chama uma função SQL que ainda não consta em integrations/supabase/types.ts (o Lovable
 * regenera esse arquivo a partir do banco dele e já removeu assinaturas que não conhecia).
 * O cast fica só aqui.
 */
export function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).rpc(fn, args);
}

const MIGRATION_HINT = 'Aplique a migração 20261006120000 (scripts/producao/09-salvar-e-excluir-lancamento-atomico.sql) antes de usar.';

/** Mensagem em português para os erros das funções de salvar/excluir lançamento. */
export function transactionRpcError(fn: string, error: { message: string; code?: string }): string {
  if (error.code === 'PGRST202') return `A função ${fn} não existe neste banco. ${MIGRATION_HINT}`;
  if (error.message.startsWith('transaction_not_found')) {
    return 'Lançamento não encontrado ou sem permissão. Atualize a tela.';
  }
  if (error.message.startsWith('invalid_rows')) return 'Informe ao menos um lançamento.';
  return error.message;
}
