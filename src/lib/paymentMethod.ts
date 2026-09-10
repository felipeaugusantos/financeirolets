/**
 * Sugestão de forma de pagamento a partir do texto (memo) do extrato.
 * É só uma sugestão: o operador sempre pode trocar antes de criar o lançamento.
 */
export type PaymentMethod =
  | 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito'
  | 'boleto' | 'transferencia' | 'cheque' | 'outro';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  cheque: 'Cheque',
  outro: 'Outro',
};

const RULES: [RegExp, PaymentMethod][] = [
  [/\bpix\b|pix\s*(env|receb|transf|qr)/i, 'pix'],
  [/\bboleto|titulo|tit\.?\s*bancario|cobranca|arrecad/i, 'boleto'],
  [/\bted\b|\bdoc\b|transfer|transf\b/i, 'transferencia'],
  [/cheque|chq\b/i, 'cheque'],
  [/cred(ito)?\s*(a\s*vista|parcelad|card)|cartao\s*de?\s*credito|\bcredito\b/i, 'cartao_credito'],
  [/debito|\bdeb\b|cartao\s*de?\s*debito/i, 'cartao_debito'],
  [/saque|dinheiro|especie|deposito\s*em\s*dinheiro/i, 'dinheiro'],
];

export function suggestPaymentMethod(memo?: string | null): PaymentMethod | null {
  const text = (memo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!text.trim()) return null;
  for (const [re, method] of RULES) if (re.test(text)) return method;
  return null;
}
