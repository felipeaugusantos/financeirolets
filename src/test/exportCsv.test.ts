import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToCsv, csvNumber, csvDate, csvCode, csvIndent } from '@/lib/exportCsv';

let captured = '';
beforeEach(() => {
  captured = '';
  global.Blob = class { constructor(parts: any[]) { captured = parts.join(''); } } as any;
  global.URL.createObjectURL = vi.fn(() => 'blob:x');
  global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(document, 'createElement').mockReturnValue({ click: vi.fn(), set href(_v: string) {}, set download(_v: string) {} } as any);
});

describe('exportToCsv pt-BR', () => {
  it('usa ; como delimitador, CRLF e BOM', () => {
    exportToCsv('a.csv', ['Código', 'Linha', 'Realizado'], [[csvCode('1.1'), 'Vendas', csvNumber(98000)]]);
    expect(captured.startsWith('\uFEFF')).toBe(true);
    expect(captured).toContain('Código;Linha;Realizado\r\n');
    expect(captured).toContain('="1.1";Vendas;98000,00');
  });

  it('escapa ; aspas e quebras de linha', () => {
    exportToCsv('a.csv', ['A'], [['x;y'], ['diz "oi"'], ['linha1\nlinha2']]);
    expect(captured).toContain('"x;y"');
    expect(captured).toContain('"diz ""oi"""');
    expect(captured).toContain('"linha1\nlinha2"');
  });

  it('não adiciona aspas em texto com vírgula decimal', () => {
    exportToCsv('a.csv', ['V'], [[csvNumber(1234.56)]]);
    expect(captured).toContain('\r\n1234,56');
  });

  it('formata datas e indentação', () => {
    expect(csvDate('2026-08-13')).toBe('13/08/2026');
    expect(csvDate(null)).toBe('');
    expect(csvIndent(2, 'Vendas')).toBe('\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Vendas');
    expect(csvCode('01.10')).toEqual({ raw: '="01.10"' });
  });
});
