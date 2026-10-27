import { describe, it, expect } from 'vitest';
import {
  accountMatches, bradescoHttpError, buildExtratoParams, buildSaldoParams, dropCrossSourceDuplicates, isApiFitid,
  parseApiResponse, parseBrDate, parseBrl, toApiDate, BradescoApiError, type ParsedExtrato, type ParsedSaldo,
} from '@/lib/bradescoApi';

// Trechos dos exemplos do Manual API de Saldo e Extrato (v2.2.2).
const ultimos = {
  extratoUltimosLancamentos: {
    codigoRetorno: '00', mensagem: 'CTAS0673 - CONSULTA EFETUADA COM SUCESSO',
    numeroConta: '75557', digitoConta: '5', nomeCliente: 'CONTA AMBIENTE TU', identificadorTipoConta: 'conta corrente',
    listaLancamentos: {
      'Saldo Anterior': [{ sinalSaldo: '+', valorLancamento: '0,00', identificacaoSubCodigo: 'S', numeroDocumento: '0000000', valorSaldoAposLancamento: '6.759,00', dataLancamento: '10/12/2024' }],
      'Ultimos Lancamentos': [
        { sinalSaldo: '+', valorLancamento: '1,15', segundaLinhalLancamento: '', sinalLancamento: '+', codigoLancamento: '03584', descritivoLancamentoAbreviado: 'RENT.INV.FACIL', numeroDocumento: '0000003', valorSaldoAposLancamento: '6.760,15', dataLancamento: '17/01/2025', descritivoLancamentoCompleto: 'RENTAB.INVEST FACILCRED*' },
        { sinalSaldo: '+', valorLancamento: '100,00', segundaLinhalLancamento: 'TESTE VANESSA 1', sinalLancamento: '+', codigoLancamento: '00997', descritivoLancamentoAbreviado: 'COD. LANC. 00997', numeroDocumento: '0000005', valorSaldoAposLancamento: '7.660,15', dataLancamento: '17/01/2025', descritivoLancamentoCompleto: 'COD. LANC. 00997' },
      ],
      'Lancamentos Dia': [
        { sinalSaldo: '+', valorLancamento: '15,00', segundaLinhalLancamento: 'REM: EMPRESA PAGADOR         22/01', sinalLancamento: '+', codigoLancamento: '03212', numeroDocumento: '0936269', valorSaldoAposLancamento: '8.095,16', dataLancamento: '22/01/2025', descritivoLancamentoCompleto: 'TRANSFERENCIA PIX' },
      ],
    },
  },
  extratoLancamentosFuturos: {
    codigoRetorno: '00', quantidadeLancamentos: '2',
    listaLancamentos: { 'Lancamentos Futuros': [{ valorLancamento: '1.233,00', sinalLancamento: '+', codigoLancamento: '00112', numeroDocumento: '0015446', dataLancamento: '03/02/2025' }, { valorLancamento: '478,02', sinalLancamento: '+', codigoLancamento: '00112', numeroDocumento: '0004545', dataLancamento: '03/02/2025' }] },
  },
};

const historico = {
  extratoPorPeriodo: {
    codigoRetorno: '00', numeroConta: '75557', digitoConta: '5', identificadorTipoConta: 'conta corrente',
    lstLancamentoMensal: [
      { dataLancamento: '30/09/2024', numeroDocumento: '0000000', valorLancamento: '0,00', sinalLancamento: '+', valorSaldoAposLancamento: '80,00', sinalSaldo: '+', tipoLancamento: '01', codigoLancamento: '00000', descritivoLancamentoAbreviado: 'Saldo Anterior', descritivoLancamentoCompleto: 'Saldo Anterior' },
      { dataLancamento: '01/10/2024', numeroDocumento: '0000001', valorLancamento: '700,00', sinalLancamento: '-', segundaLinhalLancamento: '', valorSaldoAposLancamento: '620,00', sinalSaldo: '-', tipoLancamento: '02', codigoLancamento: '03205', descritivoLancamentoAbreviado: 'TRANSFE PIX', descritivoLancamentoCompleto: 'TRANSFERENCIA PIX' },
      { dataLancamento: '05/10/2024', numeroDocumento: '0000001', valorLancamento: '800,00', sinalLancamento: '+', segundaLinhalLancamento: '', valorSaldoAposLancamento: '180,00', sinalSaldo: '+', tipoLancamento: '02', codigoLancamento: '03205', descritivoLancamentoAbreviado: 'TRANSFE PIX', descritivoLancamentoCompleto: 'TRANSFERENCIA PIX' },
      { dataLancamento: '05/10/2024', numeroDocumento: '0000001', valorLancamento: '800,00', sinalLancamento: '+', segundaLinhalLancamento: '', valorSaldoAposLancamento: '980,00', sinalSaldo: '+', tipoLancamento: '02', codigoLancamento: '03205', descritivoLancamentoAbreviado: 'TRANSFE PIX', descritivoLancamentoCompleto: 'TRANSFERENCIA PIX' },
    ],
  },
};

