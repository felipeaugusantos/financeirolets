import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { cnpjFailure, discoverySchema, fromCnpj, fromPlace, mapsFailure, type DiscoveredCompany } from './rules.ts';

const cache = new Map<string, { expires: number; results: DiscoveredCompany[] }>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Entre no sistema para buscar empresas' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anon) return json({ error: 'Configuração de acesso indisponível' }, 503);
    const client = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: userData, error: authError } = await client.auth.getUser(auth.slice(7));
    if (authError || !userData.user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);
    const parsed = discoverySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.issues.map(i => i.message).join('; ') }, 400);
    const input = parsed.data;
    const [{ data: allowed, error: accessError }, { data: unit, error: unitError }] = await Promise.all([
      client.rpc('crm_can_access', { p_owner: userData.user.id, p_unit: input.unitId }),
      client.from('units').select('id,active').eq('id', input.unitId).maybeSingle(),
    ]);
    if (accessError || !allowed || unitError || !unit?.active) return json({ error: 'Sem acesso comercial à unidade selecionada' }, 403);
    const key = `${userData.user.id}:${JSON.stringify(input)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return json({ results: hit.results });
    let results: DiscoveredCompany[];
    if (input.mode === 'cnpj') {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${input.cnpj}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        // O corpo do provedor não é devolvido nem registrado: só status e motivo conhecido.
        const failure = cnpjFailure(response.status);
        console.error('[crm-discovery] falha do provedor', JSON.stringify(failure.log));
        return json({ error: failure.error }, failure.status);
      }
      results = [fromCnpj(await response.json())];
    } else {
      const gatewayKey = Deno.env.get('LOVABLE_API_KEY');
      const connectionKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
      if (!gatewayKey || !connectionKey) return json({ error: 'Conecte Google Maps para buscar por localização' }, 503);
      const response = await fetch('https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchText', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': connectionKey, 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,places.attributions' },
        body: JSON.stringify({ textQuery: `${input.segment} em ${input.location}`, pageSize: 20, languageCode: 'pt-BR', regionCode: 'BR' }),
      });
      if (!response.ok) {
        // O corpo é lido só para reconhecer o motivo (lista fechada); não é devolvido nem registrado.
        const failure = mapsFailure(response.status, await response.text());
        console.error('[crm-discovery] falha do provedor', JSON.stringify(failure.log));
        return json({ error: failure.error }, failure.status);
      }
      const body = await response.json();
      results = (Array.isArray(body.places) ? body.places : []).slice(0, 20).map(fromPlace).filter((p: DiscoveredCompany | null): p is DiscoveredCompany => p !== null);
      results = [...new Map(results.map(p => [p.external_id, p])).values()];
    }
    if (cache.size >= 100) cache.clear();
    cache.set(key, { expires: Date.now() + 300000, results });
    return json({ results });
  } catch (error) {
    return json({ error: error instanceof Error && error.name === 'TimeoutError' ? 'A consulta demorou demais. Tente novamente.' : 'Não foi possível concluir a consulta' }, 502);
  }
});