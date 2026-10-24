import { z } from 'zod';

export const discoverySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('cnpj'), unitId: z.string().uuid(), cnpj: z.string().transform(s => s.replace(/[./\-\s]/g, '')).pipe(z.string().regex(/^\d{14}$/, 'Informe um CNPJ com 14 dígitos')) }),
  z.object({ mode: z.literal('location'), unitId: z.string().uuid(), segment: z.string().trim().min(2).max(100), location: z.string().trim().min(3).max(160) }),
]);
export type DiscoveryInput = z.input<typeof discoverySchema>;
export interface DiscoveredCompany {
  external_id: string;
  name: string;
  document: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  segment: string | null;
  source: 'brasilapi' | 'google_maps';
  website: string | null;
  registry_status?: string;
  attributions?: { provider: string; uri: string | null }[];
}
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, 1000) : null;
export function fromCnpj(data: Record<string, unknown>): DiscoveredCompany {
  const document = text(data.cnpj)?.replace(/\D/g, '') ?? null;
  const name = text(data.nome_fantasia) || text(data.razao_social);
  if (!name || !document || document.length !== 14) throw new Error('Cadastro de CNPJ incompleto');
  return {
    external_id: `cnpj:${document}`, name, document,
    address: [data.logradouro, data.numero, data.complemento, data.bairro, data.municipio, data.uf, data.cep].map(text).filter(Boolean).join(', ') || null,
    phone: text(data.ddd_telefone_1), email: text(data.email), segment: text(data.cnae_fiscal_descricao),
    source: 'brasilapi', website: null, registry_status: text(data.descricao_situacao_cadastral) ?? undefined,
  };
}
export function fromPlace(data: Record<string, unknown>): DiscoveredCompany | null {
  const id = text(data.id);
  const display = data.displayName as { text?: unknown } | undefined;
  const name = text(display?.text);
  if (!id || !name) return null;
  const type = data.primaryTypeDisplayName as { text?: unknown } | undefined;
  const attr = Array.isArray(data.attributions) ? data.attributions as { provider?: unknown; providerUri?: unknown }[] : [];
  return { external_id: `google:${id}`, name, document: null, address: text(data.formattedAddress), phone: text(data.nationalPhoneNumber), email: null, segment: text(type?.text), source: 'google_maps', website: text(data.websiteUri), attributions: attr.map(a => ({ provider: text(a.provider) ?? 'Google Maps', uri: text(a.providerUri) })) };
}
export function duplicateCompany<T extends { id: string; unit_id: string; owner_id: string; document: string | null; external_id?: string | null }>(candidate: DiscoveredCompany, companies: T[], unit: string, owner: string): T | undefined {
  return companies.find(c => c.unit_id === unit && c.owner_id === owner && ((candidate.document && c.document?.replace(/\D/g, '') === candidate.document) || c.external_id === candidate.external_id));
}
export function companyImport(candidate: DiscoveredCompany, unit_id: string, owner_id: string, interest: string) {
  if (!['coffee_break', 'evento_corporativo', 'encomenda'].includes(interest)) throw new Error('Interesse inválido');
  return { name: candidate.name, document: candidate.document, phone: candidate.phone, email: candidate.email, address: candidate.address, segment: candidate.segment, external_id: candidate.external_id, source: candidate.source, unit_id, owner_id, interest, status: 'novo', notes: [candidate.website ? `Site: ${candidate.website}` : '', candidate.registry_status ? `Situação cadastral: ${candidate.registry_status}` : '', ...(candidate.attributions ?? []).map(a => `Fonte: ${a.provider}${a.uri ? ` — ${a.uri}` : ''}`)].filter(Boolean).join('\n') || null };
}