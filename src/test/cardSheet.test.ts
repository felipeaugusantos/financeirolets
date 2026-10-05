import { describe, it, expect } from 'vitest';
import {
  parseSheetDate, parseSheetAmount, parseCardSheets, prepareCardRows, storedAmount,
  checkBlockTotal, matchByName, cardLabelFromTitle,
} from '@/lib/cardSheet';

const REF = new Date(2026, 9, 5); // 05/10/2026

describe('datas de planilha de cartão', () => {
  it('lê dd/mm/aaaa, aaaa-mm-dd e número serial do Excel', () => {
    expect(parseSheetDate('04/03/2026', REF)).toBe('2026-03-04');
    expect(parseSheetDate('2026-09-09', REF)).toBe('2026-09-09');
    expect(parseSheetDate(46085, REF)).toBe('2026-03-04');
    expect(parseSheetDate(new Date(2026, 2, 4), REF)).toBe('2026-03-04');
  });

  it('lê "13 AGO", "13 de agosto" e "05/03" (sem ano) usando o ano de referência', () => {
    expect(parseSheetDate('13 AGO', REF)).toBe('2026-08-13');
    expect(parseSheetDate('05 SET', REF)).toBe('2026-09-05');
    expect(parseSheetDate('13 de agosto', REF)).toBe('2026-08-13');
    expect(parseSheetDate('05/03', REF)).toBe('2026-03-05');
    expect(parseSheetDate('13 AGO 2025', REF)).toBe('2025-08-13');
  });

  it('data sem ano que cairia no futuro é do ano anterior (fatura de dezembro importada em janeiro)', () => {
    expect(parseSheetDate('20 DEZ', new Date(2027, 0, 10))).toBe('2026-12-20');
    expect(parseSheetDate('05 JAN', new Date(2027, 0, 10))).toBe('2027-01-05');
  });

  it('rejeita data inexistente, texto e vazio', () => {
    expect(parseSheetDate('31/02/2026', REF)).toBeNull();
    expect(parseSheetDate('TOTAL', REF)).toBeNull();
    expect(parseSheetDate('', REF)).toBeNull();
    expect(parseSheetDate('13 XYZ', REF)).toBeNull();
  });
});

describe('valores de planilha de cartão', () => {
  it('lê número, "1.234,56", "R$ 12,00" e parênteses como negativo', () => {
    expect(parseSheetAmount(60.84)).toBe(60.84);
    expect(parseSheetAmount('1.234,56')).toBe(1234.56);
    expect(parseSheetAmount('R$ 12,00')).toBe(12);
    expect(parseSheetAmount('(12,00)')).toBe(-12);
    expect(parseSheetAmount('-276')).toBe(-276);
    expect(parseSheetAmount('')).toBeNull();
    expect(parseSheetAmount('abc')).toBeNull();
  });
});

// Layout 1 — fatura simples: Dia / O que é / Valor (R$) / Responsável, com linha TOTAL e coluna de apoio.
const nubank: unknown[][] = [
  ['Dia', 'O que é', 'Valor (R$)', 'Responsável', '', '', 'ana', 'bia'],
  ['13 AGO', 'Padaria Central', 10.15, 'ana', '', '', '', ''],
  ['19 AGO', 'Transação de Pedágio', 9.12, 'pedagio', '', '', 100, 200],
  ['19 AGO', 'Transação de Pedágio', 9.12, 'pedagio', '', '', '', ''],
  ['05 SET', 'Loja com estorno', -4.5, 'ana', '', '', '', ''],
  ['', 'TOTAL', 23.89, '', '', '', '', ''],
];

// Layout 2 — Porto Seguro: cabeçalho comum, datas sem ano, observação.
const porto: unknown[][] = [
  ['Data', 'Descrição', 'Valor', 'Observação'],
  ['05/03', 'LOJA SANTO A LOJA 06/06 SAO PAULO', 302.79, 'INSUMO LOJA'],
  ['09/06', 'GFP GESTAO PREMIUM 03/12', 158.33, 'DESCONSIDERAR COMPRA'],
  ['09/06', 'GFP GESTAO PREMIUM 03/12', -158.33, 'ESTORNO COMPRA DE CIMA'],
];

