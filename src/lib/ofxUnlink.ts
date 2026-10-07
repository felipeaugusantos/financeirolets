/** Prefixo da nota gravada na linha quando o lançamento nasceu dela (create_transaction_from_entries). */
export const CREATED_NOTE_PREFIX = 'Criado a partir do extrato';

/** Resposta de unlink_statement_entries. */
export interface UnlinkSummary { unlinked: number; deleted: number; kept: number }

interface EntryLike { status: string; match_note: string | null }

/**
 * Linha vinculada a um lançamento que foi CRIADO a partir dela: ao desvincular, esse lançamento é
 * excluído. Lançamento que já existia e foi só vinculado nunca é excluído.
 */
export const createdFromStatement = (e: EntryLike): boolean =>
  e.status === 'vinculado' && !!e.match_note?.startsWith(CREATED_NOTE_PREFIX);

/** Quantas das linhas teriam o lançamento excluído e quantas só perderiam o vínculo. */
export function unlinkImpact(entries: EntryLike[]): { createdLinks: number; existingLinks: number } {
  const linked = entries.filter(e => e.status === 'vinculado');
  const createdLinks = linked.filter(createdFromStatement).length;
  return { createdLinks, existingLinks: linked.length - createdLinks };
}

/** Texto do aviso depois de desvincular. */
export function unlinkSummaryText(s: UnlinkSummary): string {
  const parts = [`${s.unlinked} linha(s) voltaram para pendente`];
  if (s.deleted > 0) parts.push(`${s.deleted} lançamento(s) criado(s) a partir do extrato excluído(s)`);
  if (s.kept > 0) parts.push(`${s.kept} mantido(s), pois ainda há outra linha ligada a ele`);
  return parts.join('; ') + '.';
}

/** Mensagem em português para erros de unlink_statement_entries. */
export function unlinkErrorText(error: { message: string; code?: string }): string {
  if (error.code === 'PGRST202') {
    return 'A função unlink_statement_entries não existe neste banco. Aplique a migração 20261007120000 (scripts/producao/10-desvincular-e-excluir-lancamento.sql) antes de usar.';
  }
  if (error.message.startsWith('entry_not_found')) return 'Linha do extrato não encontrada ou sem permissão. Atualize a tela.';
  return error.message;
}
