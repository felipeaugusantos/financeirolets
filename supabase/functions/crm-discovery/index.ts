import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { discoverySchema, fromCnpj, fromPlace, type DiscoveredCompany } from './rules.ts';

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
        const details = await response.text();
        console.error('CNPJ provider failure', response.status, details);
        return json({ error: response.status === 404 ? 'CNPJ não encontrado' : response.status === 429 ? 'Consulta de CNPJ temporariamente limitada. Tente mais tarde.' : 'Consulta de CNPJ indisponível', status: response.status, details }, response.status);
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
        const details = await response.text();
        console.error('Maps provider failure', response.status, details);
        let message = 'Não foi possível buscar empresas no Google Maps';
        if (response.status === 403) {
          let reason: string | undefined;
          try { reason = JSON.parse(details)?.error?.details?.find((d: { reason?: string }) => d.reason)?.reason; } catch { /* Retain provider text below. */ }
          message = reason === 'API_KEY_HTTP_REFERRER_BLOCKED' ? 'A chave de servidor do Google Maps restringe sites. No Google Cloud, altere a restrição dessa chave para Nenhuma ou Endereços IP.' : reason === 'API_KEY_SERVICE_BLOCKED' ? 'A chave de servidor não permite Places API (New). Habilite essa API na lista de APIs permitidas no Google Cloud.' : 'Google Maps negou a consulta. Confira as permissões da chave de servidor no Google Cloud.';
        }
        return json({ error: message, status: response.status, details }, response.status);
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