const saldo = {
  saldoCC: {
    codigoRetorno: '00', mensagem: 'CTAS0673 - CONSULTA EFETUADA COM SUCESSO', numeroConta: '75557', digitoConta: '5', identificadorTipoConta: 'conta corrente',
    lstLancamentosSaldos: [
      { nomeProduto: 'DISPONIVEL:', codigoProduto: 999, valorLancamento: '0,00', sinalSaldo: '+' },
      { nomeProduto: '= TOTAL DE RECURSOS', codigoProduto: 995, valorLancamento: '77,95', sinalSaldo: '+' },
      { nomeProduto: '+ CTA CORRENTE', codigoProduto: 998, valorLancamento: '77,95', sinalSaldo: '+' },
      { nomeProduto: 'LINHA EM BRANCO', codigoProduto: 977, valorLancamento: '', sinalSaldo: '' },
      { nomeProduto: 'SALDO TOTAL', codigoProduto: 984, valorLancamento: '77,95', sinalSaldo: '+' },
      { nomeProduto: 'LIMITE CHEQUE ESPECIAL', codigoProduto: 994, valorLancamento: '1.000,00', sinalSaldo: '+' },
      { nomeProduto: '= TOTAL BLOQUEADO', codigoProduto: 985, valorLancamento: '10,00', sinalSaldo: '-' },
    ],
  },
};

describe('formatos do manual', () => {
  it('datas e valores', () => {
    expect(toApiDate('2024-11-06')).toBe('06112024');
    expect(parseBrDate('22/01/2025')).toBe('2025-01-22');
    expect(parseBrDate('31/02/2025')).toBeNull();
    expect(parseBrl('1.233,00')).toBe(1233);
    expect(parseBrl('0,00')).toBe(0);
    expect(parseBrl('6.759,00')).toBe(6759);
    expect(parseBrl('abc')).toBeNaN();
    expect(parseBrl('')).toBeNaN();
  });
});

describe('parâmetros das consultas', () => {
  it('extrato no formato do manual (agência 4, conta sem dígito, ddmmaaaa)', () => {
    const r = buildExtratoParams({ agencia: '3750', conta: '75557', from: '2024-11-06', to: '2024-11-20', tipo: 'cc', tipoOperacao: 1 });
    expect(r.params).toEqual({ agencia: '3750', conta: '75557', dataInicio: '06112024', dataFim: '20112024', tipo: 'cc', tipoOperacao: '1' });
  });
  it('recusa agência/conta fora do padrão e período invertido', () => {
    expect(buildExtratoParams({ agencia: '37500', conta: '1', from: '2024-01-01', to: '2024-01-02', tipo: 'cc' }).ok).toBe(false);
    expect(buildSaldoParams({ agencia: '3995', conta: '12345678' }).ok).toBe(false);
    expect(buildExtratoParams({ agencia: '3750', conta: '1', from: '2024-02-01', to: '2024-01-01', tipo: 'cc' }).error).toMatch(/final/);
  });
  it('avisa acima de 1 ano e recusa acima de 10', () => {
    const longo = buildExtratoParams({ agencia: '3750', conta: '1', from: '2024-01-01', to: '2025-06-01', tipo: 'cp' });
    expect(longo.ok).toBe(true);
    expect(longo.warnings.join(' ')).toMatch(/1 em 1 ano/);
    expect(buildExtratoParams({ agencia: '3750', conta: '1', from: '2010-01-01', to: '2025-01-01', tipo: 'cc' }).ok).toBe(false);
  });
  it('saldo usa tipoOperacao 1 por padrão', () => {
    expect(buildSaldoParams({ agencia: '3995', conta: '75557' }).params).toEqual({ agencia: '3995', conta: '75557', tipoOperacao: '1' });
  });
});

