import type { TablesInsert } from '@/integrations/supabase/types';

export interface RuleAllocation { unit_id: string | null; front_id: string | null; value: number }

const NOISE = /\b(pix|ted|doc|deb|cred|debito|credito|enviado|recebido|recebida|transf|transferencia|pagto|pagamento|pag|compra|boleto|tar|para|de|da|do|em|cartao|elo|visa|master)\b/g;

/** Sugere o termo da regra a partir do texto do extrato: remove números, datas e palavras genéricas. */
export function suggestRulePattern(memo: string | null | undefined): string {
  const clean = String(memo ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b\S*\d\S*\b/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ').trim();
  return clean.split(' ').filter(w => w.length > 1).slice(0, 4).join(' ');
}

export interface RuleFromEntryInput {
  pattern: string;
  amount: number;
  accountId: string | null;
  categoryId: string | null;
  unitId: string | null;
  frontId: string | null;
  partnerId: string | null;
  allocations?: RuleAllocation[] | null;
  userId: string | null;
}

/** Monta a regra de conciliação com o que o operador escolheu ao criar o lançamento. */
export function buildRuleFromEntry(i: RuleFromEntryInput): TablesInsert<'ofx_import_rules'> | null {
  const pattern = i.pattern.trim().toLowerCase();
  if (pattern.length < 3 || !i.categoryId) return null;
  const split = (i.allocations ?? []).filter(a => a.unit_id || a.front_id);
  return {
    pattern,
    match_type: 'contains',
    applies_to: i.amount >= 0 ? 'receita' : 'despesa',
    account_id: i.accountId,
    category_id: i.categoryId,
    unit_id: split.length ? null : i.unitId,
    front_id: split.length ? null : i.frontId,
    partner_id: i.partnerId,
    allocations: split.length ? split.map(a => ({ unit_id: a.unit_id, front_id: a.front_id, value: Number(a.value) })) : null,
    use_statement_unit: !split.length && !i.unitId,
    priority: 40,
    active: true,
    created_by: i.userId,
  };
}
