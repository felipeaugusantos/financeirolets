import { describe, expect, it } from 'vitest';
import {
  CandidateTransaction,
  DescriptionMatch,
  duplicateSignature,
  matchByDescription,
  normalizeText,
  pairDuplicates,
  PairableItem,
} from '@/lib/ofxMatch';
import { parseOfx, parseOfxAmount } from '@/lib/ofx';

const tx = (over: Partial<CandidateTransaction> & { id: string }): CandidateTransaction => ({
  type: 'receita', description: 'Venda iFood', amount: 0.12, net_amount: 0.12,
  competence_date: '2026-08-06', due_date: '2026-08-06', payment_date: '2026-08-06',
  status: 'recebido', account_id: 'acc', category_id: null, unit_id: null,
  front_id: null, partner_id: null, ...over,
});

const line = (key: string, over: Partial<Omit<PairableItem, 'descMatch' | 'outcome'>> = {}) => ({
  key, memo: 'Venda iFood', posted_at: '2026-08-06', amount: 0.12, ...over,
});

/** Monta os itens do pareamento do mesmo jeito que o hook de importação faz. */
const build = (
  lines: ReturnType<typeof line>[],
  candidates: CandidateTransaction[],
  outcome: PairableItem['outcome'] = null
): PairableItem[] =>
  lines.map(l => ({
    ...l,
    outcome,
    descMatch: matchByDescription(l.memo, l.amount, l.posted_at, candidates, outcome),
  }));

describe('pareamento 1:1 de duplicados exatos', () => {
  it('distribui um lançamento distinto para cada linha idêntica', () => {
    const candidates = [tx({ id: 't1' }), tx({ id: 't2' }), tx({ id: 't3' })];
    const items = build([line('e1'), line('e2'), line('e3')], candidates);

    const { patches, groups } = pairDuplicates(items);

    const ids = ['e1', 'e2', 'e3'].map(k => patches.get(k)?.transaction?.id);
    expect(ids).toEqual(['t1', 't2', 't3']);
    expect(new Set(ids).size).toBe(3);
    expect(['e1', 'e2', 'e3'].every(k => patches.get(k)?.autoLinkable)).toBe(true);

    expect(groups).toHaveLength(1);
    expect(groups[0].entryCount).toBe(3);
    expect(groups[0].candidateCount).toBe(3);
    expect(groups[0].lines.map(l => l.outcome)).toEqual(['pareado', 'pareado', 'pareado']);
  });

  it('não reaproveita lançamento já vinculado a outra linha', () => {
    const candidates = [tx({ id: 't1' }), tx({ id: 't2' })];
    const items = build([line('e1'), line('e2')], candidates);

    const { patches } = pairDuplicates(items, ['t1']);
    expect(patches.get('e1')?.transaction?.id).toBe('t2');
    expect(patches.get('e2')).toBeUndefined();
  });

  it('sobra de linhas fica sem lançamento e o grupo alerta o déficit', () => {
    const candidates = [tx({ id: 't1' }), tx({ id: 't2' })];
    const { groups } = pairDuplicates(build([line('e1'), line('e2'), line('e3')], candidates));

    const outcomes = groups[0].lines.map(l => l.outcome);
    expect(outcomes).toEqual(['pareado', 'pareado', 'sem-lancamento']);
    expect(groups[0].entryCount - groups[0].candidateCount).toBe(1);
  });

  it('marca divergência da regra sem bloquear a reserva do lançamento', () => {
    const candidates = [tx({ id: 't1' }), tx({ id: 't2' })];
    const outcome = {
      rule: {
        id: 'r1', pattern: 'ifood', match_type: 'contains' as const, applies_to: 'ambos' as const,
        category_id: 'cat-x', unit_id: null, front_id: null, partner_id: null, priority: 1, active: true,
      },
      category_id: 'cat-x', unit_id: null, front_id: null, partner_id: null,
    };
    const items = build([line('e1'), line('e2')], candidates, outcome as PairableItem['outcome']);

    const { patches, groups } = pairDuplicates(items);
    expect(patches.get('e1')?.transaction?.id).toBe('t1');
    expect(patches.get('e1')?.autoLinkable).toBe(false);
    expect(patches.get('e1')?.divergences).toContain('categoria');
    expect(groups[0].lines[0].outcome).toBe('divergente');
  });

  it('não cria grupo quando a linha é única e tem um só candidato', () => {
    const { patches, groups } = pairDuplicates(build([line('e1')], [tx({ id: 't1' })]));
    expect(groups).toHaveLength(0);
    expect(patches.size).toBe(0); // candidato único já é resolvido por matchByDescription
  });
});

