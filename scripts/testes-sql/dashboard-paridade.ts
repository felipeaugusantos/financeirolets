/**
 * Paridade do dashboard_summary (SQL 11) com a lógica do app (src/lib/finance.ts) em dados ALEATÓRIOS.
 *
 * Gera lançamentos, rateios e contas ao acaso, carrega num Postgres descartável e compara, para
 * vários filtros (unidade, frente, provisionados, período), o resultado da função SQL com um
 * "oráculo" escrito em TypeScript com as mesmas regras do Dashboard antigo (as do navegador).
 *
 * Uso (veja o README): bun run scripts/testes-sql/dashboard-paridade.ts <host-do-socket> <porta> <banco> [rodadas]
 * O comando psql roda como o usuário "postgres" (su postgres -c ...); ajuste PSQL abaixo se precisar.
 */
import { execFileSync } from 'node:child_process';
import {
  buildAllocationMap, buildOpeningMap, hasOpeningBalance, isAfterOpening, openingBalanceTotal,
  splitByUnit, valueForFilters, NO_UNIT_KEY, type AllocationRow,
} from '../../src/lib/finance';

const [host = '/tmp/pgtest', port = '5544', db = 't', roundsArg = '25'] = process.argv.slice(2);
const ROUNDS = Number(roundsArg);
const USER = '11111111-1111-1111-1111-111111111111';
const TODAY = '2026-09-15';