// Layout 3 — planilha montada à mão: títulos, dois cartões lado a lado, categoria/unidade sem cabeçalho,
// totais no fim e uma terceira lista sem cabeçalho de data.
const infinity: unknown[][] = [
  ['CARTÃO VISA INFINITY - VENC. 09/09', '', '', '', '', '', 'CARTÃO MASTERCARD BLACK - VENC. 09/09', '', '', '', '', '', 'Kaique', '', ''],
  ['TITULAR EXEMPLO', '', '', '', '', '', 'TITULAR EXEMPLO', '', '', '', '', '', '', '', ''],
  ['DATA', 'LANÇAMENTO', 'VALOR', '', '', '', 'DATA', 'LANÇAMENTO', 'VALOR', '', '', '', '', '', ''],
  ['04/03/2026', 'Loja Santo A*loja 06/06', 60.84, 'Materia Prima', 'Fabrica', '', '04/03/2026', 'Loja Santo A*loja 06/06', 60.84, 'Materia Prima', 'Boulevard', '', '29/11/2025', 'Spiti*finclass', 34.9],
  ['13/03/2026', 'Ec *mercadopagocet06/12', 39.16, 'Materia Prima', 'Fabrica', '', '05/03/2026', 'Pg *worc', 100, 'Cobrança Indevida', '', '', '19/01/2026', '3w Funilaria', 172],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'TOTAL', 100, '', '', '', 'total internacional do cartão', '', 10, '', '', '', '', '', ''],
  ['', '', '', '', '', '', 'total nacional do cartão - final 3093', '', 170.84, '', '', '', '', '', ''],
];

describe('detecção de tabelas', () => {
  it('lê a fatura simples (Dia / O que é / Valor) e separa a linha TOTAL', () => {
    const res = parseCardSheets([{ name: 'Fatura', matrix: nubank }], REF);
    expect(res.blocks).toHaveLength(1);
    const b = res.blocks[0];
    expect(b.rows.map(r => r.posted_at)).toEqual(['2026-08-13', '2026-08-19', '2026-08-19', '2026-09-05']);
    expect(b.rows[0].description).toBe('Padaria Central');
    expect(b.rows[0].note).toBe('Responsável: ana');
    expect(b.totals).toEqual([{ label: 'TOTAL', amount: 23.89 }]);
    expect(b.ignored).toBe(0);
  });

  it('não confunde a tabelinha de apoio ao lado com lançamentos', () => {
    const b = parseCardSheets([{ name: 'Fatura', matrix: nubank }], REF).blocks[0];
    expect(b.rows).toHaveLength(4);
  });

  it('lê cabeçalho comum com data sem ano', () => {
    const b = parseCardSheets([{ name: 'Despesas', matrix: porto }], REF).blocks[0];
    expect(b.rows).toHaveLength(3);
    expect(b.rows[0].posted_at).toBe('2026-03-05');
    expect(b.rows[0].note).toBe('Observação: INSUMO LOJA');
  });

  it('acha o cabeçalho abaixo dos títulos e lê as duas tabelas lado a lado, uma por cartão', () => {
    const res = parseCardSheets([{ name: 'Planilha1', matrix: infinity }], REF);
    expect(res.blocks).toHaveLength(2);
    const [visa, master] = res.blocks;
    expect(visa.card).toBe('VISA INFINITY');
    expect(master.card).toBe('MASTERCARD BLACK');
    expect(visa.rows).toHaveLength(2);
    expect(master.rows).toHaveLength(2);
    // a lista "Kaique" (sem cabeçalho de data) fica de fora
    expect([...visa.rows, ...master.rows].some(r => r.description.includes('Spiti'))).toBe(false);
    expect(res.warnings.join(' ')).toContain('lado a lado');
  });

  it('guarda categoria e unidade digitadas ao lado do valor (colunas sem cabeçalho)', () => {
    const [visa, master] = parseCardSheets([{ name: 'Planilha1', matrix: infinity }], REF).blocks;
    expect(visa.rows[0]).toMatchObject({ categoryHint: 'Materia Prima', unitHint: 'Fabrica' });
    expect(master.rows[0]).toMatchObject({ categoryHint: 'Materia Prima', unitHint: 'Boulevard' });
    // coluna com cabeçalho ("Responsável") não vira categoria
    const nu = parseCardSheets([{ name: 'F', matrix: nubank }], REF).blocks[0];
    expect(nu.rows[0].categoryHint).toBeNull();
  });

  it('usa a primeira aba que tiver tabela e avisa', () => {
    const res = parseCardSheets(
      [{ name: 'Resumo', matrix: [['nada', 'aqui']] }, { name: 'Despesas', matrix: porto }],
      REF,
    );
    expect(res.blocks).toHaveLength(1);
    expect(res.warnings.join(' ')).toContain('Despesas');
  });

  it('planilha sem cabeçalho reconhecível não devolve blocos', () => {
    expect(parseCardSheets([{ name: 'X', matrix: [['a', 'b', 'c'], [1, 2, 3]] }], REF).blocks).toEqual([]);
  });

  it('mantém o formato antigo: coluna "Final do cartão" separa por cartão', () => {
    const old: unknown[][] = [
      ['Data', 'Descrição', 'Valor', 'Final do cartão'],
      ['04/03/2026', 'Compra A', 10, '**** 1234'],
      ['05/03/2026', 'Compra B', 20, '5678'],
    ];
    const b = parseCardSheets([{ name: 'S', matrix: old }], REF).blocks[0];
    expect(b.rows.map(r => r.card)).toEqual(['1234', '5678']);
  });
});

