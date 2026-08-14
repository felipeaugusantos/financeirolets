/**
 * Regras de categoria para NOVOS lançamentos.
 *
 * IMPORTANTE: nada aqui altera dados históricos. As categorias legadas continuam
 * ativas no banco e mantêm o mesmo `dre_line_id`, para que todo relatório antigo
 * permaneça exatamente igual. Estas regras valem apenas na hora de criar um
 * lançamento novo na interface.
 */

/** Categorias que não devem mais ser escolhidas em lançamentos novos. */
export const LEGACY_CATEGORY_IDS: Record<string, string> = {
  // "Salários" genérica -> linha 4.5.01 Salários Fábrica. Substituída por
  // Salários Fábrica / Salários Loja / Salários Franqueadora.
  '1ba1adc4-6ade-4237-9eff-c268c3d0d062':
    'Categoria legada. Use Salários Fábrica, Salários Loja ou Salários Franqueadora.',
  // "Mensal Motoqueiro" -> linha 4.7.09 (Despesas Fixas). Substituída pela versão
  // variável (linha 2.1.13), mantida apenas para preservar o histórico.
  'a6716f32-f839-48b2-97c6-126442f82497':
    'Categoria legada (Despesas Fixas). Use Mensal Motoqueiro (Variável).',
};

export function isLegacyCategory(id?: string | null) {
  return !!id && id in LEGACY_CATEGORY_IDS;
}

/** Categorias de salário: unidade é obrigatória e a unidade esperada é conhecida. */
export const SALARY_CATEGORY_UNIT_HINT: Record<string, { label: string; unitCodes: string[] }> = {
  // Salários Fábrica (nova)
  'c5a1a100-0000-0000-0000-000000000001': { label: 'Fábrica', unitCodes: ['FAB'] },
  // Salários Loja (existente)
  'ee397d56-a57f-468f-b3fb-ff2c95277eda': {
    label: 'uma loja',
    unitCodes: ['CAFE', 'BLVD', 'EBB', 'EBC'],
  },
  // Salários Franqueadora (existente)
  '276f3392-6fd0-4f5e-bca1-3a69fcc1bd77': { label: 'Franqueadora', unitCodes: ['FRANQ'] },
};

export function isSalaryCategory(id?: string | null) {
  return !!id && id in SALARY_CATEGORY_UNIT_HINT;
}

/** Categorias em que o fornecedor é obrigatório em lançamentos novos. */
export const PARTNER_REQUIRED_CATEGORY_IDS: Record<string, string> = {
  'fd8e58e3-9311-4ae4-ace7-404dd884c144': 'Matéria-Prima',
  '6e0f57f7-1aaf-4c3f-92a5-5dffe4988a58': 'Embalagens',
  'fd49d959-b897-40a9-9550-28ce7ff09c89': 'Compras de Mercadorias para Revenda',
  'b3f46b60-a102-427e-98a8-9f94b6b22b86': 'Frete de Fornecedores',
  '312bf870-a928-4935-9544-783fd28564bb': 'Bonificação Fornecedores (recebida)',
};

export function isPartnerRequired(id?: string | null) {
  return !!id && id in PARTNER_REQUIRED_CATEGORY_IDS;
}

/** Texto de ajuda exibido abaixo do seletor de categoria (sem alterar rótulos). */
export const CATEGORY_HELP: Record<string, string> = {
  '9089ef52-4855-4f10-b4d9-25fa66c467d0':
    'Bonificação CONCEDIDA: desconto/brinde dado ao cliente. Entra como despesa variável.',
  '312bf870-a928-4935-9544-783fd28564bb':
    'Bonificação RECEBIDA do fornecedor: verba/abatimento vindo do fornecedor. Informe o fornecedor.',
  'c5a1a100-0000-0000-0000-000000000002':
    'Custo de motoqueiro como despesa VARIÁVEL (linha 2.1.13). Use esta em lançamentos novos.',
};

export interface CategoryValidationInput {
  categoryId?: string;
  unitId?: string;
  partnerId?: string;
  unitCodeById: Map<string, string | null>;
}

export interface CategoryValidation {
  /** Impede o salvamento. */
  errors: string[];
  /** Apenas alerta; o usuário decide. */
  warnings: string[];
}

export function validateCategoryRules({
  categoryId,
  unitId,
  partnerId,
  unitCodeById,
}: CategoryValidationInput): CategoryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isSalaryCategory(categoryId)) {
    const hint = SALARY_CATEGORY_UNIT_HINT[categoryId!];
    if (!unitId) {
      errors.push('Unidade é obrigatória em lançamentos de salário.');
    } else {
      const code = unitCodeById.get(unitId) || '';
      if (hint.unitCodes.length > 0 && !hint.unitCodes.includes(code)) {
        warnings.push(
          `Esta categoria costuma ser usada com ${hint.label}. Confira se a unidade escolhida está correta.`
        );
      }
    }
  }

  if (isPartnerRequired(categoryId) && !partnerId) {
    errors.push(
      `Fornecedor é obrigatório para a categoria ${PARTNER_REQUIRED_CATEGORY_IDS[categoryId!]}.`
    );
  }

  if (isLegacyCategory(categoryId)) {
    warnings.push(LEGACY_CATEGORY_IDS[categoryId!]);
  }

  return { errors, warnings };
}
