import { describe, expect, it } from 'vitest';
import { parseOfx, parseOfxAmount, parseOfxDate } from '@/lib/ofx';
import {
  applyRules, pickAutoLinkable, suggestMatches, textSimilarity,
  CandidateTransaction, OfxRule,
} from '@/lib/ofxMatch';


const SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>237<ACCTID>1234-5<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260701<DTEND>20260731
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260703120000[-3:BRT]<TRNAMT>1500.50<FITID>A1<MEMO>PIX RECEBIDO IFOOD</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260705<TRNAMT>-230.00<FITID>A2<NAME>TARIFA PACOTE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>10000.00<DTASOF>20260731</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('parser OFX', () => {
  it('lê conta, período, saldo e transações de arquivo SGML sem fechamento de tag', () => {
    const [st] = parseOfx(SGML);
    expect(st.acctid).toBe('1234-5');
    expect(st.bankid).toBe('237');
    expect(st.start_date).toBe('2026-07-01');
    expect(st.ledger_balance).toBe(10000);
    expect(st.transactions).toHaveLength(2);
    expect(st.transactions[0]).toMatchObject({ fitid: 'A1', posted_at: '2026-07-03', amount: 1500.5 });
    expect(st.transactions[1].amount).toBe(-230);
  });

  it('não desloca a data por causa do fuso (UTC-3)', () => {
    expect(parseOfxDate('20260813235959[-3:BRT]')).toBe('2026-08-13');
    expect(parseOfxDate('20260101')).toBe('2026-01-01');
    expect(parseOfxDate('lixo')).toBeNull();
  });

  it('aceita valor com vírgula decimal', () => {
    expect(parseOfxAmount('1.234,56')).toBe(1234.56);
    expect(parseOfxAmount('-99,90')).toBe(-99.9);
    expect(parseOfxAmount('1234.56')).toBe(1234.56);
  });

  it('rejeita arquivo sem transações', () => {
    expect(() => parseOfx('<OFX></OFX>')).toThrow();
  });
});

const tx = (over: Partial<CandidateTransaction>): CandidateTransaction => ({
  id: 't1', type: 'receita', description: 'Venda iFood', amount: 1500.5, net_amount: 1500.5,
  competence_date: '2026-07-03', due_date: '2026-07-03', payment_date: '2026-07-03',
  status: 'recebido', account_id: 'acc', category_id: null, unit_id: null, ...over,
});