describe('conferência com o total da planilha', () => {
  it('confere quando a soma é igual ao total', () => {
    const b = parseCardSheets([{ name: 'Fatura', matrix: nubank }], REF).blocks[0];
    // 10,15 + 9,12 + 9,12 − 4,50 = 23,89
    expect(checkBlockTotal(b)).toEqual({ sum: 23.89, status: 'ok', informed: 23.89 });
  });

  it('confere quando o total nacional inclui o internacional listado à parte', () => {
    const [, master] = parseCardSheets([{ name: 'Planilha1', matrix: infinity }], REF).blocks;
    // linhas 60,84 + 100,00 = 160,84; internacional 10,00; nacional 170,84 = 160,84 + 10,00
    expect(master.totals).toHaveLength(2);
    expect(checkBlockTotal(master)).toEqual({ sum: 160.84, status: 'ok', informed: 170.84 });
  });

  it('avisa quando a soma não bate com nenhum total', () => {
    const [, master] = parseCardSheets([{ name: 'Planilha1', matrix: infinity }], REF).blocks;
    const faltando = { ...master, rows: master.rows.slice(0, 1) }; // uma linha de fora
    expect(checkBlockTotal(faltando).status).toBe('diff');
  });

  it('sem linha de total, não afirma nada', () => {
    const b = parseCardSheets([{ name: 'Despesas', matrix: porto }], REF).blocks[0];
    expect(checkBlockTotal(b).status).toBe('none');
  });
});

describe('sinal e anti-duplicidade', () => {
  it('compras positivas viram despesa (negativo) e estorno vira receita (positivo)', () => {
    expect(storedAmount(60.84, 'compras-positivas')).toBe(-60.84);
    expect(storedAmount(-4.5, 'compras-positivas')).toBe(4.5);
    expect(storedAmount(-60.84, 'compras-negativas')).toBe(-60.84);
    expect(storedAmount(0, 'compras-positivas')).toBe(0);
  });

  it('compras idênticas no mesmo dia são mantidas; só a 1ª usa a chave antiga', () => {
    const blocks = parseCardSheets([{ name: 'Fatura', matrix: nubank }], REF).blocks;
    const rows = prepareCardRows(blocks, 'acc', 'compras-positivas');
    const pedagio = rows.filter(r => r.description === 'Transação de Pedágio');
    expect(pedagio).toHaveLength(2);
    expect(pedagio[0].hashKey).toBe('acc|2026-08-19|Transação de Pedágio|9.12|');
    expect(pedagio[1].hashKey).toBe('acc|2026-08-19|Transação de Pedágio|9.12||#2');
    expect(new Set(rows.map(r => r.hashKey)).size).toBe(rows.length);
  });

  it('o hash não depende da opção de sinal (reimportar não duplica)', () => {
    const blocks = parseCardSheets([{ name: 'Despesas', matrix: porto }], REF).blocks;
    const a = prepareCardRows(blocks, 'acc', 'compras-positivas').map(r => r.hashKey);
    const b = prepareCardRows(blocks, 'acc', 'compras-negativas').map(r => r.hashKey);
    expect(a).toEqual(b);
  });
});

describe('vínculo por nome', () => {
  const cats = [{ name: 'Matéria-Prima' }, { name: 'Manutenção' }, { name: 'Despesas Diversas' }];
  const units = [{ name: "Let's Boulevard" }, { name: 'Fábrica' }, { name: "Let's Café" }];

  it('ignora acento, hífen e maiúsculas', () => {
    expect(matchByName(cats, 'Materia Prima')?.name).toBe('Matéria-Prima');
    expect(matchByName(units, 'Fabrica')?.name).toBe('Fábrica');
  });

  it('aceita nome parcial só quando há um único candidato', () => {
    expect(matchByName(units, 'Boulevard')?.name).toBe("Let's Boulevard");
    expect(matchByName(units, "Let's")).toBeNull(); // ambíguo
    expect(matchByName(units, 'xx')).toBeNull();
    expect(matchByName(units, '')).toBeNull();
  });

  it('rótulo do cartão sai do título', () => {
    expect(cardLabelFromTitle('CARTÃO VISA INFINITY - VENC. 09/09')).toBe('VISA INFINITY');
    expect(cardLabelFromTitle('Cartão final 3093 - venc. 10/10')).toBe('3093');
    expect(cardLabelFromTitle(null)).toBeNull();
  });
});
