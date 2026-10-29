/**
 * Contrato do xlsx (SheetJS) como a produção o usa: leitura de .xlsx/.xls/.csv por ArrayBuffer e conversão em matriz
 * (src/pages/CardReconciliation.tsx e src/components/ifood/IfoodSheetImport.tsx).
 *
 * Passou a rodar na versão corrigida do CDN oficial (0.20.3; ver docs/troca-xlsx.md). O comportamento correto esperado
 * é um teste normal. Defeitos de leitura de CSV que a biblioteca AINDA tem (0.18.5 e 0.20.3) estão marcados com
 * `it.fails`: passam enquanto o defeito existir e QUEBRAM quando uma versão futura o corrigir (aí troque por `it`).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseSheetDate } from '@/lib/cardSheet';

type Matrix = unknown[][];

// Bytes criados no mesmo "realm" do teste (jsdom): o SheetJS reconhece o ArrayBuffer.
const bytes = (arr: ArrayLike<number>) => new Uint8Array(Array.from(arr)).buffer as ArrayBuffer;
const utf8 = (s: string, bom = false) => bytes([...(bom ? [0xef, 0xbb, 0xbf] : []), ...Buffer.from(s, 'utf8')]);
const latin1 = (s: string) => bytes(Buffer.from(s, 'latin1'));

/** Igual ao cartão: XLSX.read(arrayBuffer, { cellDates: true }) + sheet_to_json({ header: 1, defval: '', raw: true }). */
function readCard(buf: ArrayBuffer): { names: string[]; sheets: Matrix[] } {
  const wb = XLSX.read(buf, { cellDates: true });
  return { names: wb.SheetNames, sheets: wb.SheetNames.map(n => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true })) };
}
/** Igual ao iFood: XLSX.read(arrayBuffer, { type: 'array' }) + sheet_to_json({ header: 1, raw: true, defval: '' }). */
function readIfood(buf: ArrayBuffer): Matrix[] {
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.map(n => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
}
function write(aoa: unknown[][], bookType: 'xlsx' | 'biff8', extraSheet = false): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Planilha1');
  if (extraSheet) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['b']]), 'Segunda');
  return XLSX.write(wb, { type: 'array', bookType, cellDates: true }) as ArrayBuffer;
}

describe('xlsx: .xlsx e .xls (mesma matriz nos dois formatos)', () => {
  const aoa = [['Data', 'Texto', 'Valor', 'Vazio'], ['13/08/2026', 'Padaria, Centro', 1234.56, ''], ['', '', '', ''], ['x', 'y']];
  const expected: Matrix = [['Data', 'Texto', 'Valor', 'Vazio'], ['13/08/2026', 'Padaria, Centro', 1234.56, ''], ['', '', '', ''], ['x', 'y', '', '']];

  it.each(['xlsx', 'biff8'] as const)('%s: textos, números, células vazias e linha curta (preenchida com "")', (type) => {
    expect(readCard(write(aoa, type)).sheets[0]).toEqual(expected);
    expect(readIfood(write(aoa, type))[0]).toEqual(expected);
  });

  it.each(['xlsx', 'biff8'] as const)('%s: abas na ordem e com os nomes originais', (type) => {
    const r = readCard(write(aoa, type, true));
    expect(r.names).toEqual(['Planilha1', 'Segunda']);
    expect(r.sheets[1]).toEqual([['b']]);
  });
});

