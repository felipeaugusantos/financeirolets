import { describe, it, expect } from 'vitest';
import { createdFromStatement, unlinkSummaryText, unlinkErrorText } from '@/lib/ofxUnlink';

const e = (status: string, match_note: string | null) => ({ status, match_note });

describe('desvincular conciliação e excluir o lançamento criado', () => {
  it('só lançamento criado a partir do extrato é candidato à exclusão', () => {
    expect(createdFromStatement(e('vinculado', 'Criado a partir do extrato'))).toBe(true);
    expect(createdFromStatement(e('vinculado', 'Criado a partir do extrato (lote)'))).toBe(true);
    expect(createdFromStatement(e('vinculado', 'Criado a partir do extrato (agrupado: 3 linhas)'))).toBe(true);
    // lançamento que já existia e foi só vinculado nunca é excluído
    expect(createdFromStatement(e('vinculado', 'Vinculado na conciliação em painéis'))).toBe(false);
    expect(createdFromStatement(e('vinculado', 'Vínculo automático por descrição idêntica, validado pelas regras de conciliação'))).toBe(false);
    expect(createdFromStatement(e('vinculado', null))).toBe(false);
    // linha ignorada ou pendente não tem lançamento
    expect(createdFromStatement(e('ignorado', 'Criado a partir do extrato'))).toBe(false);
    expect(createdFromStatement(e('pendente', null))).toBe(false);
  });

  it('descreve o resultado em português', () => {
    expect(unlinkSummaryText({ unlinked: 2, deleted: 1, kept: 0 }))
      .toBe('2 linha(s) voltaram para pendente; 1 lançamento(s) criado(s) a partir do extrato excluído(s).');
    expect(unlinkSummaryText({ unlinked: 1, deleted: 0, kept: 1 }))
      .toBe('1 linha(s) voltaram para pendente; 1 mantido(s), pois ainda há outra linha ligada a ele.');
    expect(unlinkSummaryText({ unlinked: 1, deleted: 0, kept: 0 })).toBe('1 linha(s) voltaram para pendente.');
  });

  it('traduz os erros da função', () => {
    expect(unlinkErrorText({ code: 'PGRST202', message: 'x' })).toMatch(/20261007120000/);
    expect(unlinkErrorText({ message: 'entry_not_found: linha inexistente ou sem permissão' })).toMatch(/sem permissão/);
    expect(unlinkErrorText({ message: 'Mês 09/2026 está fechado. Reabra o período para alterar lançamentos.' })).toMatch(/fechado/);
  });
});
