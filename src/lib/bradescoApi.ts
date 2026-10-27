/**
 * API de Saldo e Extrato do Bradesco (Manual v2.2.2): montagem dos parâmetros, leitura das respostas e
 * proteção contra duplicidade.
 *
 * NADA aqui chama a rede nem grava no banco. O manual NÃO descreve a autenticação (credenciais/certificado):
 * isso fica para a função de coleta, quando o banco liberar o acesso. Hoje a resposta da API entra no
 * sistema colando o JSON (sandbox/Postman) na tela de conciliação.
 *
 * Decisões (a validar no sandbox):
 *  - Só entram lançamentos fechados: histórico (D-2 para trás) e últimos lançamentos (D-1). "Lançamentos do dia"
 *    (D0) e "futuros" não entram, porque podem mudar até o fechamento.
 *  - O número do documento se repete (muitas linhas com 0000001) e não é único: o identificador (fitid) combina
 *    conta, data, documento, código, valor e a ordem entre linhas iguais do mesmo dia.
 */

export type ApiAccountKind = 'cc' | 'cp';

const ymdOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** 2026-10-27 -> 27102026 (formato ddmmaaaa exigido pela API). */
export function toApiDate(iso: string): string {
  if (!ymdOk(iso)) throw new Error(`Data inválida: ${iso}`);
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
}

