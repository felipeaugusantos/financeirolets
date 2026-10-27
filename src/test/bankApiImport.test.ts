import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const db: { tables: Record<string, Row[]>; upserts: { table: string; rows: Row[]; opts?: Row }[]; inserts: { table: string; row: Row }[]; errors: Record<string, { message: string; code?: string }> } =
    { tables: {}, upserts: [], inserts: [], errors: {} };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q; },
      gte: (c: string, v: string) => { filters.push(r => String(r[c]) >= v); return q; },
      lte: (c: string, v: string) => { filters.push(r => String(r[c]) <= v); return q; },
      range: (a: number, b: number) => Promise.resolve({ data: (db.tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: (db.tables[table] ?? []).find(r => filters.every(f => f(r))) ?? null, error: null }),
      upsert: (rows: Row | Row[], opts?: Row) => {
        const list = Array.isArray(rows) ? rows : [rows];
        db.upserts.push({ table, rows: list, opts });
        return Promise.resolve({ error: db.errors[`${table}.upsert`] ?? null });
      },
      insert: (row: Row) => { db.inserts.push({ table, row }); return Promise.resolve({ error: db.errors[`${table}.insert`] ?? null }); },
    };
    return q;
  };
  return { db, supabase: { from } };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

import { commitApiImport, dropRowsAlreadyFromApi, fetchApiEntries, planApiImport } from '@/lib/bankApiImport';
import { parseApiResponse, type ParsedExtrato, type ParsedSaldo } from '@/lib/bradescoApi';

const extrato = (lines: Row[], conta = '75557') => parseApiResponse({
  extratoPorPeriodo: {
    codigoRetorno: '00', numeroConta: conta, digitoConta: '5', identificadorTipoConta: 'conta corrente',
    lstLancamentoMensal: [
      { dataLancamento: '30/09/2024', numeroDocumento: '0000000', valorLancamento: '0,00', sinalLancamento: '+', valorSaldoAposLancamento: '80,00', sinalSaldo: '+', tipoLancamento: '01', descritivoLancamentoAbreviado: 'Saldo Anterior' },
      ...lines,
    ],
  },
}) as ParsedExtrato;

const line = (date: string, valor: string, sinal: string, saldo: string, doc = '0000001'): Row => ({
  dataLancamento: date, numeroDocumento: doc, valorLancamento: valor, sinalLancamento: sinal, valorSaldoAposLancamento: saldo, sinalSaldo: '+',
  tipoLancamento: '02', codigoLancamento: '03205', descritivoLancamentoCompleto: 'TRANSFERENCIA PIX', segundaLinhalLancamento: '',
});

beforeEach(() => {
  h.db.tables = {
    accounts: [{ id: 'a1', name: 'Bradesco', ofx_acctid: '75557-5' }, { id: 'a2', name: 'Stone', ofx_acctid: '99999' }, { id: 'a3', name: 'Nova', ofx_acctid: null }],
    bank_statement_entries: [],
  };
  h.db.upserts = []; h.db.inserts = []; h.db.errors = {};
});

