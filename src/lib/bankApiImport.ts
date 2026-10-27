/**
 * Importação das respostas da API de Saldo e Extrato do Bradesco: planeja (sem gravar) e grava.
 * As regras de leitura ficam em lib/bradescoApi.ts. Aqui só há acesso ao banco, com o cliente injetado
 * para poder ser testado sem rede.
 */
import { supabase } from '@/integrations/supabase/client';
import { untypedTable } from '@/lib/rpc';
import type { Json } from '@/integrations/supabase/types';
import {
  accountMatches, API_FITID_PREFIX, BradescoApiError, dropCrossSourceDuplicates, isApiFitid,
  type ApiEntry, type ParsedApi, type ParsedExtrato, type ParsedSaldo,
} from '@/lib/bradescoApi';

type Client = typeof supabase;

const PAGE = 1000;
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const SQL_HINT = 'Aplique o SQL 15 (scripts/producao/15-api-bradesco-saldos.sql) para registrar saldos e consultas.';

export interface ExtratoPlan {
  kind: 'extrato';
  accountId: string;
  parsed: ParsedExtrato;
  toInsert: ApiEntry[];
  alreadyImported: ApiEntry[];
  alreadyFromOfx: ApiEntry[];
}
export interface SaldoPlan { kind: 'saldo'; accountId: string; parsed: ParsedSaldo; refDate: string }
export type ImportPlan = ExtratoPlan | SaldoPlan;

export interface ImportResult {
  inserted: number;
  skipped: number;
  /** Avisos que não impedem a importação (ex.: tabela de saldos ainda não criada). */
  notes: string[];
}

interface ExistingRow { fitid: string; posted_at: string; amount: number }

/** Linhas já gravadas da conta no período (paginado: o PostgREST devolve no máximo 1.000 por vez). */
async function fetchExisting(client: Client, accountId: string, from: string, to: string): Promise<ExistingRow[]> {
  const out: ExistingRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await client.from('bank_statement_entries')
      .select('fitid,posted_at,amount')
      .eq('account_id', accountId).gte('posted_at', from).lte('posted_at', to)
      .range(start, start + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ExistingRow[];
    out.push(...rows.map(r => ({ fitid: r.fitid, posted_at: r.posted_at, amount: Number(r.amount) })));
    if (rows.length < PAGE) return out;
  }
}

/**
 * Linhas da API já gravadas na conta no período. Usado pela importação do OFX para não duplicar o que a API
 * já trouxe (data + valor), do mesmo modo que a importação da API não duplica o que veio do OFX.
 */
export async function fetchApiEntries(accountId: string, from: string, to: string, client: Client = supabase) {
  const rows = await fetchExisting(client, accountId, from, to);
  return rows.filter(r => isApiFitid(r.fitid));
}

/**
 * Tira das linhas novas de OFX as que a API do Bradesco já trouxe para o mesmo dia e valor (uma a uma).
 * Sem linhas da API na conta/período, devolve as mesmas linhas (e não altera nada).
 */
export async function dropRowsAlreadyFromApi<T extends { posted_at: string; amount: number }>(
  accountId: string, rows: T[], client: Client = supabase,
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const dates = rows.map(r => r.posted_at).sort();
  const api = await fetchApiEntries(accountId, dates[0], dates[dates.length - 1], client);
  return api.length === 0 ? rows : dropCrossSourceDuplicates(rows, api).kept;
}

