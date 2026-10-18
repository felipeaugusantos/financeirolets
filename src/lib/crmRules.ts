/** CRM calculations are commercial estimates, never financial postings. */
export const CRM_STAGES = ['qualificacao', 'briefing', 'proposta', 'negociacao', 'ganha', 'perdida'] as const;
export type CrmStage = typeof CRM_STAGES[number];

export function crmConversion(won: number, lost: number): number | null {
  if (won < 0 || lost < 0 || !Number.isInteger(won) || !Number.isInteger(lost)) throw new Error('Contagem inválida');
  return won + lost === 0 ? null : won / (won + lost);
}

export function validateCrmStage(stage: CrmStage, lossReason?: string | null): boolean {
  return CRM_STAGES.includes(stage) && (stage !== 'perdida' || Boolean(lossReason?.trim()));
}

export function normalizeCompanyDocument(document: string): string | null {
  const digits = document.replace(/\D/g, '');
  return digits || null;
}