describe('planApiImport (extrato)', () => {
  it('importa as linhas novas e não grava nada ao planejar', async () => {
    const p = extrato([line('01/10/2024', '700,00', '-', '620,00'), line('05/10/2024', '800,00', '+', '1.420,00')]);
    const plan = await planApiImport(p, 'a1');
    expect(plan.kind).toBe('extrato');
    if (plan.kind !== 'extrato') return;
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.alreadyImported).toHaveLength(0);
    expect(h.db.upserts).toHaveLength(0);
  });

  it('não reimporta o que já veio da API (mesmo identificador)', async () => {
    const p = extrato([line('01/10/2024', '700,00', '-', '620,00'), line('05/10/2024', '800,00', '+', '1.420,00')]);
    h.db.tables.bank_statement_entries = [{ fitid: p.entries[0].fitid, posted_at: '2024-10-01', amount: -700, account_id: 'a1' }];
    const plan = await planApiImport(p, 'a1');
    if (plan.kind !== 'extrato') throw new Error('esperado extrato');
    expect(plan.alreadyImported).toHaveLength(1);
    expect(plan.toInsert.map(e => e.posted_at)).toEqual(['2024-10-05']);
  });

  it('não duplica o que já veio do OFX (data + valor), uma a uma', async () => {
    const p = extrato([line('05/10/2024', '800,00', '+', '880,00'), line('05/10/2024', '800,00', '+', '1.680,00')]);
    h.db.tables.bank_statement_entries = [{ fitid: 'OFX-1', posted_at: '2024-10-05', amount: 800, account_id: 'a1' }];
    const plan = await planApiImport(p, 'a1');
    if (plan.kind !== 'extrato') throw new Error('esperado extrato');
    expect(plan.alreadyFromOfx).toHaveLength(1);
    expect(plan.toInsert).toHaveLength(1);
  });

  it('bloqueia quando a conta da resposta não é a conta escolhida', async () => {
    const p = extrato([line('01/10/2024', '700,00', '-', '620,00')], '12345');
    await expect(planApiImport(p, 'a1')).rejects.toThrow(/Importação bloqueada/);
    await expect(planApiImport(p, 'a2')).rejects.toThrow(/Importação bloqueada/);
  });

  it('conta sem ACCTID gravado aceita (não há com o que comparar)', async () => {
    const p = extrato([line('01/10/2024', '700,00', '-', '620,00')], '12345');
    const plan = await planApiImport(p, 'a3');
    expect(plan.kind).toBe('extrato');
  });

  it('exige a conta do sistema', async () => {
    await expect(planApiImport(extrato([]), '')).rejects.toThrow(/Escolha a conta/);
  });
});

describe('commitApiImport (extrato)', () => {
  it('grava só as linhas novas, sem sobrescrever e com o texto original em raw', async () => {
    const p = extrato([line('01/10/2024', '700,00', '-', '620,00'), line('05/10/2024', '800,00', '+', '1.420,00')]);
    const plan = await planApiImport(p, 'a1');
    const r = await commitApiImport(plan, 'u1');
    expect(r).toMatchObject({ inserted: 2, skipped: 0 });
    const up = h.db.upserts.find(u => u.table === 'bank_statement_entries');
    expect(up?.opts).toEqual({ onConflict: 'account_id,fitid', ignoreDuplicates: true });
    expect(up?.rows[0]).toMatchObject({
      account_id: 'a1', posted_at: '2024-10-01', amount: -700, trn_type: 'DEBIT', status: 'pendente', imported_by: 'u1', memo: 'TRANSFERENCIA PIX',
    });
    expect(String(up?.rows[0].fitid)).toMatch(/^BRADAPI:/);
    expect((up?.rows[0].raw as Row).valorLancamento).toBe('700,00');
    expect(String(up?.rows[0].source_file)).toBe('API Bradesco (2024-10-01 a 2024-10-05)');
  });

  it('registra o saldo final do extrato e a consulta', async () => {
    const plan = await planApiImport(extrato([line('01/10/2024', '700,00', '-', '620,00')]), 'a1');
    await commitApiImport(plan, 'u1');
    const snap = h.db.upserts.find(u => u.table === 'bank_balance_snapshots');
    expect(snap?.rows[0]).toMatchObject({ account_id: 'a1', ref_date: '2024-10-01', source: 'api_extrato', ledger_balance: 620 });
    expect(h.db.inserts.find(i => i.table === 'bank_api_sync_runs')?.row).toMatchObject({ kind: 'extrato', rows_inserted: 1, rows_skipped: 0 });
  });

  it('SQL 15 ainda não aplicado: a importação das linhas continua e avisa', async () => {
    h.db.errors['bank_balance_snapshots.upsert'] = { message: 'x', code: 'PGRST205' };
    h.db.errors['bank_api_sync_runs.insert'] = { message: 'x', code: '42P01' };
    const plan = await planApiImport(extrato([line('01/10/2024', '700,00', '-', '620,00')]), 'a1');
    const r = await commitApiImport(plan, 'u1');
    expect(r.inserted).toBe(1);
    expect(r.notes.join(' ')).toMatch(/SQL 15/);
  });

  it('erro ao gravar as linhas interrompe e propaga', async () => {
    h.db.errors['bank_statement_entries.upsert'] = { message: 'falhou' };
    const plan = await planApiImport(extrato([line('01/10/2024', '700,00', '-', '620,00')]), 'a1');
    await expect(commitApiImport(plan, 'u1')).rejects.toMatchObject({ message: 'falhou' });
  });
});

