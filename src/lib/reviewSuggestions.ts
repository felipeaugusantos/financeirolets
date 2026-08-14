/**
 * Heurísticas de SUGESTÃO para a tela de Conferência de lançamentos.
 *
 * IMPORTANTE: nada aqui altera dados. São apenas recomendações exibidas ao
 * usuário, que decide caso a caso o que (e se) será corrigido.
 */

export interface SuggestTx {
  id: string;
  description: string;
  type: string;
  status: string;
  net_amount: number;
  amount: number;
  competence_date: string;
  due_date: string | null;
  payment_date: string | null;
  category_id: string | null;
  unit_id: string | null;
  account_id: string | null;
  affects_dre: boolean;
  affects_cashflow: boolean;
}

export function norm(s?: string | null): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// Transferências entre contas
// ---------------------------------------------------------------------------

const TRANSFER_PATTERNS = [
  'transferencia',
  'transferência',
  'transf ',
  'transf.',
  'entre contas',
  'aporte',
  'resgate',
  'aplicacao',
  'aplicação',
  'saque',
  'movimentacao interna',
];

export function looksLikeTransfer(tx: { description: string }): boolean {
  const d = norm(tx.description);
  return TRANSFER_PATTERNS.some((p) => d.includes(norm(p)));
}

// ---------------------------------------------------------------------------
// Lançamentos de teste
// ---------------------------------------------------------------------------

export function looksLikeTest(tx: { description: string }): boolean {
  const d = norm(tx.description);
  return /\bteste?\b|\btest\b|\bdemo\b|\bexemplo\b/.test(d);
}

// ---------------------------------------------------------------------------
// Duplicidades
// ---------------------------------------------------------------------------

export type DuplicateSeverity = 'forte' | 'conferir' | 'legitimo';

const LEGIT_PATTERNS = ['tarifa', 'taxa bancaria', 'rendimento', 'juros de aplicacao', 'iof', 'pix'];

export function classifyDuplicate(items: SuggestTx[]): {
  severity: DuplicateSeverity;
  reason: string;
} {
  const value = Math.abs(Number(items[0]?.net_amount) || 0);
  const desc = norm(items[0]?.description);
  const units = new Set(items.map((t) => t.unit_id || '—'));
  const accounts = new Set(items.map((t) => t.account_id || '—'));

  const legitByText = LEGIT_PATTERNS.some((p) => desc.includes(norm(p)));
  if ((legitByText && accounts.size === items.length) || value <= 5) {
    return {
      severity: 'legitimo',
      reason:
        'Valor pequeno e/ou tarifa recorrente em contas diferentes. Provavelmente são lançamentos reais distintos.',
    };
  }
  if (units.size > 1) {
    return {
      severity: 'conferir',
      reason:
        'Mesmo valor e descrição, mas unidades diferentes. Pode ser rateio manual (valor cheio repetido por unidade).',
    };
  }
  if (accounts.size > 1) {
    return {
      severity: 'conferir',
      reason: 'Mesmo valor e descrição em contas diferentes. Confira os extratos antes de decidir.',
    };
  }
  return {
    severity: 'forte',
    reason: 'Registros praticamente idênticos (mesma natureza, data, valor, descrição, unidade e conta).',
  };
}

// ---------------------------------------------------------------------------
// Sugestão de categoria por palavra-chave
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: { keywords: string[]; categoryName: string; reason: string }[] = [
  { keywords: ['limpeza', 'top store', 'higien'], categoryName: 'Material de Limpeza', reason: 'Descrição indica produto de limpeza/higiene.' },
  { keywords: ['grafica', 'impress', 'banner', 'adesiv'], categoryName: 'Material Gráfico', reason: 'Descrição indica serviço gráfico.' },
  { keywords: ['motoqueiro', 'motoboy', 'entregador'], categoryName: 'Mensal Motoqueiro (Variável)', reason: 'Descrição indica custo de entrega.' },
  { keywords: ['embalagem', 'sacola', 'caixa '], categoryName: 'Embalagens', reason: 'Descrição indica embalagem.' },
  { keywords: ['materia prima', 'insumo', 'farinha', 'chocolate', 'manteiga'], categoryName: 'Matéria-Prima', reason: 'Descrição indica insumo de produção.' },
  { keywords: ['energia', 'enel', 'cemig', 'luz'], categoryName: 'Energia Elétrica', reason: 'Descrição indica conta de energia.' },
  { keywords: ['agua', 'saneago', 'sabesp'], categoryName: 'Água', reason: 'Descrição indica conta de água.' },
  { keywords: ['aluguel'], categoryName: 'Aluguel', reason: 'Descrição indica aluguel.' },
  { keywords: ['tarifa', 'taxa bancaria', 'iof'], categoryName: 'Tarifas Bancárias', reason: 'Descrição indica tarifa bancária.' },
  { keywords: ['salario', 'folha', 'adiantamento'], categoryName: 'Salários Fábrica', reason: 'Descrição indica folha de pagamento — confirme a unidade.' },
];

/** Descrições que NÃO devem receber sugestão automática: exigem revisão manual. */
const LOW_CONFIDENCE = ['nupay', 'ifood', 'diversos', 'outros', 'pagamento', 'compra', 'despesa', 'pix'];

export interface CategorySuggestion {
  categoryName?: string;
  reason: string;
  lowConfidence: boolean;
}

export function suggestCategory(description: string): CategorySuggestion {
  const d = norm(description);
  if (!d || d.length < 4) {
    return { reason: 'Descrição insuficiente para sugerir categoria.', lowConfidence: true };
  }
  const hit = CATEGORY_KEYWORDS.find((c) => c.keywords.some((k) => d.includes(norm(k))));
  const low = LOW_CONFIDENCE.some((k) => d.includes(norm(k)));
  if (!hit) {
    return {
      reason: low
        ? 'Descrição genérica (iFood/Nupay/pagamento). Revisão manual necessária.'
        : 'Nenhum padrão conhecido encontrado. Revisão manual necessária.',
      lowConfidence: true,
    };
  }
  return { categoryName: hit.categoryName, reason: hit.reason, lowConfidence: low };
}

// ---------------------------------------------------------------------------
// Tipo x status
// ---------------------------------------------------------------------------

export function suggestStatus(tx: { type: string; status: string }): string | null {
  if (tx.type === 'receita' && tx.status === 'pago') return 'recebido';
  if (tx.type === 'despesa' && tx.status === 'recebido') return 'pago';
  return null;
}

// ---------------------------------------------------------------------------
// Sem unidade
// ---------------------------------------------------------------------------

export function suggestUnitLabel(tx: SuggestTx, categoryName?: string): string | null {
  const d = norm(`${tx.description} ${categoryName || ''}`);
  if (d.includes('materia prima') || d.includes('matéria-prima') || d.includes('insumo')) return 'Fábrica';
  return null;
}