describe('xlsx: datas lidas como Date (cellDates) e o dia do calendário que o app usa', () => {
  it('no fuso do teste, a data da célula vira o mesmo dia pelo parseSheetDate da produção (.xlsx)', () => {
    const cell = readCard(write([[new Date(2026, 7, 13)]], 'xlsx')).sheets[0][0][0];
    expect(cell).toBeInstanceOf(Date);
    expect(parseSheetDate(cell, new Date(2026, 9, 29))).toBe('2026-08-13');
  });

  // A produção usa o dia LOCAL do navegador (getFullYear/getMonth/getDate). Rodamos num processo filho com TZ controlado.
  const localDay = (tz: string, bookType: 'xlsx' | 'biff8') => execFileSync(process.execPath, ['-e', `
    const X = require('xlsx');
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[new Date(2026, 7, 13)]], { cellDates: true }), 'P');
    const out = X.write(wb, { type: 'array', bookType: '${bookType}', cellDates: true });
    const r = X.read(out, { cellDates: true });
    const d = X.utils.sheet_to_json(r.Sheets.P, { header: 1, defval: '', raw: true })[0][0];
    process.stdout.write([d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-'));
  `], { env: { ...process.env, TZ: tz }, cwd: process.cwd(), encoding: 'utf8' });

  const zones = ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Asia/Tokyo'];
  it.each(zones)('.xlsx mantém o dia 13/08/2026 em %s', (tz) => { expect(localDay(tz, 'xlsx')).toBe('2026-8-13'); });
  // No 0.18.5 o .xls em America/Sao_Paulo voltava 23:59:32 do dia anterior (dia 12). Corrigido na 0.20.x.
  it.each(zones)('.xls mantém o dia 13/08/2026 em %s', (tz) => { expect(localDay(tz, 'biff8')).toBe('2026-8-13'); });

  // Como o Excel grava: data = NÚMERO DE SÉRIE + formato de data (não uma célula do tipo data). A 0.20.0 mudou a
  // interpretação de datas para UTC ("potencialmente quebrador"); este teste garante que o dia local usado pelo app não muda.
  const excelDays = (tz: string, bookType: 'xlsx' | 'biff8') => execFileSync(process.execPath, ['-e', `
    const X = require('xlsx');
    const serial = (y, m, d, f = 0) => Date.UTC(y, m - 1, d) / 86400000 + 25569 + f;
    const ws = {};
    [[2026, 8, 13, 0], [2026, 12, 31, 0], [2026, 1, 1, 0], [2026, 3, 1, 0.5]].forEach(([y, m, d, f], i) => { ws['A' + (i + 1)] = { t: 'n', v: serial(y, m, d, f), z: 'dd/mm/yyyy' }; });
    ws['!ref'] = 'A1:A4';
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'P');
    const r = X.read(X.write(wb, { type: 'array', bookType: '${bookType}' }), { cellDates: true });
    const rows = X.utils.sheet_to_json(r.Sheets.P, { header: 1, defval: '', raw: true });
    process.stdout.write(rows.map(([d]) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')).join(' '));
  `], { env: { ...process.env, TZ: tz }, cwd: process.cwd(), encoding: 'utf8' });
  it.each(zones.flatMap(tz => (['xlsx', 'biff8'] as const).map(t => [tz, t] as const)))(
    'datas em número de série (como o Excel grava) mantêm o dia local em %s (%s)',
    (tz, type) => { expect(excelDays(tz, type)).toBe('2026-8-13 2026-12-31 2026-1-1 2026-3-1'); },
  );
});