describe('saldo', () => {
  const saldo = parseApiResponse({
    saldoCC: {
      codigoRetorno: '00', numeroConta: '75557', digitoConta: '5', identificadorTipoConta: 'conta corrente',
      lstLancamentosSaldos: [
        { nomeProduto: '= TOTAL DE RECURSOS', codigoProduto: 995, valorLancamento: '77,95', sinalSaldo: '+' },
        { nomeProduto: '+ CTA CORRENTE', codigoProduto: 998, valorLancamento: '77,95', sinalSaldo: '+' },
      ],
    },
  }) as ParsedSaldo;

  it('grava o saldo do dia por conta (um por dia e origem)', async () => {
    const plan = await planApiImport(saldo, 'a1', undefined, new Date(2026, 9, 27));
    expect(plan).toMatchObject({ kind: 'saldo', refDate: '2026-10-27' });
    await commitApiImport(plan, 'u1');
    const snap = h.db.upserts.find(u => u.table === 'bank_balance_snapshots');
    expect(snap?.opts).toEqual({ onConflict: 'account_id,ref_date,source' });
    expect(snap?.rows[0]).toMatchObject({ source: 'api_saldo', total_resources: 77.95, checking_balance: 77.95 });
  });

  it('sem o SQL 15 o saldo não é gravado e o erro explica o que aplicar', async () => {
    h.db.errors['bank_balance_snapshots.upsert'] = { message: 'x', code: 'PGRST205' };
    const plan = await planApiImport(saldo, 'a1');
    await expect(commitApiImport(plan, 'u1')).rejects.toThrow(/SQL 15/);
  });
});

describe('fetchApiEntries (usado pela importação do OFX)', () => {
  it('devolve só as linhas vindas da API no período', async () => {
    h.db.tables.bank_statement_entries = [
      { fitid: 'BRADAPI:cc75557:20241005:1:3205:80000:1', posted_at: '2024-10-05', amount: 800, account_id: 'a1' },
      { fitid: 'OFX-9', posted_at: '2024-10-05', amount: 800, account_id: 'a1' },
      { fitid: 'BRADAPI:cc75557:20241105:1:3205:80000:1', posted_at: '2024-11-05', amount: 800, account_id: 'a1' },
    ];
    const rows = await fetchApiEntries('a1', '2024-10-01', '2024-10-31');
    expect(rows.map(r => r.fitid)).toEqual(['BRADAPI:cc75557:20241005:1:3205:80000:1']);
  });
});

describe('dropRowsAlreadyFromApi (importação do OFX depois da API)', () => {
  const ofx = [
    { fitid: 'F1', posted_at: '2024-10-05', amount: 800 },
    { fitid: 'F2', posted_at: '2024-10-05', amount: 800 },
    { fitid: 'F3', posted_at: '2024-10-06', amount: -50 },
  ];
  it('tira do OFX o que a API já trouxe (data + valor, uma a uma)', async () => {
    h.db.tables.bank_statement_entries = [{ fitid: 'BRADAPI:cc75557:20241005:1:3205:80000:1', posted_at: '2024-10-05', amount: 800, account_id: 'a1' }];
    const kept = await dropRowsAlreadyFromApi('a1', ofx);
    expect(kept.map(r => r.fitid)).toEqual(['F2', 'F3']);
  });
  it('sem linhas da API na conta, não mexe em nada', async () => {
    h.db.tables.bank_statement_entries = [{ fitid: 'F0', posted_at: '2024-10-05', amount: 800, account_id: 'a1' }];
    expect(await dropRowsAlreadyFromApi('a1', ofx)).toEqual(ofx);
    expect(await dropRowsAlreadyFromApi('a1', [])).toEqual([]);
  });
});
