import { supabase } from '@/integrations/supabase/client';
import { settleOnLink } from '@/lib/ofxSettle';

export interface StatementLine { id: string; posted_at: string; amount: number; memo: string | null }
export interface PayoutCandidate { receivable_id: string; week_start: string; net: number }

/** Créditos do iFood no extrato chegam até ~3 semanas depois do início da semana do repasse. */
const MAX_DAYS_AFTER_WEEK = 21;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const looksLikeIfood = (memo: string | null) => /i\s*-?\s*food/i.test(memo ?? '');

/**
 * Casa linhas do extrato com repasses iFood lançados: crédito com "iFood" na descrição,
 * valor igual ao líquido (±1 centavo) e data entre o início da semana e +21 dias.
 * Só casa quando a combinação é única dos dois lados — na dúvida, fica para conferência manual.
 */
export function matchIfoodPayouts(lines: StatementLine[], payouts: PayoutCandidate[]): Array<{ entryId: string; receivableId: string }> {
  const fits = (l: StatementLine, p: PayoutCandidate) => {
    const d = daysBetween(p.week_start, l.posted_at);
    return l.amount > 0 && looksLikeIfood(l.memo) && Math.abs(l.amount - p.net) <= 0.01 && d >= 0 && d <= MAX_DAYS_AFTER_WEEK;
  };
  const out: Array<{ entryId: string; receivableId: string }> = [];
  for (const l of lines) {
    const ps = payouts.filter((p) => fits(l, p));
    if (ps.length !== 1) continue;
    const rivals = lines.filter((o) => fits(o, ps[0]));
    if (rivals.length !== 1) continue;
    out.push({ entryId: l.id, receivableId: ps[0].receivable_id });
  }
  return out;
}

/** Vincula e baixa automaticamente os repasses iFood reconhecidos nas linhas pendentes da conta. */
export async function autoLinkIfoodPayouts(accountId: string, userId: string | null): Promise<number> {
  const { data: lines } = await supabase
    .from('bank_statement_entries')
    .select('id, posted_at, amount, memo')
    .eq('account_id', accountId).eq('status', 'pendente').is('transaction_id', null).gt('amount', 0);
  const ifoodLines = (lines ?? []).filter((l) => looksLikeIfood(l.memo)).map((l) => ({ ...l, amount: Number(l.amount) }));
  if (ifoodLines.length === 0) return 0;

  const { data: postings } = await supabase.from('ifood_payout_postings').select('receivable_id, week_start, net');
  if (!postings?.length) return 0;
  const ids = postings.map((p) => p.receivable_id);
  const [{ data: open }, { data: linked }] = await Promise.all([
    supabase.from('transactions').select('id').in('id', ids).in('status', ['pendente', 'agendado']),
    supabase.from('bank_statement_entries').select('transaction_id').in('transaction_id', ids),
  ]);
  const openIds = new Set((open ?? []).map((t) => t.id));
  const linkedIds = new Set((linked ?? []).map((e) => e.transaction_id));
  const candidates = postings
    .filter((p) => openIds.has(p.receivable_id) && !linkedIds.has(p.receivable_id))
    .map((p) => ({ ...p, net: Number(p.net) }));

  let done = 0;
  for (const m of matchIfoodPayouts(ifoodLines, candidates)) {
    const { error } = await supabase.from('bank_statement_entries').update({
      transaction_id: m.receivableId, status: 'vinculado',
      match_note: 'Repasse iFood reconhecido automaticamente',
      decided_by: userId, decided_at: new Date().toISOString(),
    }).eq('id', m.entryId).eq('status', 'pendente');
    if (error) continue;
    if (!(await settleOnLink(m.entryId, m.receivableId))) done++;
  }
  return done;
}
