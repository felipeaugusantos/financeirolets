/**
 * Triagem de PIX de mesma origem com naturezas diferentes (ex.: Martinho & Souza).
 *
 * Nada aqui altera dados: só descreve as naturezas possíveis, sugere uma
 * classificação e monta o patch que a tela de Conferência aplicará DEPOIS da
 * confirmação do usuário.
 */

export type PixNature = 'venda' | 'transferencia' | 'stone' | 'ifood' | 'app_caixa';

export interface PixNatureDef {
  value: PixNature;
  label: string;
  hint: string;
  /** Entra no DRE como receita? */
  affects_dre: boolean;
  /** Entra no fluxo de caixa? (todas entram: o dinheiro passou na conta) */
  affects_cashflow: boolean;
}

export const PIX_NATURES: PixNatureDef[] = [
  {
    value: 'venda',
    label: 'Recebimento de loja (venda)',
    hint: 'Receita normal da operação. Permanece no DRE e no Fluxo de Caixa.',
    affects_dre: true,
    affects_cashflow: true,
  },
  {
    value: 'transferencia',
    label: 'Transferência entre contas do grupo',
    hint: 'Remanejo de dinheiro (ex.: caiu no Boulevard e foi para a Franqueadora). Sai do DRE, continua no Fluxo de Caixa.',
    affects_dre: false,
    affects_cashflow: true,
  },
  {
    value: 'stone',
    label: 'Repasse Stone Boulevard',
    hint: 'Liquidação de venda no cartão já lançada. Sai do DRE para não contar a receita duas vezes.',
    affects_dre: false,
    affects_cashflow: true,
  },
  {
    value: 'ifood',
    label: 'Recebível iFood',
    hint: 'Repasse do iFood referente a vendas já lançadas. Sai do DRE, continua no Fluxo de Caixa.',
    affects_dre: false,
    affects_cashflow: true,
  },
  {
    value: 'app_caixa',
    label: 'PIX do app do Café (conta Caixa)',
    hint: 'Acúmulo do app transferido quando fecha um valor. Tratado como transferência: sai do DRE.',
    affects_dre: false,
    affects_cashflow: true,
  },
];

export const PIX_NATURE_BY_VALUE: Record<PixNature, PixNatureDef> = PIX_NATURES.reduce(
  (acc, n) => ({ ...acc, [n.value]: n }),
  {} as Record<PixNature, PixNatureDef>
);

/** Marca gravada em `notes` para deixar a decisão rastreável no lançamento. */
export const PIX_NATURE_TAG = /\[natureza:\s*([a-z_]+)\]/i;

export function readNatureTag(notes?: string | null): PixNature | null {
  const m = PIX_NATURE_TAG.exec(notes || '');
  const v = m?.[1]?.toLowerCase() as PixNature | undefined;
  return v && v in PIX_NATURE_BY_VALUE ? v : null;
}

export function writeNatureTag(notes: string | null | undefined, nature: PixNature): string {
  const base = (notes || '').replace(PIX_NATURE_TAG, '').trim();
  const tag = `[natureza: ${nature}]`;
  return base ? `${base} ${tag}` : tag;
}

export interface PixTx {
  id: string;
  description: string;
  notes?: string | null;
  net_amount: number;
  type: string;
  account_id?: string | null;
  payment_date?: string | null;
  competence_date: string;
  affects_dre?: boolean | null;
  affects_cashflow?: boolean | null;
}

const norm = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Sugestão de natureza — sempre editável pelo usuário. A ordem importa:
 * marcas explícitas primeiro, heurística de valor por último.
 */
export function suggestNature(tx: PixTx): { nature: PixNature; reason: string } {
  const tagged = readNatureTag(tx.notes);
  if (tagged) {
    return { nature: tagged, reason: 'Já classificado anteriormente.' };
  }
  const text = `${norm(tx.description)} ${norm(tx.notes)}`;
  if (text.includes('stone')) {
    return { nature: 'stone', reason: 'Histórico menciona Stone.' };
  }
  if (text.includes('ifood') || text.includes('i food')) {
    return { nature: 'ifood', reason: 'Histórico menciona iFood.' };
  }
  if (text.includes('transfer') || text.includes('remanej') || text.includes('aporte')) {
    return { nature: 'transferencia', reason: 'Histórico indica remanejo entre contas.' };
  }
  if (text.includes(' app') || text.includes('caixa')) {
    return { nature: 'app_caixa', reason: 'Histórico indica acúmulo do app/conta Caixa.' };
  }
  const v = Math.abs(Number(tx.net_amount) || 0);
  if (v >= 1000 && v % 500 === 0) {
    return { nature: 'transferencia', reason: 'Valor redondo e alto — padrão de remanejo.' };
  }
  return { nature: 'venda', reason: 'Sem indício de repasse: tratado como venda.' };
}

/** Patch aplicado ao lançamento quando a natureza é confirmada. */
export function patchForNature(tx: PixTx, nature: PixNature): Record<string, unknown> {
  const def = PIX_NATURE_BY_VALUE[nature];
  return {
    affects_dre: def.affects_dre,
    affects_cashflow: def.affects_cashflow,
    notes: writeNatureTag(tx.notes, nature),
  };
}

export interface TransferPair {
  inId: string;
  outId: string;
  amount: number;
  days: number;
}

/**
 * Pares candidatos a transferência: mesma quantia, contas diferentes,
 * entrada e saída em até `maxDays` dias. Apenas uma SUGESTÃO.
 */
export function detectTransferPairs(txs: PixTx[], maxDays = 3): TransferPair[] {
  const dateOf = (t: PixTx) => t.payment_date || t.competence_date;
  const receitas = txs.filter((t) => t.type === 'receita');
  const despesas = txs.filter((t) => t.type === 'despesa');
  const used = new Set<string>();
  const pairs: TransferPair[] = [];

  receitas.forEach((r) => {
    const rv = Math.round((Number(r.net_amount) || 0) * 100);
    const rd = new Date(`${dateOf(r)}T12:00:00`).getTime();
    const match = despesas.find((d) => {
      if (used.has(d.id)) return false;
      if (Math.round((Number(d.net_amount) || 0) * 100) !== rv) return false;
      if ((d.account_id || '') === (r.account_id || '')) return false;
      const dd = new Date(`${dateOf(d)}T12:00:00`).getTime();
      return Math.abs(dd - rd) <= maxDays * 86400000;
    });
    if (match) {
      used.add(match.id);
      pairs.push({
        inId: r.id,
        outId: match.id,
        amount: Number(r.net_amount) || 0,
        days: Math.round(
          Math.abs(new Date(`${dateOf(match)}T12:00:00`).getTime() - rd) / 86400000
        ),
      });
    }
  });

  return pairs;
}

/** Impacto no DRE se as escolhas atuais forem aplicadas (receitas que saem). */
export function dreImpact(txs: PixTx[], choices: Record<string, PixNature>): number {
  let delta = 0;
  txs.forEach((t) => {
    const nature = choices[t.id];
    if (!nature) return;
    const willAffect = PIX_NATURE_BY_VALUE[nature].affects_dre;
    const nowAffects = t.affects_dre !== false;
    if (willAffect === nowAffects) return;
    const v = Number(t.net_amount) || 0;
    const signed = t.type === 'receita' ? v : -v;
    delta += willAffect ? signed : -signed;
  });
  return delta;
}