function psql(sql: string): string {
  return execFileSync('su', ['postgres', '-c', `psql -h ${host} -p ${port} -q -At -d ${db} -v ON_ERROR_STOP=1`], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// ---- gerador pseudo-aleatório determinístico ------------------------------------------------------
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const money = (max: number) => Math.round(rnd() * max * 100) / 100;
const day = (from: string, to: string) => {
  const a = Date.parse(from), b = Date.parse(to);
  return new Date(a + Math.floor(rnd() * (b - a + 86400000))).toISOString().slice(0, 10);
};
const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const UNITS = [uuid('a', 1), uuid('a', 2), uuid('a', 3)];
const FRONTS = [uuid('f', 1), uuid('f', 2)];
const CATS = [uuid('c', 1), uuid('c', 2), uuid('c', 3)];
const ACCOUNTS = [
  { id: uuid('b', 1), initial_balance: 5000, initial_balance_date: '2026-08-15', active: true },
  { id: uuid('b', 2), initial_balance: 1200.5, initial_balance_date: null as string | null, active: true },
  { id: uuid('b', 3), initial_balance: 300, initial_balance_date: '2026-10-30', active: true },   // data-base futura
  { id: uuid('b', 4), initial_balance: 999, initial_balance_date: '2026-07-01', active: false },  // inativa
];

interface Tx {
  id: string; type: 'receita' | 'despesa'; description: string; amount: number; tax_amount: number; net_amount: number;
  status: string; payment_date: string | null; competence_date: string; due_date: string | null;
  category_id: string | null; unit_id: string | null; front_id: string | null; account_id: string | null;
  affects_dre: boolean; affects_cashflow: boolean; partner_id: null; created_by: string;
}
function genData(n: number) {
  const txs: Tx[] = [];
  const allocs: (AllocationRow & { id: string })[] = [];
  for (let i = 1; i <= n; i++) {
    const status = pick(['pago', 'pago', 'recebido', 'pendente', 'pendente', 'agendado', 'cancelado']);
    const type = pick<'receita' | 'despesa'>(['receita', 'despesa', 'despesa']);
    const net = money(3000);
    const comp = day('2026-06-20', '2026-10-20');
    const paid = status === 'pago' || status === 'recebido';
    txs.push({
      id: uuid('1', i), type, description: `tx ${i}`, amount: net, tax_amount: 0, net_amount: net, status,
      payment_date: paid || rnd() < 0.1 ? day('2026-07-15', '2026-10-20') : null,
      competence_date: comp, due_date: rnd() < 0.85 ? day('2026-06-01', '2026-10-30') : null,
      category_id: rnd() < 0.8 ? pick(CATS) : null, unit_id: rnd() < 0.7 ? pick(UNITS) : null,
      front_id: rnd() < 0.5 ? pick(FRONTS) : null, account_id: rnd() < 0.85 ? pick(ACCOUNTS).id : null,
      affects_dre: rnd() < 0.9, affects_cashflow: rnd() < 0.9, partner_id: null, created_by: USER,
    });
    if (rnd() < 0.4) {
      const k = 1 + Math.floor(rnd() * 3);
      const pct = pick([100, 100, 80, 120]);
      const asValue = rnd() < 0.3;
      for (let j = 0; j < k; j++) {
        allocs.push({
          id: uuid('2', i * 10 + j), transaction_id: uuid('1', i),
          unit_id: rnd() < 0.85 ? pick(UNITS) : null, front_id: rnd() < 0.4 ? pick(FRONTS) : null,
          allocation_type: asValue ? 'valor' : 'percentual',
          percentage: asValue ? null : Math.round((pct / k) * 100) / 100,
          amount: asValue ? Math.round((net / k) * 100) / 100 * (rnd() < 0.3 ? 0.9 : 1) : null,
        });
      }
    }
  }
  return { txs, allocs };
}

// ---- oráculo: a lógica do Dashboard no navegador --------------------------------------------------
const inRange = (d: string | null, s: string, e: string) => !!d && d >= s && d <= e;
function oracle(txs: Tx[], allocs: AllocationRow[], f: { unit?: string; front?: string; prov: boolean; from: string; to: string }) {
  const days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400000) + 1;
  const ps = new Date(Date.parse(f.from) - days * 86400000).toISOString().slice(0, 10);
  const pe = new Date(Date.parse(f.from) - 86400000).toISOString().slice(0, 10);
  const rows = txs.filter(t => t.status !== 'cancelado' && (inRange(t.competence_date, ps, f.to) || inRange(t.payment_date, ps, f.to)));
  const allocMap = buildAllocationMap(allocs.filter(a => rows.some(r => r.id === a.transaction_id)));
  const filtered = !!(f.unit || f.front);
  const o = { receitas: 0, despesas: 0, receitasProv: 0, despesasProv: 0, prevR: 0, prevD: 0, semCat: 0, semUnid: 0 };
  const cat = new Map<string, number>(); const rcat = new Map<string, number>();
  const monthly = new Map<string, { r: number; d: number; rp: number; dp: number }>();
  const rank = new Map<string, { d: number; r: number }>();
  for (const tx of rows) {
    const paid = tx.status === 'pago' || tx.status === 'recebido';
    const prov = tx.status === 'pendente' || tx.status === 'agendado';
    const val = valueForFilters(tx, allocMap, f.unit, f.front);
    const cash = tx.affects_cashflow !== false, dre = tx.affects_dre !== false;
    const pip = paid && cash && inRange(tx.payment_date, f.from, f.to);
    const vip = prov && dre && inRange(tx.competence_date, f.from, f.to);
    const pipv = paid && cash && inRange(tx.payment_date, ps, pe);
    const vipv = prov && dre && inRange(tx.competence_date, ps, pe);
    if (!(val === 0 && filtered)) {
      if (pip || vip) {
        if (!tx.category_id) o.semCat++;
        if (!tx.unit_id && !(allocMap.get(tx.id) ?? []).some(a => a.unit_id)) o.semUnid++;
      }
      const m = (key: string) => monthly.get(key) ?? { r: 0, d: 0, rp: 0, dp: 0 };
      if (pip) { const e = m(tx.payment_date!.slice(0, 7)); if (tx.type === 'receita') e.r += val; else e.d += val; monthly.set(tx.payment_date!.slice(0, 7), e); }
      if (vip) { const e = m(tx.competence_date.slice(0, 7)); if (tx.type === 'receita') e.rp += val; else e.dp += val; monthly.set(tx.competence_date.slice(0, 7), e); }
      if (pip) { if (tx.type === 'receita') o.receitas += val; else o.despesas += val; }
      if (vip) { if (tx.type === 'receita') o.receitasProv += val; else o.despesasProv += val; }
      if (pipv) { if (tx.type === 'receita') o.prevR += val; else o.prevD += val; }
      if (vipv && f.prov) { if (tx.type === 'receita') o.prevR += val; else o.prevD += val; }
      const catKey = tx.category_id ?? 'Sem Categoria';
      const target = tx.type === 'despesa' ? cat : rcat;
      if (pip || (f.prov && vip)) target.set(catKey, (target.get(catKey) ?? 0) + val);
    }
    // ranking (regras do Dashboard corrigido)
    if (pip || (f.prov && vip)) {
      if (f.front && valueForFilters(tx, allocMap, f.unit, f.front) === 0) continue;
      for (const { unitKey, value } of splitByUnit(tx, allocMap)) {
        if (value === 0) continue;
        if (f.unit && unitKey !== f.unit) continue;
        const e = rank.get(unitKey) ?? { d: 0, r: 0 };
        if (tx.type === 'despesa') e.d += value; else e.r += value;
        rank.set(unitKey, e);
      }
    }
  }
  // saldo
  const openingMap = buildOpeningMap(ACCOUNTS.filter(a => a.active));
  const paidAll = txs.filter(t => (t.status === 'pago' || t.status === 'recebido') && t.affects_cashflow === true);
  const saldoAlloc = buildAllocationMap(filtered ? allocs.filter(a => paidAll.some(t => t.id === a.transaction_id)) : []);
  let mov = 0;
  for (const tx of paidAll) {
    if (!isAfterOpening(tx, openingMap)) continue;
    const val = valueForFilters(tx, saldoAlloc, f.unit, f.front);
    if (val === 0) continue;
    mov += tx.type === 'receita' ? val : -val;
  }
  const alertRows = txs.filter(t => (t.status === 'pendente' || t.status === 'agendado') && t.due_date && t.due_date <= TODAY);
  const alertAlloc = buildAllocationMap(filtered ? allocs.filter(a => alertRows.some(t => t.id === a.transaction_id)) : []);
  const bills = alertRows.filter(b => !filtered || valueForFilters(b, alertAlloc, f.unit, f.front) !== 0);
  return {
    ...o, mov,
    opening: filtered ? 0 : openingBalanceTotal(openingMap, TODAY), cfg: filtered ? false : hasOpeningBalance(openingMap, TODAY),
    cat, rcat, monthly, rank,
    overdue: bills.filter(b => b.due_date! < TODAY).map(b => b.id).sort(), dueToday: bills.filter(b => b.due_date === TODAY).map(b => b.id).sort(),
  };
}

// ---- carga e comparação ---------------------------------------------------------------------------
const close = (a: number, b: number) => Math.abs(a - b) < 0.02;
let failures = 0, checks = 0;
const expectEq = (label: string, a: number, b: number, ctx: string) => {
  checks++;
  if (!close(a, b)) { failures++; console.log(`DIVERGE ${label}: sql=${a} app=${b}  [${ctx}]`); }
};
const expectSame = (label: string, a: string, b: string, ctx: string) => {
  checks++;
  if (a !== b) { failures++; console.log(`DIVERGE ${label}: sql=${a} app=${b}  [${ctx}]`); }
};
const mapObj = (m: Map<string, number>) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, Math.round(v * 100) / 100]));

