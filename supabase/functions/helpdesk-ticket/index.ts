import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const HELPDESK_URL = 'https://helpzetech.lovable.app/api/public/lets-finance/tickets';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const schema = z.object({
  assunto: z.string().trim().min(3).max(200),
  descricao: z.string().trim().min(3).max(15000),
  prioridade: z.enum(['baixa', 'normal', 'alta', 'critica']),
  tela: z.string().trim().min(1).max(200),
  origem: z.enum(['manual', 'automatico']),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
      return json({ chamados: body.chamados.slice(0, 500) });
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