describe('leitura do extrato', () => {
  const r = parseApiResponse(ultimos) as ParsedExtrato;
  it('importa só os últimos lançamentos (D-1); D0 e futuros ficam de fora', () => {
    expect(r.kind).toBe('extrato');
    expect(r.entries).toHaveLength(2);
    expect(r.skipped).toEqual({ dia: 1, futuros: 2, invalidos: 0 });
    expect(r.warnings.join(' ')).toMatch(/D0/);
  });
  it('converte data, valor, sinal e descrição', () => {
    expect(r.entries[0]).toMatchObject({ posted_at: '2025-01-17', amount: 1.15, trn_type: 'CREDIT', memo: 'RENTAB.INVEST FACILCRED*' });
    expect(r.entries[1].memo).toBe('COD. LANC. 00997 — TESTE VANESSA 1');
  });
  it('identifica a conta e o saldo anterior/final', () => {
    expect(r.account).toMatchObject({ kind: 'cc', numero: '75557', digito: '5' });
    expect(r.opening).toEqual({ date: '2024-12-10', balance: 6759 });
    expect(r.closing).toEqual({ date: '2025-01-17', balance: 7660.15 });
  });
  it('histórico: débito vira negativo e o saldo negativo respeita o sinal', () => {
    const h = parseApiResponse(historico) as ParsedExtrato;
    expect(h.entries.map(e => e.amount)).toEqual([-700, 800, 800]);
    expect(h.entries[0].trn_type).toBe('DEBIT');
    expect(h.entries[0].balance_after).toBe(-620);
    expect(h.opening).toEqual({ date: '2024-09-30', balance: 80 });
    expect(h.closing).toEqual({ date: '2024-10-05', balance: 980 });
  });
  it('linhas idênticas no mesmo dia ganham identificadores diferentes e estáveis', () => {
    const a = parseApiResponse(historico) as ParsedExtrato;
    const b = parseApiResponse(JSON.parse(JSON.stringify(historico))) as ParsedExtrato;
    const ids = a.entries.map(e => e.fitid);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toMatch(/:1$/);
    expect(ids[2]).toMatch(/:2$/);
    expect(b.entries.map(e => e.fitid)).toEqual(ids);
    expect(ids.every(isApiFitid)).toBe(true);
  });
  it('linha sem sinal ou com data inválida é descartada e contada', () => {
    const bad = JSON.parse(JSON.stringify(ultimos));
    bad.extratoUltimosLancamentos.listaLancamentos['Ultimos Lancamentos'][0].sinalLancamento = '';
    bad.extratoUltimosLancamentos.listaLancamentos['Ultimos Lancamentos'][1].dataLancamento = '99/99/2025';
    const x = parseApiResponse(bad) as ParsedExtrato;
    expect(x.entries).toHaveLength(0);
    expect(x.skipped.invalidos).toBe(2);
  });
  it('codigoRetorno 01 avisa que há mais registros; 04/08/24 viram erro em português', () => {
    const more = JSON.parse(JSON.stringify(historico));
    more.extratoPorPeriodo.codigoRetorno = '01';
    const m = parseApiResponse(more) as ParsedExtrato;
    expect(m.hasMore).toBe(true);
    expect(m.warnings.join(' ')).toMatch(/5\.000/);
    const err = JSON.parse(JSON.stringify(historico));
    err.extratoPorPeriodo.codigoRetorno = '04';
    err.extratoPorPeriodo.mensagem = 'SEM ACESSO';
    expect(() => parseApiResponse(err)).toThrow(/Sem autorização.*SEM ACESSO/);
  });
});

describe('leitura do saldo', () => {
  const s = parseApiResponse(saldo) as ParsedSaldo;
  it('separa os principais saldos pelo nome do produto', () => {
    expect(s.kind).toBe('saldo');
    expect(s.totalResources).toBe(77.95);
    expect(s.checking).toBe(77.95);
    expect(s.total).toBe(77.95);
    expect(s.overdraftLimit).toBe(1000);
    expect(s.blocked).toBe(-10);
    expect(s.lines.some(l => /LINHA EM BRANCO/.test(l.name))).toBe(false);
  });
});

describe('entrada inválida', () => {
  it('JSON quebrado, formato desconhecido e HTTP', () => {
    expect(() => parseApiResponse('{oi')).toThrow(BradescoApiError);
    expect(() => parseApiResponse({ qualquer: 1 })).toThrow(/Não reconheci/);
    expect(() => parseApiResponse([])).toThrow(/formato/);
    expect(bradescoHttpError(403)).toMatch(/Sessão expirada/);
    expect(bradescoHttpError(418)).toMatch(/418/);
  });
});

describe('conta e duplicidade', () => {
  it('compara com o ACCTID do OFX', () => {
    expect(accountMatches('75557-5', '75557', '5')).toBe('match');
    expect(accountMatches('0000075557', '75557', '5')).toBe('match');
    expect(accountMatches('12345', '75557', '5')).toBe('mismatch');
    expect(accountMatches(null, '75557', '5')).toBe('unknown');
  });
  it('descarta linha que já existe de outra origem (data + valor), uma a uma', () => {
    const rows = [
      { posted_at: '2025-01-17', amount: 100 },
      { posted_at: '2025-01-17', amount: 100 },
      { posted_at: '2025-01-17', amount: -5 },
    ];
    const { kept, dropped } = dropCrossSourceDuplicates(rows, [{ posted_at: '2025-01-17', amount: 100 }]);
    expect(dropped).toHaveLength(1);
    expect(kept).toEqual([{ posted_at: '2025-01-17', amount: 100 }, { posted_at: '2025-01-17', amount: -5 }]);
  });
});
