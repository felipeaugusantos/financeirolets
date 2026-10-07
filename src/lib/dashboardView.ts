/** Filtros do Dashboard guardados na URL (link compartilhável, sobrevive ao recarregar) e utilitários de exibição. */

export const PERIOD_PRESETS = ['current_month', 'last_month', 'last_3_months', 'last_6_months', 'ytd', 'last_year', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface DashboardView {
  preset: PeriodPreset;
  /** Só vale com preset "custom" (AAAA-MM-DD). */
  from?: string;
  to?: string;
  /** '' = todas. */
  unitId: string;
  frontId: string;
  includeProvisioned: boolean;
}

export const DEFAULT_VIEW: DashboardView = { preset: 'current_month', unitId: '', frontId: '', includeProvisioned: false };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê a URL com validação: valor inválido volta ao padrão em vez de quebrar a tela. */
export function parseView(sp: URLSearchParams): DashboardView {
  const preset = sp.get('periodo') as PeriodPreset | null;
  const valid = preset && (PERIOD_PRESETS as readonly string[]).includes(preset) ? preset : 'current_month';
  const from = sp.get('de');
  const to = sp.get('ate');
  const unit = sp.get('unidade');
  const front = sp.get('frente');
  return {
    preset: valid,
    from: valid === 'custom' && from && ISO.test(from) ? from : undefined,
    to: valid === 'custom' && to && ISO.test(to) ? to : undefined,
    unitId: unit && UUID.test(unit) ? unit : '',
    frontId: front && UUID.test(front) ? front : '',
    includeProvisioned: sp.get('prov') === '1',
  };
}

/** Só grava o que difere do padrão (URL curta). */
export function serializeView(v: DashboardView): URLSearchParams {
  const sp = new URLSearchParams();
  if (v.preset !== 'current_month') sp.set('periodo', v.preset);
  if (v.preset === 'custom') {
    if (v.from) sp.set('de', v.from);
    if (v.to) sp.set('ate', v.to);
  }
  if (v.unitId && v.unitId !== 'all') sp.set('unidade', v.unitId);
  if (v.frontId && v.frontId !== 'all') sp.set('frente', v.frontId);
  if (v.includeProvisioned) sp.set('prov', '1');
  return sp;
}

/**
 * Aumentar receita é bom e aumentar despesa é ruim: a cor da variação depende disso.
 * Variação ausente ou zero fica neutra.
 */
export function variationTone(kind: 'receita' | 'despesa', variation: number | null): 'good' | 'bad' | 'neutral' {
  if (variation === null || Math.abs(variation) < 0.05) return 'neutral';
  const up = variation > 0;
  return (kind === 'receita') === up ? 'good' : 'bad';
}

/** Valor curto para eixos de gráfico: "R$ 950", "R$ 1,2 mil", "R$ 3,4 mi". */
export function compactBRL(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const n = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${sign}R$ ${n(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sign}R$ ${n(abs / 1_000)} mil`;
  return `${sign}R$ ${n(abs)}`;
}

/**
 * Link do cartão do Dashboard para a lista de lançamentos que o compõe.
 * Sem "incluir provisionados": só pagos/recebidos pela data de pagamento (regime=caixa).
 * Com: pagos pela data de pagamento + provisionados pela competência (regime=dashboard).
 */
export function drilldownUrl(o: { kind: 'receita' | 'despesa'; from: string; to: string; includeProvisioned: boolean }): string {
  const sp = new URLSearchParams({
    type: o.kind, dateFrom: o.from, dateTo: o.to, regime: o.includeProvisioned ? 'dashboard' : 'caixa',
  });
  return `/lancamentos?${sp.toString()}`;
}
