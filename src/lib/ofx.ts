/**
 * Leitor de arquivos OFX (extratos bancários) — Bradesco e Stone.
 *
 * O OFX é SGML: as tags podem não ter fechamento. O parser abaixo é tolerante
 * e trabalha sempre por bloco <STMTTRN>...</STMTTRN>.
 *
 * NADA aqui grava no banco. A função só transforma texto em linhas de extrato.
 */

export interface OfxTransaction {
  /** Identificador único da transação no banco. Base da proteção anti-duplicidade. */
  fitid: string;
  /** Data de lançamento no formato aaaa-mm-dd (data local, sem deslocamento de fuso). */
  posted_at: string;
  /** Positivo = entrada, negativo = saída (como vem do banco). */
  amount: number;
  /** Texto descritivo (MEMO e/ou NAME concatenados). */
  memo: string;
  /** Tipo informado pelo banco (CREDIT, DEBIT, PIX, FEE...). */
  trn_type: string;
  check_number?: string;
}

export interface OfxStatement {
  /** Número da conta declarado no arquivo (ACCTID). */
  acctid: string;
  /** Código do banco (BANKID) — vazio em arquivos de adquirente. */
  bankid: string;
  currency: string;
  /** Período declarado no arquivo, quando presente. */
  start_date: string | null;
  end_date: string | null;
  /** Saldo final informado pelo banco (LEDGERBAL), quando presente. */
  ledger_balance: number | null;
  ledger_balance_date: string | null;
  transactions: OfxTransaction[];
}

export class OfxParseError extends Error {}

/** Extrai o conteúdo da primeira ocorrência de uma tag simples (valor inline). */
function tagValue(block: string, tag: string): string {
  // Aceita <TAG>valor (SGML) e <TAG>valor</TAG> (XML).
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Converte DTPOSTED do OFX (aaaammdd[hhmmss][.xxx][fuso]) em aaaa-mm-dd.
 *
 * Usamos apenas os 8 primeiros dígitos de propósito: converter para Date e
 * voltar causaria deslocamento de um dia em UTC-3 (bug já corrigido no resto
 * do sistema).
 */
export function parseOfxDate(raw: string): string | null {
  const digits = (raw || '').replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const year = +y, month = +m, day = +d;
  if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${y}-${m}-${d}`;
}

/** Valores OFX usam ponto decimal, mas alguns bancos brasileiros mandam vírgula. */
export function parseOfxAmount(raw: string): number {
  let s = (raw || '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s);
}

/** Remove o cabeçalho OFX/SGML e normaliza o corpo. */
function stripHeader(text: string): string {
  const cleaned = text.replace(/^\uFEFF/, '');
  const idx = cleaned.search(/<OFX>/i);
  return idx >= 0 ? cleaned.slice(idx) : cleaned;
}

/**
 * Lê um arquivo OFX inteiro. Retorna um extrato por conta encontrada
 * (arquivos de adquirente às vezes trazem mais de um STMTRS).
 */
export function parseOfx(text: string): OfxStatement[] {
  const body = stripHeader(text);
  if (!/<STMTTRN>/i.test(body)) {
    throw new OfxParseError(
      'Nenhuma transação encontrada no arquivo. Confirme que é um extrato OFX (não um OFC ou CSV renomeado).'
    );
  }

  // Cada <STMTRS> (ou <CCSTMTRS>) é um extrato de conta.
  const stmtBlocks = body.match(/<(?:STMTRS|CCSTMTRS)>[\s\S]*?<\/(?:STMTRS|CCSTMTRS)>/gi)
    ?? [body]; // arquivos sem fechamento: trata o corpo inteiro como um extrato

  const statements: OfxStatement[] = [];

  for (const block of stmtBlocks) {
    const acctBlock = block.match(/<(?:BANKACCTFROM|CCACCTFROM)>[\s\S]*?(?:<\/(?:BANKACCTFROM|CCACCTFROM)>|<BANKTRANLIST>)/i)?.[0] ?? block;
    const acctid = tagValue(acctBlock, 'ACCTID');
    const bankid = tagValue(acctBlock, 'BANKID');

    const tranList = block.match(/<BANKTRANLIST>[\s\S]*?(?:<\/BANKTRANLIST>|<LEDGERBAL>|$)/i)?.[0] ?? block;
    const start_date = parseOfxDate(tagValue(tranList, 'DTSTART'));
    const end_date = parseOfxDate(tagValue(tranList, 'DTEND'));

    const ledgerBlock = block.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|$)/i)?.[0] ?? '';
    const balRaw = ledgerBlock ? tagValue(ledgerBlock, 'BALAMT') : '';
    const ledger_balance = balRaw ? parseOfxAmount(balRaw) : null;
    const ledger_balance_date = ledgerBlock ? parseOfxDate(tagValue(ledgerBlock, 'DTASOF')) : null;

    const trnBlocks = block.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>))/gi) ?? [];
    const transactions: OfxTransaction[] = [];

    for (const trn of trnBlocks) {
      const posted_at = parseOfxDate(tagValue(trn, 'DTPOSTED'));
      const amount = parseOfxAmount(tagValue(trn, 'TRNAMT'));
      if (!posted_at || !isFinite(amount)) continue;

      const name = tagValue(trn, 'NAME');
      const memoTag = tagValue(trn, 'MEMO');
      const memo = [name, memoTag].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');

      const fitidRaw = tagValue(trn, 'FITID');
      // Alguns arquivos vêm sem FITID: geramos um determinístico para que a
      // reimportação do mesmo arquivo continue sendo detectada como duplicada.
      const fitid = fitidRaw || `GEN-${posted_at}-${amount.toFixed(2)}-${memo.slice(0, 40)}`;

      transactions.push({
        fitid,
        posted_at,
        amount,
        memo,
        trn_type: tagValue(trn, 'TRNTYPE') || (amount >= 0 ? 'CREDIT' : 'DEBIT'),
        check_number: tagValue(trn, 'CHECKNUM') || undefined,
      });
    }

    if (transactions.length > 0) {
      statements.push({
        acctid,
        bankid,
        currency: tagValue(block, 'CURDEF') || 'BRL',
        start_date,
        end_date,
        ledger_balance,
        ledger_balance_date,
        transactions,
      });
    }
  }

  if (statements.length === 0) {
    throw new OfxParseError('O arquivo foi lido, mas nenhuma transação válida (data + valor) foi encontrada.');
  }

  return statements;
}

/**
 * Alguns bancos exportam OFX em ISO-8859-1 (acentos quebrados em UTF-8).
 * Lê o arquivo tentando descobrir a codificação declarada no cabeçalho.
 */
export async function readOfxFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const declared = utf8.match(/CHARSET:\s*([\w-]+)/i)?.[1]?.toUpperCase();
  const looksBroken = utf8.includes('\uFFFD');
  if (declared === '1252' || declared === 'ISO-8859-1' || declared === 'LATIN1' || looksBroken) {
    try {
      return new TextDecoder('windows-1252').decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}