export async function planApiImport(parsed: ParsedApi, accountId: string, client: Client = supabase, today = new Date()): Promise<ImportPlan> {
  if (!accountId) throw new BradescoApiError('Escolha a conta do sistema antes de importar.');

  const { data: account, error: accErr } = await client.from('accounts').select('id,name,ofx_acctid').eq('id', accountId).maybeSingle();
  if (accErr) throw accErr;
  if (!account) throw new BradescoApiError('Conta não encontrada.');

  if (parsed.account) {
    const m = accountMatches(account.ofx_acctid, parsed.account.numero, parsed.account.digito);
    if (m === 'mismatch') {
      throw new BradescoApiError(
        `Importação bloqueada: a resposta é da conta ${parsed.account.numero}-${parsed.account.digito}, mas "${account.name}" está ligada à conta ${account.ofx_acctid}.`,
      );
    }
  }

  if (parsed.kind === 'saldo') {
    const refDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { kind: 'saldo', accountId, parsed, refDate };
  }

  if (parsed.entries.length === 0) return { kind: 'extrato', accountId, parsed, toInsert: [], alreadyImported: [], alreadyFromOfx: [] };

  const dates = parsed.entries.map(e => e.posted_at).sort();
  const existing = await fetchExisting(client, accountId, dates[0], dates[dates.length - 1]);
  const known = new Set(existing.map(e => e.fitid));
  const alreadyImported = parsed.entries.filter(e => known.has(e.fitid));
  const fresh = parsed.entries.filter(e => !known.has(e.fitid));
  const { kept, dropped } = dropCrossSourceDuplicates(fresh, existing.filter(e => !isApiFitid(e.fitid)));
  return { kind: 'extrato', accountId, parsed, toInsert: kept, alreadyImported, alreadyFromOfx: dropped };
}

async function logRun(row: Record<string, unknown>, notes: string[]) {
  const { error } = await untypedTable('bank_api_sync_runs').insert(row);
  if (error) notes.push(MISSING_TABLE.has(error.code ?? '') ? SQL_HINT : `Não foi possível registrar a consulta: ${error.message}`);
}

async function saveSnapshot(row: Record<string, unknown>, notes: string[], required: boolean) {
  const { error } = await untypedTable('bank_balance_snapshots').upsert(row, { onConflict: 'account_id,ref_date,source' });
  if (!error) return;
  if (required) throw new BradescoApiError(MISSING_TABLE.has(error.code ?? '') ? SQL_HINT : error.message);
  notes.push(MISSING_TABLE.has(error.code ?? '') ? SQL_HINT : `Não foi possível registrar o saldo final: ${error.message}`);
}

export async function commitApiImport(plan: ImportPlan, userId: string | null, client: Client = supabase): Promise<ImportResult> {
  const notes: string[] = [];

  if (plan.kind === 'saldo') {
    const p = plan.parsed;
    await saveSnapshot({
      account_id: plan.accountId, ref_date: plan.refDate, source: 'api_saldo',
      total_resources: p.totalResources, checking_balance: p.checking, total_balance: p.total, blocked: p.blocked,
      overdraft_limit: p.overdraftLimit, invest_auto: p.investAuto, invest_redeem: p.investRedeem, invest_grace: p.investGrace,
      raw: p.lines as unknown as Json, created_by: userId,
    }, notes, true);
    await logRun({ account_id: plan.accountId, kind: 'saldo', rows_received: p.lines.length, requested_by: userId }, notes);
    return { inserted: 0, skipped: 0, notes };
  }

  const e = plan.parsed;
  const dates = e.entries.map(x => x.posted_at).sort();
  const label = dates.length ? `API Bradesco (${dates[0]} a ${dates[dates.length - 1]})` : 'API Bradesco';
  const rows = plan.toInsert.map(x => ({
    account_id: plan.accountId, fitid: x.fitid, posted_at: x.posted_at, amount: x.amount, memo: x.memo,
    trn_type: x.trn_type, source_file: label, imported_by: userId, status: 'pendente', raw: x.raw as unknown as Json,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client.from('bank_statement_entries')
      .upsert(rows.slice(i, i + 500), { onConflict: 'account_id,fitid', ignoreDuplicates: true });
    if (error) throw error;
  }

  const skipped = plan.alreadyImported.length + plan.alreadyFromOfx.length;
  if (e.closing) {
    await saveSnapshot({
      account_id: plan.accountId, ref_date: e.closing.date, source: 'api_extrato', ledger_balance: e.closing.balance, created_by: userId,
    }, notes, false);
  }
  await logRun({
    account_id: plan.accountId, kind: 'extrato', period_from: dates[0] ?? null, period_to: dates[dates.length - 1] ?? null,
    rows_received: e.entries.length, rows_inserted: rows.length, rows_skipped: skipped, requested_by: userId,
  }, notes);
  return { inserted: rows.length, skipped, notes };
}

export { API_FITID_PREFIX };
