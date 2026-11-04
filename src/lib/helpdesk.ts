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