describe('conciliação OFX', () => {
  const line = { fitid: 'A1', posted_at: '2026-07-03', amount: 1500.5, memo: 'PIX RECEBIDO IFOOD' };

  it('marca confiança alta para valor e data idênticos na mesma conta', () => {
    const [s] = suggestMatches(line, 'acc', [tx({})]);
    expect(s.confidence).toBe('alta');
    expect(s.amountGap).toBe(0);
  });

  it('nunca sugere lançamento de sinal oposto', () => {
    expect(suggestMatches(line, 'acc', [tx({ type: 'despesa' })])).toHaveLength(0);
  });

  it('ignora lançamentos cancelados e fora da janela de dias', () => {
    expect(suggestMatches(line, 'acc', [tx({ status: 'cancelado' })])).toHaveLength(0);
    expect(suggestMatches(line, 'acc', [tx({ payment_date: '2026-07-25', due_date: null, competence_date: '2026-07-25' })])).toHaveLength(0);
  });

  it('reconhece o valor líquido quando o banco creditou já sem impostos/taxas', () => {
    const liquido = { ...line, amount: 1400.5 };
    const [s] = suggestMatches(liquido, 'acc', [tx({ amount: 1500.5, net_amount: 1400.5, tax_amount: 100 })]);
    expect(s.basis).toBe('liquido');
    expect(s.amountGap).toBeLessThanOrEqual(0.01);
    expect(s.confidence).not.toBe('baixa');
  });

  it('explica taxa de adquirente quando o banco creditou um pouco menos', () => {
    const comTaxa = { ...line, amount: 1455.49 }; // ~3% de taxa
    const [s] = suggestMatches(comTaxa, 'acc', [tx({})]);
    expect(s.basis).toBe('taxa');
    expect(s.reasons.join(' ')).toMatch(/taxa/i);
  });

  it('explica juros/multa quando o débito saiu maior e depois do vencimento', () => {
    const despesa = { fitid: 'B1', posted_at: '2026-07-10', amount: -1050, memo: 'BOLETO FORNECEDOR ALFA' };
    const [s] = suggestMatches(despesa, 'acc', [tx({
      type: 'despesa', description: 'Compra Alfa', amount: 1000, net_amount: 1000,
      competence_date: '2026-07-05', due_date: '2026-07-05', payment_date: null, status: 'pendente',
    })]);
    expect(s.basis).toBe('juros');
    expect(s.reasons.join(' ')).toMatch(/juros/i);
  });

  it('acha a contraparte pelo nome do parceiro mesmo com memo fora do padrão', () => {
    const l = { fitid: 'C1', posted_at: '2026-07-03', amount: -800, memo: 'PIX ENV 12345 PADARIA MARTINHO' };
    const [s] = suggestMatches(l, 'acc', [tx({
      type: 'despesa', description: 'Compra de insumos', amount: 800, net_amount: 800,
      partner_name: 'Padaria Martinho',
    })]);
    expect(s.reasons.join(' ')).toMatch(/parceiro/i);
    expect(s.confidence).toBe('alta');
  });

  it('não descarta candidato só porque o valor tem centavos de diferença', () => {
    const [s] = suggestMatches({ ...line, amount: 1500.0 }, 'acc', [tx({})]);
    expect(s).toBeTruthy();
    expect(s.amountGap).toBeCloseTo(0.5, 2);
  });

  it('textSimilarity ignora palavras genéricas do extrato', () => {
    expect(textSimilarity('PIX RECEBIDO IFOOD', 'Venda iFood')).toBeGreaterThan(0.5);
    expect(textSimilarity('PIX RECEBIDO', 'TED ENVIADO')).toBe(0);
  });
});

describe('vinculação em lote', () => {
  const base = (id: string, score: number, confidence: 'alta' | 'media' | 'baixa') => ({
    transaction: tx({ id }), confidence, dayGap: 0, amountGap: 0,
    basis: 'exato' as const, score, reasons: ['valor idêntico'],
  });

  it('só aceita confiança alta, sem empate e sem disputa pelo mesmo lançamento', () => {
    const picked = pickAutoLinkable([
      { key: 'e1', suggestions: [base('t1', 90, 'alta')] },                       // ok
      { key: 'e2', suggestions: [base('t2', 90, 'alta'), base('t3', 86, 'alta')] }, // empate técnico
      { key: 'e3', suggestions: [base('t4', 70, 'media')] },                      // confiança baixa demais
      { key: 'e4', suggestions: [base('t5', 95, 'alta')] },                       // disputa com e5
      { key: 'e5', suggestions: [base('t5', 92, 'alta')] },
      { key: 'e6', suggestions: [] },                                             // sem candidato
    ]);
    expect(picked.map(p => p.key)).toEqual(['e1']);
  });
});

describe('regras por memo', () => {
  it('aplica a regra de maior prioridade e ignora regex inválida', () => {
    const rules: OfxRule[] = [
      { id: 'r0', pattern: '([', match_type: 'regex', applies_to: 'ambos', category_id: 'x', unit_id: null, front_id: null, partner_id: null, priority: 1, active: true },
      { id: 'r1', pattern: 'ifood', match_type: 'contains', applies_to: 'receita', category_id: 'cat-ifood', unit_id: null, front_id: null, partner_id: null, priority: 10, active: true },
    ];
    expect(applyRules('PIX RECEBIDO IFOOD', 1500, rules)?.category_id).toBe('cat-ifood');
    // regra de receita não vale para saída
    expect(applyRules('PIX RECEBIDO IFOOD', -1500, rules)).toBeNull();
  });
});

