/**
 * Suíte T1–T20 do Plano de Correção do DRE.
 * Roda sobre a estrutura REAL das linhas do DRE (fixture copiada do banco, só leitura)
 * e sobre as funções reais de cálculo. Nenhuma classificação é alterada aqui.
 *
 * `it.fails` = comportamento esperado que o sistema AINDA NÃO tem. Quando o
 * passo do plano for feito, o teste passa a "falhar" e deve virar `it` normal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import lines from './fixtures/dre-lines.json';
import { computeLineValues, buildSubtotals } from '@/hooks/useDreReport';
import { resolveValues } from '@/hooks/useDreGerencial';
import { resolveDreTotals, LEGACY_FORMULAS } from '@/lib/dreTotals';
import {
  applyDreBase, buildAllocationMap, dateFieldForRegime, splitByUnit, NO_UNIT_KEY,
} from '@/lib/finance';
import type { Tables } from '@/integrations/supabase/types';

type Line = Tables<'dre_lines'>;
const ALL = lines as unknown as Line[];
const byCode = (c: string) => {
  const l = ALL.find((x) => x.code === c);
  if (!l) throw new Error(`linha ${c} não existe`);
  return l;
};
/** Primeira linha analítica abaixo de um grupo gerencial. */
const leafUnder = (code: string): Line => {
  const parent = byCode(code);
  const stack = ALL.filter((l) => l.parent_id === parent.id);
  while (stack.length) {
    const l = stack.shift()!;
    if (!l.is_subtotal) return l;
    stack.push(...ALL.filter((c) => c.parent_id === l.id));
  }
  throw new Error(`sem linha analítica em ${code}`);
};

let seq = 0;
type Tx = { id: string; net_amount: number; category_id: string; unit_id: string | null; type: string; is_reversal?: boolean };
/** Cria um lançamento numa "categoria" ligada à linha informada. */
function tx(line: Line, amount: number, type: 'receita' | 'despesa', extra: Partial<Tx> = {}): Tx {
  return { id: `t${++seq}`, net_amount: amount, category_id: `cat:${line.id}`, unit_id: null, type, ...extra };
}
const catMap = () => new Map(ALL.map((l) => [`cat:${l.id}`, l.id] as [string, string]));

/** DRE contábil (linhas C, com fórmulas). */
function contabil(txs: Tx[]) {
  const { lineValues } = computeLineValues(txs, new Map(), catMap(), undefined);
  const r = resolveValues(ALL, lineValues);
  return (c: string) => Math.round((r.get(byCode(c).id) ?? 0) * 100) / 100;
}
/** DRE gerencial (grupos 1–8). */
function gerencial(txs: Tx[], allocs: Parameters<typeof buildAllocationMap>[0] = [], unit?: string) {
  const r = computeLineValues(txs, buildAllocationMap(allocs), catMap(), unit);
  const s = buildSubtotals(ALL, r.lineValues);
  return { get: (c: string) => Math.round((s.get(byCode(c).id) ?? 0) * 100) / 100, raw: r };
}

const V = byCode('C1.01'), DED = byCode('C2.01'), DEV = byCode('C2.02'), CMV = byCode('C4.01');
const OCUP = byCode('C6.04'), RFIN = byCode('C8.01'), DFIN = byCode('C8.02'), IR = byCode('C10.01');
const PAT_IN = byCode('C12.01'), PAT_OUT = byCode('C12.02');
const base = () => [tx(V, 1000, 'receita'), tx(DED, 60, 'despesa')];

describe('DRE contábil — cascata (T1–T6)', () => {
  it('T1 receita e dedução: bruta 1.000, deduções −60, líquida 940', () => {
    const g = contabil(base());
    expect([g('C1'), g('C2'), g('C3')]).toEqual([1000, -60, 940]);
  });
  it('T2 custo: CMV −300, lucro bruto 640', () => {
    const g = contabil([...base(), tx(CMV, 300, 'despesa')]);
    expect([g('C4'), g('C5')]).toEqual([-300, 640]);
  });
  it('T3 despesa operacional: aluguel 200 → resultado operacional 440', () => {
    const g = contabil([...base(), tx(CMV, 300, 'despesa'), tx(OCUP, 200, 'despesa')]);
    expect(g('C7')).toBe(440);
  });
  it('T4 financeiro: rendimento 10, juros 30 → −20; antes do IR 420', () => {
    const g = contabil([...base(), tx(CMV, 300, 'despesa'), tx(OCUP, 200, 'despesa'),
      tx(RFIN, 10, 'receita'), tx(DFIN, 30, 'despesa')]);
    expect([g('C8'), g('C9')]).toEqual([-20, 420]);
  });
  it('T5 tributo sobre o lucro: IRPJ 40 → lucro líquido 380', () => {
    const g = contabil([...base(), tx(CMV, 300, 'despesa'), tx(OCUP, 200, 'despesa'),
      tx(RFIN, 10, 'receita'), tx(DFIN, 30, 'despesa'), tx(IR, 40, 'despesa')]);
    expect(g('C11')).toBe(380);
  });
  it('T6 prejuízo: despesas maiores que receitas dão lucro líquido negativo', () => {
    const g = contabil([tx(V, 100, 'receita'), tx(OCUP, 250, 'despesa')]);
    expect(g('C11')).toBe(-150);
  });
});