/** 27/10/2026 -> 2026-10-27 (null se não existir no calendário). */
export function parseBrDate(raw: unknown): string | null {
  const m = String(raw ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${mo}-${d}`;
}

/** "1.233,00" -> 1233 (NaN se não for número). */
export function parseBrl(raw: unknown): number {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return NaN;
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

const cents = (n: number) => Math.round(n * 100);

// ---------------------------------------------------------------------------------------------------------------
// Parâmetros das consultas
// ---------------------------------------------------------------------------------------------------------------

export interface ParamsResult {
  ok: boolean;
  params?: Record<string, string>;
  error?: string;
  warnings: string[];
}

function checkAccount(agencia: string, conta: string): string | null {
  if (!/^\d{1,4}$/.test(agencia)) return 'Agência: use só números, até 4 dígitos e sem o dígito verificador.';
  if (!/^\d{1,7}$/.test(conta)) return 'Conta: use só números, até 7 dígitos e sem o dígito verificador.';
  return null;
}

export function buildSaldoParams(input: { agencia: string; conta: string; tipoOperacao?: 1 | 2 }): ParamsResult {
  const agencia = digits(input.agencia), conta = digits(input.conta);
  const err = checkAccount(agencia, conta);
  if (err) return { ok: false, error: err, warnings: [] };
  return { ok: true, params: { agencia, conta, tipoOperacao: String(input.tipoOperacao ?? 1) }, warnings: [] };
}

export function buildExtratoParams(input: {
  agencia: string; conta: string; from: string; to: string; tipo: ApiAccountKind; tipoOperacao?: 1 | 2;
}): ParamsResult {
  const agencia = digits(input.agencia), conta = digits(input.conta);
  const err = checkAccount(agencia, conta);
  if (err) return { ok: false, error: err, warnings: [] };
  if (!ymdOk(input.from) || !ymdOk(input.to)) return { ok: false, error: 'Informe o período (data inicial e final).', warnings: [] };
  if (input.to < input.from) return { ok: false, error: 'A data final deve ser igual ou posterior à inicial.', warnings: [] };
  const days = (Date.parse(`${input.to}T12:00:00Z`) - Date.parse(`${input.from}T12:00:00Z`)) / 86400000;
  if (days > 3650) return { ok: false, error: 'A API guarda até 10 anos de extrato: reduza o período.', warnings: [] };
  const warnings: string[] = [];
  if (days > 366) warnings.push('O manual recomenda consultar de 1 em 1 ano para melhor desempenho.');
  const params: Record<string, string> = {
    agencia, conta, dataInicio: toApiDate(input.from), dataFim: toApiDate(input.to), tipo: input.tipo,
  };
  if (input.tipoOperacao) params.tipoOperacao = String(input.tipoOperacao);
  return { ok: true, params, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Mensagens de erro
// ---------------------------------------------------------------------------------------------------------------

const HTTP_MESSAGES: Record<number, string> = {
  400: 'Requisição inválida: revise os campos preenchidos.',
  401: 'Sem permissão para executar este serviço no Bradesco.',
  403: 'Sessão expirada no Bradesco. Gere um novo acesso.',
  404: 'Conta não encontrada ou parâmetros fora do padrão esperado.',
  405: 'Método HTTP incorreto na chamada.',
  500: 'Erro interno no serviço do Bradesco. Veja a mensagem retornada.',
  503: 'Serviço do Bradesco temporariamente indisponível. Tente mais tarde.',
};

export function bradescoHttpError(status: number): string {
  return HTTP_MESSAGES[status] ?? `Resposta inesperada do Bradesco (HTTP ${status}).`;
}

const RETURN_CODES: Record<string, string> = {
  '04': 'Sem autorização: o usuário não tem permissão para esta consulta.',
  '08': 'Erro de negócio: o banco não conseguiu processar a consulta.',
  '24': 'Falha na infraestrutura do banco. Tente novamente mais tarde.',
};

export class BradescoApiError extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Leitura das respostas
// ---------------------------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

export interface ApiAccountInfo {
  kind: ApiAccountKind | null;
  numero: string;
  digito: string;
  nome: string;
}

export interface ApiEntry {
  fitid: string;
  posted_at: string;
  /** Positivo = entrada, negativo = saída (mesma convenção do OFX). */
  amount: number;
  memo: string;
  trn_type: 'CREDIT' | 'DEBIT';
  balance_after: number | null;
  raw: Rec;
}

export interface ParsedExtrato {
  kind: 'extrato';
  account: ApiAccountInfo | null;
  entries: ApiEntry[];
  opening: { date: string | null; balance: number } | null;
  closing: { date: string; balance: number } | null;
  skipped: { dia: number; futuros: number; invalidos: number };
  /** O banco avisou que há mais registros além do limite de 5.000 (codigoRetorno 01). */
  hasMore: boolean;
  warnings: string[];
}

export interface BalanceLine { code: number | null; name: string; value: number | null }

export interface ParsedSaldo {
  kind: 'saldo';
  account: ApiAccountInfo | null;
  lines: BalanceLine[];
  totalResources: number | null;
  checking: number | null;
  total: number | null;
  blocked: number | null;
  overdraftLimit: number | null;
  investAuto: number | null;
  investRedeem: number | null;
  investGrace: number | null;
  warnings: string[];
}

export type ParsedApi = ParsedExtrato | ParsedSaldo;

function accountInfo(block: Rec): ApiAccountInfo {
  const t = str(block.identificadorTipoConta).toLowerCase();
  return {
    kind: t.includes('poup') || t === '2' ? 'cp' : t.includes('corrente') || t === '1' ? 'cc' : null,
    numero: digits(block.numeroConta).replace(/^0+(?=\d)/, ''),
    digito: digits(block.digitoConta),
    nome: str(block.nomeCliente),
  };
}

/** Lança erro quando o backend responde com falha (codigoRetorno diferente de 00/01). */
function checkReturn(block: Rec): { more: boolean } {
  const code = str(block.codigoRetorno);
  if (code === '' || code === '00') return { more: false };
  if (code === '01') return { more: true };
  const base = RETURN_CODES[code] ?? `Retorno ${code} do banco.`;
  const msg = str(block.mensagem);
  throw new BradescoApiError(msg ? `${base} (${msg})` : base);
}

function balanceOf(rec: Rec): number | null {
  const v = parseBrl(rec.valorSaldoAposLancamento);
  if (!isFinite(v)) return null;
  return str(rec.sinalSaldo) === '-' ? -v : v;
}

interface Collected { entries: Rec[]; opening: Rec[]; dia: number; futuros: number }

function collect(root: Rec): { collected: Collected; account: ApiAccountInfo | null; more: boolean } {
  const c: Collected = { entries: [], opening: [], dia: 0, futuros: 0 };
  let account: ApiAccountInfo | null = null;
  let more = false;

  const ultimos = root.extratoUltimosLancamentos;
  if (isRec(ultimos)) {
    more = checkReturn(ultimos).more || more;
    account = accountInfo(ultimos);
    const lists = isRec(ultimos.listaLancamentos) ? ultimos.listaLancamentos : {};
    c.opening.push(...arr(lists['Saldo Anterior']));
    c.entries.push(...arr(lists['Ultimos Lancamentos']));
    c.dia += arr(lists['Lancamentos Dia']).length;
  }
  const futuros = root.extratoLancamentosFuturos;
  if (isRec(futuros)) {
    more = checkReturn(futuros).more || more;
    const lists = isRec(futuros.listaLancamentos) ? futuros.listaLancamentos : {};
    c.futuros += arr(lists['Lancamentos Futuros']).length;
  }
  const periodo = root.extratoPorPeriodo;
  if (isRec(periodo)) {
    more = checkReturn(periodo).more || more;
    account = account ?? accountInfo(periodo);
    for (const r of arr(periodo.lstLancamentoMensal)) {
      const tipo = str(r.tipoLancamento);
      if (tipo === '01' || tipo === '05' || /saldo anterior/i.test(str(r.descritivoLancamentoAbreviado))) c.opening.push(r);
      else if (tipo === '04') c.futuros++;
      else if (tipo === '09') c.dia++;
      else c.entries.push(r);
    }
  }
  return { collected: c, account, more };
}

/** Identificador estável: conta + data + documento + código + valor + ordem entre linhas iguais do dia. */
export function makeApiFitid(
  acc: ApiAccountInfo | null, p: { date: string; doc: string; code: string; amount: number }, seq: number,
): string {
  const who = acc ? `${acc.kind ?? 'xx'}${acc.numero || 'X'}${acc.digito}` : 'XX';
  return ['BRADAPI', who, p.date.replace(/-/g, ''), p.doc || '0', p.code || '0', String(cents(p.amount)), String(seq)].join(':');
}

export function parseExtratoResponse(root: Rec): ParsedExtrato {
  const { collected, account, more } = collect(root);
  const warnings: string[] = [];
  const skipped = { dia: collected.dia, futuros: collected.futuros, invalidos: 0 };

  const seen = new Map<string, number>();
  const entries: ApiEntry[] = [];
  for (const r of collected.entries) {
    const date = parseBrDate(r.dataLancamento);
    const value = parseBrl(r.valorLancamento);
    const sign = str(r.sinalLancamento);
    if (!date || !isFinite(value) || (sign !== '+' && sign !== '-')) { skipped.invalidos++; continue; }
    const amount = sign === '-' ? -value : value;
    const doc = str(r.numeroDocumento), code = str(r.codigoLancamento);
    const base = [date, doc, code, cents(amount)].join('|');
    const seq = (seen.get(base) ?? 0) + 1;
    seen.set(base, seq);
    const memo = [str(r.descritivoLancamentoCompleto) || str(r.descritivoLancamentoAbreviado), str(r.segundaLinhalLancamento)]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
    entries.push({
      fitid: makeApiFitid(account, { date, doc, code, amount }, seq),
      posted_at: date, amount, memo, trn_type: amount >= 0 ? 'CREDIT' : 'DEBIT',
      balance_after: balanceOf(r), raw: r,
    });
  }

  const op = collected.opening[collected.opening.length - 1];
  const opBal = op ? balanceOf(op) : null;
  const opening = op && opBal !== null ? { date: parseBrDate(op.dataLancamento), balance: opBal } : null;
  const last = [...entries].reverse().find(e => e.balance_after !== null);
  const closing = last ? { date: last.posted_at, balance: last.balance_after as number } : null;

  if (skipped.invalidos > 0) warnings.push(`${skipped.invalidos} linha(s) sem data, valor ou sinal válidos foram ignoradas.`);
  if (skipped.dia > 0) warnings.push(`${skipped.dia} lançamento(s) do dia (D0) não entram: podem mudar até o fechamento.`);
  if (skipped.futuros > 0) warnings.push(`${skipped.futuros} lançamento(s) futuro(s) não entram na conciliação.`);
  if (more) warnings.push('O banco indicou que há mais registros: reduza o período e consulte de novo (limite de 5.000 por consulta).');
  if (entries.length === 0 && collected.entries.length === 0) warnings.push('Nenhum lançamento fechado na resposta.');

  return { kind: 'extrato', account, entries, opening, closing, skipped, hasMore: more, warnings };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

function signedValue(rec: Rec): number | null {
  const v = parseBrl(rec.valorLancamento);
  if (!isFinite(v)) return null;
  return str(rec.sinalSaldo) === '-' ? -v : v;
}

export function parseSaldoResponse(root: Rec): ParsedSaldo {
  const block = isRec(root.saldoCC) ? root.saldoCC : isRec(root.saldoCP) ? root.saldoCP : null;
  if (!block) throw new BradescoApiError('Resposta de saldo sem saldoCC/saldoCP.');
  checkReturn(block);
  const lines: BalanceLine[] = arr(block.lstLancamentosSaldos)
    .filter(r => !/LINHA EM BRANCO/i.test(str(r.nomeProduto)))
    .map(r => ({ code: typeof r.codigoProduto === 'number' ? r.codigoProduto : Number(r.codigoProduto) || null, name: str(r.nomeProduto), value: signedValue(r) }));
  const pick = (re: RegExp) => lines.find(l => re.test(norm(l.name)))?.value ?? null;
  const warnings: string[] = [];
  const result: ParsedSaldo = {
    kind: 'saldo',
    account: accountInfo(block),
    lines,
    totalResources: pick(/TOTAL DE RECURSOS/),
    checking: pick(/^\+? ?CTA CORRENTE/),
    total: pick(/^SALDO TOTAL$/),
    blocked: pick(/TOTAL BLOQUEADO/),
    overdraftLimit: pick(/LIMITE CHEQUE ESPECIAL/),
    investAuto: pick(/^\+ ?INVEST C\/ ?BX AUTOM/),
    investRedeem: pick(/INVESTIMENTO P\/ ?RESGATE/),
    investGrace: pick(/INVESTIMENTO EM CARENCIA/),
    warnings,
  };
  if (result.totalResources === null && result.checking === null) warnings.push('Não foi possível identificar o saldo da conta nesta resposta.');
  return result;
}

/** Aceita o texto do JSON (ou o objeto) e detecta se é extrato ou saldo. */
export function parseApiResponse(input: unknown): ParsedApi {
  let root: unknown = input;
  if (typeof input === 'string') {
    try { root = JSON.parse(input); } catch { throw new BradescoApiError('O texto colado não é um JSON válido.'); }
  }
  if (!isRec(root)) throw new BradescoApiError('Resposta fora do formato esperado.');
  if ('saldoCC' in root || 'saldoCP' in root) return parseSaldoResponse(root);
  if ('extratoUltimosLancamentos' in root || 'extratoPorPeriodo' in root || 'extratoLancamentosFuturos' in root) return parseExtratoResponse(root);
  throw new BradescoApiError('Não reconheci a resposta: esperado saldo (saldoCC/saldoCP) ou extrato (extrato...).');
}

// ---------------------------------------------------------------------------------------------------------------
// Conta e duplicidade
// ---------------------------------------------------------------------------------------------------------------

/**
 * Compara o número da conta da resposta com o ACCTID já gravado na conta do sistema (do OFX).
 * 'unknown' quando a conta do sistema ainda não tem ACCTID ou a resposta não traz o número.
 */
export function accountMatches(ofxAcctid: string | null | undefined, numero: string, digito: string): 'match' | 'mismatch' | 'unknown' {
  const known = digits(ofxAcctid).replace(/^0+/, '');
  const num = digits(numero).replace(/^0+/, '');
  if (!known || !num) return 'unknown';
  return known === num || known === `${num}${digits(digito)}` || known.endsWith(num) ? 'match' : 'mismatch';
}

const slot = (r: { posted_at: string; amount: number }) => `${r.posted_at}|${cents(r.amount)}`;

/**
 * Remove das linhas novas as que já existem vindas de OUTRA origem (ex.: o mesmo dia importado antes por OFX),
 * comparando data + valor, uma a uma (duas linhas iguais no extrato precisam de duas iguais já gravadas).
 */
export function dropCrossSourceDuplicates<T extends { posted_at: string; amount: number }>(
  rows: T[], existingOtherSource: { posted_at: string; amount: number }[],
): { kept: T[]; dropped: T[] } {
  const left = new Map<string, number>();
  for (const e of existingOtherSource) left.set(slot(e), (left.get(slot(e)) ?? 0) + 1);
  const kept: T[] = [], dropped: T[] = [];
  for (const r of rows) {
    const k = slot(r), n = left.get(k) ?? 0;
    if (n > 0) { left.set(k, n - 1); dropped.push(r); } else kept.push(r);
  }
  return { kept, dropped };
}

export const API_FITID_PREFIX = 'BRADAPI:';
export const isApiFitid = (fitid: string) => fitid.startsWith(API_FITID_PREFIX);
