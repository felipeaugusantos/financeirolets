import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { createRateLimiter, tooManyRequests } from '../_shared/rate-limit.ts';
import { z } from 'npm:zod@3';

const HELPDESK_URL = 'https://helpzetech.lovable.app/api/public/lets-finance/tickets';
// Freio por usuário: criar/responder chamados é mais restrito que apenas listar.
const writeLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const readLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });
const jsonWith = (cors: Record<string, string>) => (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const schema = z.object({
  assunto: z.string().trim().min(3).max(200),
  descricao: z.string().trim().min(3).max(15000),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'critica']),
  tela: z.string().trim().min(1).max(200),
  origem: z.enum(['manual', 'automatico']),
}).strict();

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = jsonWith(cors);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Entre no sistema para abrir chamados' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const token = Deno.env.get('HELPDESK_TOKEN');
    if (!url || !anon || !token) return json({ error: 'Integração com a central indisponível' }, 503);
    const client = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: userData, error } = await client.auth.getUser(auth.slice(7));
    if (error || !userData.user?.email) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);
    const raw = await req.json().catch(() => null);
    const isList = !!raw && typeof raw === 'object' && (raw as { acao?: string }).acao === 'listar';
    const rate = (isList ? readLimiter : writeLimiter).check(userData.user.id);
    if (!rate.allowed) return tooManyRequests(rate.retryAfter, cors);
    if (raw && typeof raw === 'object' && (raw as { acao?: string }).acao === 'listar') {
      const res = await fetch(HELPDESK_URL, {
        method: 'GET', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}` },
      });
      // Sem consulta na central, o endereço devolve a página do site (HTML) com 200.
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (res.status === 404 || res.status === 405 || (res.ok && !isJson)) return json({ chamados: [], aviso: 'A central ainda não permite consultar chamados' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body?.chamados)) {
        console.error('[helpdesk-ticket] listar', res.status);
        return json({ chamados: [], aviso: 'Não foi possível consultar a central agora. Tente atualizar em instantes.' });
      }
      // A central pode devolver campos em inglês; normaliza para o formato da tela.
      const chamados = body.chamados.slice(0, 500).map((c: Record<string, unknown>) => ({
        numero: c.numero ?? c.number, assunto: c.assunto ?? c.subject, status: c.status ?? '',
        prioridade: c.prioridade ?? c.priority ?? '', solicitante: c.solicitante ?? c.applicant ?? c.requester ?? null,
        responsavel: c.responsavel ?? c.assignee ?? null, criado_em: c.criado_em ?? c.created_at,
        atualizado_em: c.atualizado_em ?? c.updated_at ?? null, ultima_resposta: c.ultima_resposta ?? null,
      }));
      return json({ chamados });
    }
    if (raw && typeof raw === 'object' && (raw as { acao?: string }).acao === 'responder') {
      const r = z.object({ acao: z.literal('responder'), numero: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(40)), mensagem: z.string().trim().min(2).max(15000) }).strict().safeParse(raw);
      if (!r.success) return json({ error: 'Escreva a resposta (mínimo 2 letras)' }, 400);
      const { data: prof } = await client.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle();
      const email = userData.user.email;
      const nome = ((prof as { full_name?: string } | null)?.full_name || email.split('@')[0]).slice(0, 120).padEnd(2, '.');
      const res = await fetch(`${HELPDESK_URL}/responder`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: r.data.numero, mensagem: r.data.mensagem, nome, email }),
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (res.status === 404 || res.status === 405 || (res.ok && !isJson)) return json({ aviso: 'A central ainda não permite responder chamados por aqui' });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        console.error('[helpdesk-ticket] responder', res.status, b?.erro ?? '');
        const msgs: Record<string, string> = {
          solicitante_nao_encontrado: `Seu e-mail (${email}) não está cadastrado como usuário na central de chamados. Peça ao suporte para cadastrá-lo.`,
          chamado_nao_encontrado: 'Chamado não encontrado na central.',
          dados_invalidos: 'A central recusou o formato da resposta.',
        };
        return json({ aviso: msgs[b?.erro] ?? 'A central não aceitou a resposta. Tente de novo.' });
      }
      return json({ ok: true });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return json({ error: 'Preencha assunto e descrição (mínimo 3 letras)' }, 400);
    const { data: profile } = await client.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle();
    const email = userData.user.email;
    const nome = ((profile as { full_name?: string } | null)?.full_name || email.split('@')[0]).slice(0, 120).padEnd(2, '.');
    const res = await fetch(HELPDESK_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, nome, email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.numero) {
      console.error('[helpdesk-ticket] central respondeu', res.status, body?.erro ?? '');
      const msg = res.status === 401 ? 'A chave da central não confere' : 'A central de chamados não aceitou o pedido';
      return json({ error: msg }, 502);
    }
    return json({ numero: body.numero });
  } catch (e) {
    console.error('[helpdesk-ticket] falha', e instanceof Error ? e.message : 'erro');
    return json({ error: 'Não foi possível falar com a central de chamados' }, 502);
  }
});