describe('Rateio, estorno, devolução, parcelas, cancelados (T7–T12)', () => {
  const desp = leafUnder('4.3');
  it('T7 rateio 50/50: U1 −50, U2 −50, consolidado −100', () => {
    const t = tx(desp, 100, 'despesa');
    const al = [
      { transaction_id: t.id, unit_id: 'U1', allocation_type: 'percentual', percentage: 50, amount: null },
      { transaction_id: t.id, unit_id: 'U2', allocation_type: 'percentual', percentage: 50, amount: null },
    ];
    expect([gerencial([t], al, 'U1').get('4'), gerencial([t], al, 'U2').get('4'), gerencial([t], al).get('4')])
      .toEqual([-50, -50, -100]);
  });
  it('T8 rateio incompleto: U1 −30, sem unidade −70, consolidado −100', () => {
    const t = tx(desp, 100, 'despesa');
    const al = [{ transaction_id: t.id, unit_id: 'U1', allocation_type: 'percentual', percentage: 30, amount: null }];
    const parts = splitByUnit(t, buildAllocationMap(al));
    expect(parts.find((p) => p.unitKey === 'U1')?.value).toBe(30);
    expect(parts.find((p) => p.unitKey === NO_UNIT_KEY)?.value).toBe(70);
    expect(gerencial([t], al).get('4')).toBe(-100);
  });
  it('T9 estorno: salário 1.000 + estorno 200 → linha −800 no DRE', () => {
    const sal = leafUnder('4.5');
    const g = gerencial([tx(sal, 1000, 'despesa'), tx(sal, 200, 'receita', { is_reversal: true })]);
    expect(g.get('4.5')).toBe(-800);
  });
  it('T10 devolução de venda: deduções −100, líquida 900, não vira despesa', () => {
    const g = contabil([tx(V, 1000, 'receita'), tx(DEV, 100, 'despesa')]);
    expect([g('C2'), g('C3'), g('C6')]).toEqual([-100, 900, 0]);
  });
  it('T11 parcelamento: 3 × 400 com a mesma competência somam 1.200 no mês', () => {
    const g = contabil([1, 2, 3].map(() => tx(V, 400, 'receita')));
    expect(g('C1')).toBe(1200);
  });
  it('T12 cancelado: a base do DRE exclui status cancelado', () => {
    const calls: string[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['not', 'eq', 'in']) q[m] = (...a: unknown[]) => { calls.push(`${m}:${a.join(',')}`); return q; };
    applyDreBase(q, { regime: 'competencia' });
    expect(calls).toContain('not:status,eq,cancelado');
    expect(calls).toContain('eq:affects_dre,true');
  });
});

describe('Patrimonial e regimes (T13–T15)', () => {
  it('T13 transferência: saída 500 / entrada 500 não mexe no lucro', () => {
    const g = contabil([tx(PAT_OUT, 500, 'despesa'), tx(PAT_IN, 500, 'receita')]);
    expect([g('C11'), g('C12')]).toEqual([0, 0]);
  });
  it('T13b no gerencial, patrimoniais ficam fora do superávit operacional', () => {
    const g = gerencial([tx(leafUnder('7.2'), 500, 'despesa'), tx(leafUnder('6.2'), 500, 'receita')]);
    expect([g.get('5'), g.get('8')]).toEqual([0, 0]);
  });
  it('T14 empréstimo: captação 10.000, pagamento 1.000 + juros 50 → resultado só −50', () => {
    const g = contabil([tx(PAT_IN, 10000, 'receita'), tx(PAT_OUT, 1000, 'despesa'), tx(DFIN, 50, 'despesa')]);
    expect(g('C11')).toBe(-50);
  });
  it('T15 competência usa competence_date; caixa usa payment_date', () => {
    expect(dateFieldForRegime('competencia')).toBe('competence_date');
    expect(dateFieldForRegime('caixa')).toBe('payment_date');
  });
});

