import { z } from 'zod';

export const ticketSchema = z.object({
  assunto: z.string().trim().min(3).max(200),
  descricao: z.string().trim().min(3).max(15000),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'critica']),
  tela: z.string().trim().min(1).max(200),
  origem: z.enum(['manual', 'automatico']),
}).strict();

export const replySchema = z.object({ acao: z.literal('responder'), numero: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(40)), mensagem: z.string().trim().min(2).max(15000) }).strict();
