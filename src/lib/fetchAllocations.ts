import { supabase } from '@/integrations/supabase/client';

/**
 * Busca os rateios de uma lista de lançamentos em lotes.
 * Pedir centenas de ids de uma vez estoura o tamanho da requisição e o backend
 * recusa em silêncio — o relatório tratava tudo como 100% da unidade principal.
 */
export async function fetchAllocationsFor<T = Record<string, unknown>>(
  txIds: string[],
  columns = 'transaction_id, unit_id, front_id, allocation_type, percentage, amount',
  chunkSize = 150,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < txIds.length; i += chunkSize) {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select(columns)
      .in('transaction_id', txIds.slice(i, i + chunkSize));
    if (error) throw new Error(`Não foi possível carregar os rateios: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}