describe('Paridade, estrutura, travas e fórmulas (T16–T20)', () => {
  it('T16 consolidado = soma das unidades + sem unidade (mesma regra em todos os relatórios)', () => {
    const d = leafUnder('4.3'), r = leafUnder('1.1');
    const a = tx(d, 90, 'despesa'), b = tx(r, 500, 'receita', { unit_id: 'U1' }), c = tx(d, 40, 'despesa');
    const al = [
      { transaction_id: a.id, unit_id: 'U1', allocation_type: 'percentual', percentage: 50, amount: null },
      { transaction_id: a.id, unit_id: 'U2', allocation_type: 'percentual', percentage: 50, amount: null },
    ];
    const txs = [a, b, c];
    const sum = ['U1', 'U2', NO_UNIT_KEY].reduce((s, u) => s + gerencial(txs, al, u).get('5'), 0);
    expect(sum).toBe(gerencial(txs, al).get('5'));
  });
  it('T16b os dois DREs usam o mesmo motor e dão o mesmo superávit gerencial', () => {
    const t = [tx(leafUnder('1.1'), 1000, 'receita'), tx(leafUnder('4.3'), 300, 'despesa')];
    const { lineValues } = computeLineValues(t, new Map(), catMap(), undefined);
    const fixed = buildSubtotals(ALL, lineValues).get(byCode('5').id);
    const byFormula = resolveValues(ALL, lineValues).get(byCode('5').id);
    expect(byFormula).toBe(fixed);
  });
  it('T17 estrutura: árvore íntegra e grupos principais presentes', () => {
    const ids = new Set(ALL.map((l) => l.id));
    expect(ALL.every((l) => !l.parent_id || ids.has(l.parent_id))).toBe(true);
    for (const c of ['1', '2', '3', '4', '5', '5.1', '6', '7', '8', 'C1', 'C3', 'C5', 'C7', 'C9', 'C11', 'C12']) byCode(c);
    expect(ALL.filter((l) => l.code?.startsWith('C')).length).toBeGreaterThanOrEqual(28);
    expect(ALL.filter((l) => !l.code?.startsWith('C')).length).toBeGreaterThanOrEqual(163);
  });
  it('T18 mês fechado: existe trava no banco para criar, editar e excluir lançamentos', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(sql).toMatch(/CREATE TRIGGER block_closed_period_transactions[\s\S]{0,200}INSERT OR UPDATE OR DELETE ON public\.transactions/i);
  });
  it('T19 permissões: a checagem de leitura sem login está em rls.test.ts', () => {
    expect(readFileSync(join(process.cwd(), 'src/test/rls.test.ts'), 'utf8')).toContain('"transactions"');
  });
  it('T20 fórmula circular não trava e vale 0', () => {
    const a = { ...byCode('C3'), id: 'x1', code: 'X1', formula: 'X2' } as Line;
    const b = { ...byCode('C3'), id: 'x2', code: 'X2', formula: 'X1' } as Line;
    const r = resolveValues([a, b], new Map());
    expect([r.get('x1'), r.get('x2')]).toEqual([0, 0]);
  });
});

describe('Passo 4 — totais seguem a configuração das linhas', () => {
  it('linhas 3, 5 e 8 têm fórmula cadastrada igual à regra antiga', () => {
    for (const c of ['3', '5', '8']) expect(byCode(c).formula).toBe(LEGACY_FORMULAS[c]);
  });
  it('sem fórmula cadastrada, a regra antiga dá o mesmo resultado (números não mudam)', () => {
    const t = [tx(leafUnder('1.1'), 1000, 'receita'), tx(leafUnder('2.1'), 200, 'despesa'),
      tx(leafUnder('4.3'), 300, 'despesa'), tx(leafUnder('5.1'), 100, 'despesa'), tx(leafUnder('6.2'), 50, 'receita')];
    const { lineValues } = computeLineValues(t, new Map(), catMap(), undefined);
    const comFormula = resolveDreTotals(ALL, lineValues).values;
    const semFormula = resolveDreTotals(ALL.map((l) => ({ ...l, formula: ['3', '5', '8'].includes(l.code ?? '') ? null : l.formula })), lineValues).values;
    for (const c of ['3', '5', '8']) expect(comFormula.get(byCode(c).id)).toBe(semFormula.get(byCode(c).id));
    expect(comFormula.get(byCode('3').id)).toBe(800);
    expect(comFormula.get(byCode('5').id)).toBe(500);
    expect(comFormula.get(byCode('8').id)).toBe(450);
  });
  it('mudar a fórmula na configuração muda o total, sem mexer no código', () => {
    const t = [tx(leafUnder('1.1'), 1000, 'receita'), tx(leafUnder('5.1'), 100, 'despesa')];
    const { lineValues } = computeLineValues(t, new Map(), catMap(), undefined);
    const custom = ALL.map((l) => (l.code === '8' ? { ...l, formula: '5' } : l));
    expect(resolveDreTotals(custom, lineValues).values.get(byCode('8').id)).toBe(1000);
  });
  it('fórmula circular é reportada para o aviso na tela', () => {
    const a = { ...byCode('C3'), id: 'x1', code: 'X1', formula: 'X2' } as Line;
    const b = { ...byCode('C3'), id: 'x2', code: 'X2', formula: 'X1' } as Line;
    expect(resolveDreTotals([a, b], new Map()).circular.length).toBeGreaterThan(0);
  });
});
