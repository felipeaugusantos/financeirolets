/**
 * Camada comum de regras financeiras.
 *
 * Todas as telas (Dashboard, Lançamentos, DRE, DRE Comparativo, Fluxo de Caixa
 * e Reconciliação) devem usar estes helpers para que a mesma informação seja
 * calculada sempre da mesma forma. Nenhuma função aqui altera dados.
 */

export const PAID_STATUSES = ['pago', 'recebido'] as const;
export const PROVISIONED_STATUSES = ['pendente', 'agendado'] as const;
export const CANCELLED_STATUS = 'cancelado';

/** Chave usada para representar lançamentos sem unidade e sem rateio. */
export const NO_UNIT_KEY = '__none__';
/** Chave usada para a coluna consolidada. */
export const ALL_KEY = '__all__';

export type TxStatus = 'pago' | 'recebido' | 'pendente' | 'agendado' | 'cancelado';

export function isPaidStatus(status?: string | null): boolean {
  return status === 'pago' || status === 'recebido';
}

export function isProvisionedStatus(status?: string | null): boolean {
  return status === 'pendente' || status === 'agendado';
}

export function isCancelled(status?: string | null): boolean {
  return status === CANCELLED_STATUS;
}

/** Um lançamento entra no DRE? (flag explícita, default true) */
export function affectsDre(tx: { affects_dre?: boolean | null }): boolean {
  return tx.affects_dre !== false;
}

/** Um lançamento entra no caixa? (flag explícita, default true) */
export function affectsCashflow(tx: { affects_cashflow?: boolean | null }): boolean {
  return tx.affects_cashflow !== false;
}

/** Valor de referência do lançamento (líquido). */
export function txValue(tx: { net_amount?: number | string | null }): number {
  const v = Number(tx.net_amount);
  return Number.isFinite(v) ? v : 0;
}

/** Sinal contábil pela natureza do lançamento: receita entra (+), despesa sai (-). */
export function signedCashValue(tx: { type?: string | null; net_amount?: number | string | null }): number {
  const v = txValue(tx);
  return tx.type === 'receita' ? v : -v;
}

/** Campo de data conforme o regime do relatório. */
export function dateFieldForRegime(regime: 'competencia' | 'caixa'): 'competence_date' | 'payment_date' {
  return regime === 'caixa' ? 'payment_date' : 'competence_date';
}

// ---------------------------------------------------------------------------
// Rateio (transaction_allocations)
// ---------------------------------------------------------------------------

export interface AllocationRow {
  transaction_id: string;
  unit_id: string | null;
  front_id?: string | null;
  allocation_type: string;
  percentage: number | null;
  amount: number | null;
}

export function buildAllocationMap(allocs: AllocationRow[] | null | undefined) {
  const map = new Map<string, AllocationRow[]>();
  (allocs ?? []).forEach((a) => {
    const list = map.get(a.transaction_id) || [];
    list.push(a);
    map.set(a.transaction_id, list);
  });
  return map;
}

/** Valor de uma linha de rateio, seja percentual ou valor fixo. */
export function allocationValue(alloc: AllocationRow, total: number): number {
  if (alloc.allocation_type === 'percentual' && alloc.percentage != null) {
    return total * (Number(alloc.percentage) / 100);
  }
  return Number(alloc.amount) || 0;
}

/**
 * Distribui o valor do lançamento entre unidades, sempre da mesma forma:
 *  - com rateio  → conforme transaction_allocations (unit_id null vira "Sem unidade");
 *  - com unit_id → tudo na unidade;
 *  - sem nada    → tudo em "Sem unidade" (NUNCA descartado).
 */
export function splitByUnit(
  tx: { id: string; unit_id?: string | null; net_amount?: number | string | null },
  allocMap: Map<string, AllocationRow[]>
): { unitKey: string; value: number }[] {
  const total = txValue(tx);
  const allocs = allocMap.get(tx.id);
  if (allocs && allocs.length > 0) {
    return allocs.map((a) => ({
      unitKey: a.unit_id || NO_UNIT_KEY,
      value: allocationValue(a, total),
    }));
  }
  return [{ unitKey: tx.unit_id || NO_UNIT_KEY, value: total }];
}

/**
 * Valor atribuível ao filtro de unidade selecionado.
 * `unitFilter` indefinido = visão global (valor cheio).
 */
export function valueForUnitFilter(
  tx: { id: string; unit_id?: string | null; net_amount?: number | string | null },
  allocMap: Map<string, AllocationRow[]>,
  unitFilter?: string
): number {
  if (!unitFilter) return txValue(tx);
  return splitByUnit(tx, allocMap)
    .filter((s) => s.unitKey === unitFilter)
    .reduce((sum, s) => sum + s.value, 0);
}

// ---------------------------------------------------------------------------
// Bases de consulta compartilhadas (PostgREST query builders)
// ---------------------------------------------------------------------------

/** Base do DRE: exclui cancelados, exige affects_dre e aplica o regime. */
export function applyDreBase(
  query: any,
  opts: { regime: 'competencia' | 'caixa'; onlyRealized?: boolean }
) {
  let q = query.not('status', 'eq', CANCELLED_STATUS).eq('affects_dre', true);
  if (opts.regime === 'caixa' || opts.onlyRealized) {
    q = q.in('status', [...PAID_STATUSES] as any);
  }
  return q;
}

/** Base do Fluxo de Caixa realizado: pagos/recebidos com data de pagamento. */
export function applyCashRealizedBase(query: any) {
  return query
    .not('payment_date', 'is', null)
    .in('status', [...PAID_STATUSES] as any)
    .eq('affects_cashflow', true);
}

/** Base do Fluxo de Caixa projetado: pendentes/agendados por vencimento. */
export function applyCashProjectedBase(query: any) {
  return query
    .not('due_date', 'is', null)
    .in('status', [...PROVISIONED_STATUSES] as any)
    .eq('affects_cashflow', true);
}

/** Filtro "sem categoria"/categoria específica, igual em todas as telas. */
export function applyCategoryFilter(query: any, categoryId?: string) {
  if (!categoryId) return query;
  return categoryId === NO_UNIT_KEY || categoryId === '__null__'
    ? query.is('category_id', null)
    : query.eq('category_id', categoryId);
}

// ---------------------------------------------------------------------------
// Identidade de lançamento (prevenção de duplicidade em importações)
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Impressão digital de um lançamento — usada só para DETECTAR possíveis
 * duplicidades antes de inserir. Nunca apaga nada.
 */
export function transactionFingerprint(tx: {
  type?: string | null;
  description?: string | null;
  amount?: number | string | null;
  competence_date?: string | null;
}): string {
  const amount = Number(tx.amount) || 0;
  return [
    tx.type || '',
    tx.competence_date || '',
    amount.toFixed(2),
    normalizeText(tx.description || ''),
  ].join('|');
}
