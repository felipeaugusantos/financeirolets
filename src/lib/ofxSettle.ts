import { supabase } from '@/integrations/supabase/client';

/** Marcador gravado no lançamento baixado pela conciliação — só esses são reabertos ao desvincular. */
export const SETTLE_MARK = '[baixa pela conciliação]';

const paidStatus = (type: string) => (type === 'receita' ? 'recebido' : 'pago');

/** Lançamentos baixados junto: um repasse iFood leva suas despesas (comissão/promoções). */
async function companions(txId: string): Promise<string[]> {
  const { data } = await supabase.from('ifood_payout_postings').select('expense_ids').eq('receivable_id', txId).maybeSingle();
  return data?.expense_ids ?? [];
}

/** Ao vincular uma linha do extrato: dá baixa no lançamento pendente/agendado na data e conta do extrato. */
export async function settleOnLink(entryId: string, txId: string): Promise<string | null> {
  const { data: entry } = await supabase.from('bank_statement_entries').select('posted_at,account_id').eq('id', entryId).maybeSingle();
  if (!entry) return null;
  const ids = [txId, ...(await companions(txId))];
  const { data: txs } = await supabase.from('transactions').select('id,type,status,notes').in('id', ids);
  for (const t of txs ?? []) {
    if (!['pendente', 'agendado'].includes(t.status)) continue;
    const { error } = await supabase.from('transactions').update({
      status: paidStatus(t.type), payment_date: entry.posted_at, account_id: entry.account_id,
      notes: `${t.notes ? `${t.notes}\n` : ''}${SETTLE_MARK}`,
    }).eq('id', t.id);
    if (error) return error.message;
  }
  return null;
}

/** Ao desvincular: reabre só o que foi baixado pelo vínculo (marcador), voltando para pendente. */
export async function reopenOnUnlink(txId: string | null): Promise<string | null> {
  if (!txId) return null;
  const ids = [txId, ...(await companions(txId))];
  const { data: txs } = await supabase.from('transactions').select('id,notes').in('id', ids);
  for (const t of txs ?? []) {
    if (!t.notes?.includes(SETTLE_MARK)) continue;
    const notes = t.notes.replace(`\n${SETTLE_MARK}`, '').replace(SETTLE_MARK, '').trim() || null;
    const { error } = await supabase.from('transactions').update({ status: 'pendente', payment_date: null, notes }).eq('id', t.id);
    if (error) return error.message;
  }
  return null;
}
