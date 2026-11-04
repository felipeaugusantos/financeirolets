import { supabase } from '@/integrations/supabase/client';

export type HelpdeskPriority = 'baixa' | 'normal' | 'alta' | 'critica';
export interface HelpdeskTicket {
  assunto: string;
  descricao: string;
  prioridade: HelpdeskPriority;
  tela: string;
  origem: 'manual' | 'automatico';
}

export async function openHelpdeskTicket(ticket: HelpdeskTicket): Promise<string> {
  const { data, error } = await supabase.functions.invoke('helpdesk-ticket', { body: ticket });
  if (error) {
    let msg = 'Não foi possível abrir o chamado';
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* mantém */ }
    throw new Error(msg);
  }
  return (data as { numero: string }).numero;
}

export interface HelpdeskListItem {
  numero: string;
  assunto: string;
  status: string;
  prioridade: string;
  solicitante?: string | null;
  responsavel?: string | null;
  criado_em: string;
  atualizado_em?: string | null;
  ultima_resposta?: string | null;
}

export const HELPDESK_CLOSED = ['resolvido', 'fechado', 'cancelado', 'encerrado'];
export const isHelpdeskOpen = (status: string) => !HELPDESK_CLOSED.includes(status.toLowerCase());

export async function listHelpdeskTickets(): Promise<{ chamados: HelpdeskListItem[]; aviso?: string }> {
  const { data, error } = await supabase.functions.invoke('helpdesk-ticket', { body: { acao: 'listar' } });
  if (error) {
    let msg = 'Não foi possível consultar os chamados';
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* mantém */ }
    throw new Error(msg);
  }
  const d = (data ?? {}) as { chamados?: HelpdeskListItem[]; aviso?: string };
  return { chamados: Array.isArray(d.chamados) ? d.chamados : [], aviso: d.aviso };
}

export const HELPDESK_MAX_IMAGES = 3;
export const HELPDESK_MAX_BYTES = 5 * 1024 * 1024;

/** Valida imagens do chamado; devolve mensagem de erro ou null. */
export function validateHelpdeskImages(files: { type: string; size: number }[]): string | null {
  if (files.length > HELPDESK_MAX_IMAGES) return `Anexe no máximo ${HELPDESK_MAX_IMAGES} imagens`;
  if (files.some(f => !f.type.startsWith('image/'))) return 'Só é possível anexar imagens';
  if (files.some(f => f.size > HELPDESK_MAX_BYTES)) return 'Cada imagem pode ter até 5 MB';
  return null;
}

/** Envia as imagens e devolve os links para irem na descrição do chamado. */
export async function uploadHelpdeskImages(userId: string, files: File[]): Promise<string[]> {
  const links: string[] = [];
  for (const file of files) {
    const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${userId}/chamados/${Date.now()}_${safe}`;
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type });
    if (error) throw new Error(`Não foi possível enviar a imagem ${file.name}`);
    links.push(supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl);
  }
  return links;
}

/** Chave de deduplicação: mesmo assunto+erro abre só um chamado automático por dia. */
export function autoTicketKey(assunto: string, erro: string, day = new Date()): string {
  return `helpdesk:auto:${day.toISOString().slice(0, 10)}:${assunto}:${erro.slice(0, 120)}`;
}

/** Abre chamado automático de falha, no máximo 1 por erro por dia. Nunca lança. */
export async function reportFailureTicket(assunto: string, erro: string, detalhes = ''): Promise<void> {
  try {
    const key = autoTicketKey(assunto, erro);
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    await openHelpdeskTicket({
      assunto: assunto.slice(0, 200),
      descricao: `Erro: ${erro}${detalhes ? `\n\n${detalhes}` : ''}`.slice(0, 15000),
      prioridade: 'alta',
      tela: window.location.pathname.slice(0, 200) || '/',
      origem: 'automatico',
    });
  } catch { /* chamado automático nunca interrompe o fluxo */ }
}

export async function replyHelpdeskTicket(numero: string, mensagem: string): Promise<{ ok?: boolean; aviso?: string }> {
  const { data, error } = await supabase.functions.invoke('helpdesk-ticket', { body: { acao: 'responder', numero, mensagem } });
  if (error) throw new Error('Não foi possível enviar a resposta');
  return (data ?? {}) as { ok?: boolean; aviso?: string };
}