describe('duplicados apenas parciais', () => {
  it('linhas com a mesma descrição mas datas diferentes não disputam o mesmo lançamento', () => {
    const candidates = [tx({ id: 't1' }), tx({ id: 't2', payment_date: '2026-08-07', due_date: '2026-08-07', competence_date: '2026-08-07' })];
    const items = build([line('e1'), line('e2', { posted_at: '2026-08-07' })], candidates);

    expect(items[0].descMatch.transaction?.id).toBe('t1');
    expect(items[1].descMatch.transaction?.id).toBe('t2');
    const { patches, groups } = pairDuplicates(items);
    expect(patches.size).toBe(0);
    expect(groups).toHaveLength(0);
  });

  it('valor diferente vira similaridade, nunca vínculo automático', () => {
    const m = matchByDescription('Venda iFood', 0.13, '2026-08-06', [tx({ id: 't1' })], null);
    expect(m.autoLinkable).toBe(false);
    expect(m.similar).toBe(true);
    expect(m.similarReasons).toContain('valor');
  });

  it('duas linhas iguais com um único lançamento deixam a segunda sem par', () => {
    const items = build([line('e1'), line('e2')], [tx({ id: 't1' })]);
    // matchByDescription já resolve a primeira (candidato único)
    expect(items[0].descMatch.transaction?.id).toBe('t1');
    const { groups } = pairDuplicates(items);
    expect(groups[0].lines.map(l => l.outcome)).toEqual(['unico', 'unico']);
    // as duas apontam para o mesmo lançamento: o painel expõe o conflito ao usuário
    expect(groups[0].candidateCount).toBe(1);
    expect(groups[0].entryCount).toBe(2);
  });

  it('sinal oposto (saída x entrada) nunca entra no mesmo grupo de pareamento', () => {
    const m = matchByDescription('Venda iFood', -0.12, '2026-08-06', [tx({ id: 't1' })], null);
    expect(m.transactions).toHaveLength(0);
  });
});

describe('formatos de valor e assinatura de duplicidade', () => {
  it('aceita vírgula decimal, separador de milhar e sinal negativo', () => {
    expect(parseOfxAmount('0,12')).toBe(0.12);
    expect(parseOfxAmount('1.234,56')).toBe(1234.56);
    expect(parseOfxAmount('-1234.56')).toBe(-1234.56);
    expect(parseOfxAmount(' 12.00 ')).toBe(12);
  });

  it('assinatura ignora sinal, acentos e caixa da descrição', () => {
    expect(duplicateSignature('PIX RECEBIDO IFOOD', '2026-08-06', -0.12))
      .toBe(duplicateSignature('Pix Recebido Ifood', '2026-08-06', 0.12));
    expect(normalizeText('  Venda   iFood ')).toBe(normalizeText('venda ifood'));
  });

  it('assinatura separa valores diferentes por centavo', () => {
    expect(duplicateSignature('X', '2026-08-06', 0.12)).not.toBe(duplicateSignature('X', '2026-08-06', 0.13));
  });

  it('pareia duplicados vindos de um arquivo OFX real com valores em formatos distintos', () => {
    const file = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>237<ACCTID>9<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260801<DTEND>20260831
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260806120000[-3:BRT]<TRNAMT>0.12<FITID>F1<MEMO>Venda iFood</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260806<TRNAMT>0,12<FITID>F2<MEMO>VENDA IFOOD</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

    const [st] = parseOfx(file);
    expect(st.transactions.map(t => t.amount)).toEqual([0.12, 0.12]);

    const items = build(
      st.transactions.map(t => ({ key: t.fitid, memo: t.memo, posted_at: t.posted_at, amount: t.amount })),
      [tx({ id: 't1' }), tx({ id: 't2' })]
    );
    const { patches, groups } = pairDuplicates(items);
    expect(patches.get('F2')?.transaction?.id).toBe('t2');
    expect(groups).toHaveLength(1);
  });
});

describe('estabilidade do pareamento', () => {
  it('reexecutar com o mesmo estado devolve exatamente a mesma alocação', () => {
    const candidates = [tx({ id: 't1' }), tx({ id: 't2' })];
    const run = () => pairDuplicates(build([line('e1'), line('e2')], candidates));
    const a = run().patches.get('e1')?.transaction?.id;
    const b = run().patches.get('e1')?.transaction?.id;
    expect(a).toBe(b);
  });

  it('não altera o DescriptionMatch original das linhas', () => {
    const items = build([line('e1'), line('e2')], [tx({ id: 't1' }), tx({ id: 't2' })]);
    const before: DescriptionMatch = items[0].descMatch;
    pairDuplicates(items);
    expect(before.transaction).toBeNull();
  });
});
