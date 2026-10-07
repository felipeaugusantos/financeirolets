import { describe, it, expect } from 'vitest';
import { parseSearchAmount, matchesEntrySearch, reconciledPercent } from '@/lib/entrySearch';

describe('busca do extrato', () => {
  it('interpreta valores', () => {
    expect(parseSearchAmount('150')).toBe(150);
    expect(parseSearchAmount('150,00')).toBe(150);
    expect(parseSearchAmount('-150')).toBe(-150);
    expect(parseSearchAmount('1.234,56')).toBe(1234.56);
    expect(parseSearchAmount('cpfl')).toBeNull();
  });
  it('acha por valor ou texto', () => {
    expect(matchesEntrySearch('150', 'PIX', -150)).toBe(true);
    expect(matchesEntrySearch('-150', 'PIX', 150)).toBe(false);
    expect(matchesEntrySearch('pix', 'PIX Fulano', 1)).toBe(true);
    expect(matchesEntrySearch('151', 'PIX', -150)).toBe(false);
  });
  it('percentual', () => {
    expect(reconciledPercent([{ status: 'pendente' }, { status: 'vinculado' }]).pct).toBe(50);
  });
});