describe('xlsx: CSV (aceito pelas duas telas de importação)', () => {
  const lines = (m: Matrix) => m.map(r => r.map(c => (c instanceof Date ? 'DATE' : c)));

  it('UTF-8 com BOM e Windows-1252 (padrão do Excel no Brasil) preservam os acentos', () => {
    const csv = 'Data;Descrição;Valor\n13/08/2026;Padaria;10\n';
    expect(readCard(utf8(csv, true)).sheets[0][0]).toEqual(['Data', 'Descrição', 'Valor']);
    expect(readCard(latin1(csv)).sheets[0][0]).toEqual(['Data', 'Descrição', 'Valor']);
  });
  // Defeito (0.18.5 e 0.20.3): UTF-8 sem BOM é lido como Latin-1 ("DescriÃ§Ã£o") e a tabela deixa de ser reconhecida.
  it.fails('UTF-8 SEM BOM preserva os acentos (defeito conhecido, ainda presente na 0.20.3)', () => {
    expect(readCard(utf8('Data;Descrição;Valor\n13/08/2026;Padaria;10\n')).sheets[0][0]).toEqual(['Data', 'Descrição', 'Valor']);
  });

  it('ponto decimal mantém o número e data não ambígua (13/08/2026) continua texto', () => {
    expect(readCard(utf8('Data,Valor\n13/08/2026,1234.56\n', true)).sheets[0]).toEqual([['Data', 'Valor'], ['13/08/2026', 1234.56]]);
  });

  // Defeito (0.18.5 e 0.20.3): a vírgula vira separador de milhar e 1234,56 chega como 123456 (100 vezes maior).
  it.fails('vírgula decimal brasileira não multiplica o valor por 100 (defeito conhecido, ainda presente na 0.20.3)', () => {
    const v = readCard(utf8('Data;Valor\n13/08/2026;1234,56\n', true)).sheets[0][1][1];
    expect([1234.56, '1234,56']).toContain(v);
  });

  // Defeito (0.18.5 e 0.20.3, com cellDates): "05/09/2026" é lido como mm/dd e vira 9 de maio.
  it.fails('data ambígua dd/mm/aaaa (05/09/2026) não vira mm/dd (defeito conhecido, ainda presente na 0.20.3)', () => {
    const v = readCard(utf8('Data,Valor\n05/09/2026,1\n', true)).sheets[0][1][0];
    const iso = v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : v;
    expect([ '2026-09-05', '05/09/2026' ]).toContain(iso);
  });

  it('linhas vazias e texto com vírgula entre aspas', () => {
    expect(lines(readCard(utf8('A,B\n"Padaria, Centro",x\n,\n', true)).sheets[0])).toEqual([['A', 'B'], ['Padaria, Centro', 'x'], ['', '']]);
  });
});

describe('xlsx: sanidade contra poluição de protótipo (não reproduz o exploit do CVE)', () => {
  it('ler planilhas com nomes/cabeçalhos "__proto__", "constructor" e "prototype" não cria propriedades em Object.prototype', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort().join(',');
    const aoa = [['__proto__', 'constructor', 'prototype', 'polluted'], ['x', 'y', 'z', 'yes']];
    for (const t of ['xlsx', 'biff8'] as const) {
      const wb = XLSX.read(write(aoa, t), { cellDates: true });
      XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); // cabeçalhos viram chaves de objeto
      XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort().join(',')).toBe(before);
  });
});

describe('xlsx: versão instalada e avisos oficiais', () => {
  const [maj, min, pat] = XLSX.version.split('.').map(Number);
  const atLeast = (a: number, b: number, c: number) => maj > a || (maj === a && (min > b || (min === b && pat >= c)));
  it('o package.json e a versão carregada são a mesma (sem versão duplicada no bundle)', () => {
    const pkg = JSON.parse(readFileSync('node_modules/xlsx/package.json', 'utf8')) as { version: string };
    expect(XLSX.version).toBe(pkg.version);
  });
  // GHSA-4r6h-8v6p-xvw6 / CVE-2023-30533 (corrigido na 0.19.3) e GHSA-5pgg-2g8v-p4x9 / CVE-2024-22363 (corrigido na 0.20.2).
  // As correções só existem no CDN oficial do SheetJS (a versão do npm parou na 0.18.5). Ver docs/troca-xlsx.md.
  it('a versão instalada é >= 0.20.2 (CVE-2023-30533 e CVE-2024-22363)', () => {
    expect(atLeast(0, 20, 2)).toBe(true);
  });
  it('vem do CDN oficial do SheetJS, com versão exata e hash de integridade no bun.lock', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.xlsx).toMatch(/^https:\/\/cdn\.sheetjs\.com\/xlsx-\d+\.\d+\.\d+\/xlsx-\d+\.\d+\.\d+\.tgz$/);
    expect(readFileSync('bun.lock', 'utf8')).toMatch(/"xlsx": \["xlsx@https:\/\/cdn\.sheetjs\.com\/[^"]+", \{.*\}, "sha512-[A-Za-z0-9+/=]{80,}"\]/);
  });
});