for (let round = 1; round <= ROUNDS; round++) {
  const { txs, allocs } = genData(120);
  const load = `
    truncate public.transaction_allocations, public.transactions, public.accounts, public.units, public.categories, public.business_fronts, public.user_roles, auth.users cascade;
    insert into auth.users(id,email) values ('${USER}','fin@x');
    delete from public.user_roles; insert into public.user_roles(user_id, role) values ('${USER}','financeiro');
    insert into public.units(id,name) select u, 'U' || u from unnest(array[${UNITS.map(u => `'${u}'`).join(',')}]::uuid[]) u;
    insert into public.business_fronts(id,name) select f, 'F' || f from unnest(array[${FRONTS.map(u => `'${u}'`).join(',')}]::uuid[]) f;
    insert into public.categories(id,name,type) select c, 'C' || c, 'despesa' from unnest(array[${CATS.map(u => `'${u}'`).join(',')}]::uuid[]) c;
    insert into public.accounts(id,name,type,initial_balance,initial_balance_date,active)
      select id, 'A' || id, 'banco', initial_balance, initial_balance_date, active from jsonb_to_recordset($acc$${JSON.stringify(ACCOUNTS)}$acc$::jsonb) as x(id uuid, initial_balance numeric, initial_balance_date date, active boolean);
    insert into public.transactions(id,type,description,amount,tax_amount,net_amount,status,payment_date,competence_date,due_date,category_id,unit_id,front_id,account_id,affects_dre,affects_cashflow,created_by)
      select id,type::transaction_type,description,amount,tax_amount,net_amount,status::transaction_status,payment_date,competence_date,due_date,category_id,unit_id,front_id,account_id,affects_dre,affects_cashflow,created_by
      from jsonb_to_recordset($tx$${JSON.stringify(txs)}$tx$::jsonb) as x(id uuid,type text,description text,amount numeric,tax_amount numeric,net_amount numeric,status text,payment_date date,competence_date date,due_date date,category_id uuid,unit_id uuid,front_id uuid,account_id uuid,affects_dre boolean,affects_cashflow boolean,created_by uuid);
    insert into public.transaction_allocations(id,transaction_id,unit_id,front_id,allocation_type,percentage,amount)
      select id,transaction_id,unit_id,front_id,allocation_type::allocation_type,percentage,amount
      from jsonb_to_recordset($al$${JSON.stringify(allocs)}$al$::jsonb) as x(id uuid,transaction_id uuid,unit_id uuid,front_id uuid,allocation_type text,percentage numeric,amount numeric);
  `;
  psql(load);

  const scenarios = [
    { from: '2026-09-01', to: '2026-09-30' }, { from: '2026-08-01', to: '2026-09-30' }, { from: '2026-09-05', to: '2026-09-25' },
  ];
  for (const sc of scenarios) {
    for (const unit of [undefined, ...UNITS]) {
      for (const front of [undefined, FRONTS[0], FRONTS[1]]) {
        for (const prov of [false, true]) {
          if (rnd() < 0.55) continue;            // amostra: não precisa rodar todas as combinações
          const f = { unit, front, prov, ...sc };
          const ctx = `rodada ${round} ${sc.from}..${sc.to} unit=${unit?.slice(-2) ?? '-'} front=${front?.slice(-2) ?? '-'} prov=${prov}`;
          const sql = `begin; set local role authenticated; set local request.jwt.claim.sub='${USER}';
            select public.dashboard_summary('${sc.from}','${sc.to}',${unit ? `'${unit}'` : 'null'},${front ? `'${front}'` : 'null'},${prov},'${TODAY}')::text; commit;`;
          const out = psql(sql).split('\n').find(l => l.startsWith('{'))!;
          const s = JSON.parse(out);
          const e = oracle(txs, allocs, f);
          expectEq('receitas', Number(s.receitas), e.receitas, ctx);
          expectEq('despesas', Number(s.despesas), e.despesas, ctx);
          expectEq('receitasProv', Number(s.receitasProvisionadas), e.receitasProv, ctx);
          expectEq('despesasProv', Number(s.despesasProvisionadas), e.despesasProv, ctx);
          expectEq('prevReceitas', Number(s.prevReceitas), e.prevR, ctx);
          expectEq('prevDespesas', Number(s.prevDespesas), e.prevD, ctx);
          expectEq('semCategoria', Number(s.semCategoria), e.semCat, ctx);
          expectEq('semUnidade', Number(s.semUnidade), e.semUnid, ctx);
          expectEq('movimentacao', Number(s.movimentacaoCalculada), e.mov, ctx);
          expectEq('saldoInicial', Number(s.saldoInicialTotal), e.opening, ctx);
          expectSame('saldoInicialConfigurado', String(s.saldoInicialConfigurado), String(e.cfg), ctx);
          expectSame('atrasadas', s.overdueBills.map((b: { id: string }) => b.id).sort().join(','), e.overdue.join(','), ctx);
          expectSame('vencendoHoje', s.dueTodayBills.map((b: { id: string }) => b.id).sort().join(','), e.dueToday.join(','), ctx);
          // categorias (nome = 'C' || id, ou 'Sem Categoria')
          const sqlCat = Object.fromEntries(s.categoryData.map((c: { name: string; value: number }) => [c.name.startsWith('C') ? c.name.slice(1) : c.name, Math.round(Number(c.value) * 100) / 100]));
          const sqlRec = Object.fromEntries(s.receitaCategoryData.map((c: { name: string; value: number }) => [c.name.startsWith('C') ? c.name.slice(1) : c.name, Math.round(Number(c.value) * 100) / 100]));
          for (const [label, a, b] of [['categoriasDespesa', sqlCat, mapObj(e.cat)], ['categoriasReceita', sqlRec, mapObj(e.rcat)]] as const) {
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const k of keys) expectEq(`${label}[${k}]`, a[k] ?? 0, b[k] ?? 0, ctx);
          }
          // ranking
          const sqlRank = new Map<string, { d: number; r: number }>(s.unitRanking.map((u: { unitId: string; despesas: number; receitas: number }) => [u.unitId, { d: Number(u.despesas), r: Number(u.receitas) }]));
          const keys = new Set([...sqlRank.keys(), ...e.rank.keys()]);
          for (const k of keys) {
            const a = sqlRank.get(k) ?? { d: 0, r: 0 }, b = e.rank.get(k === '__none__' ? NO_UNIT_KEY : k) ?? { d: 0, r: 0 };
            expectEq(`ranking[${k.slice(-2)}].despesas`, a.d, b.d, ctx);
            expectEq(`ranking[${k.slice(-2)}].receitas`, a.r, b.r, ctx);
          }
          // mês a mês
          for (const m of s.monthly as { month: string; receitas: number; despesas: number; receitasProv: number; despesasProv: number }[]) {
            const x = e.monthly.get(m.month) ?? { r: 0, d: 0, rp: 0, dp: 0 };
            expectEq(`mes ${m.month} receitas`, Number(m.receitas), x.r, ctx);
            expectEq(`mes ${m.month} despesas`, Number(m.despesas), x.d, ctx);
            expectEq(`mes ${m.month} receitasProv`, Number(m.receitasProv), x.rp, ctx);
            expectEq(`mes ${m.month} despesasProv`, Number(m.despesasProv), x.dp, ctx);
          }
        }
      }
    }
  }
}
console.log(`${checks} comparações, ${failures} divergência(s)`);
process.exit(failures ? 1 : 0);
