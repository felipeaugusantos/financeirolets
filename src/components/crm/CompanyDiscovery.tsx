import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Building2, MapPin, Download, Loader2, Check } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { discoverySchema, duplicateCompany, companyImport, type DiscoveredCompany } from '../../../supabase/functions/crm-discovery/rules';
import type { Tables } from '@/integrations/supabase/types';

interface Props {
  companies: Tables<'crm_companies'>[];
  unitOptions: { value: string; label: string }[];
  create: (row: Partial<Tables<'crm_companies'>>) => Promise<string | false>;
}
export function CompanyDiscovery({ companies, unitOptions, create }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'cnpj' | 'location'>('cnpj');
  const [unitId, setUnitId] = useState('');
  const [interest, setInterest] = useState('coffee_break');
  const [cnpj, setCnpj] = useState('');
  const [segment, setSegment] = useState('Escritórios');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState<DiscoveredCompany[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [imported, setImported] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const duplicate = (r: DiscoveredCompany) => imported[r.external_id] || (user ? duplicateCompany(r, companies, unitId, user.id)?.id : undefined);
  const search = async () => {
    if (lock.current) return;
    const input = discoverySchema.safeParse(mode === 'cnpj' ? { mode, cnpj, unitId } : { mode, segment, location, unitId });
    if (!input.success) { setError(unitId ? input.error.issues.map(i => i.message).join('; ') : 'Selecione a unidade comercial'); return; }
    lock.current = true; setBusy(true); setError(''); setResults([]); setSelected([]); setSearched(false);
    try {
      const { data, error: failure } = await supabase.functions.invoke('crm-discovery', { body: input.data });
      if (failure) {
        let message = failure.message;
        if (failure instanceof FunctionsHttpError) {
          const details = await failure.context.text();
          try { message = JSON.parse(details).error || details; } catch { message = details; }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      const rows = (data?.results ?? []) as DiscoveredCompany[];
      setResults(rows); setSearched(true);
      setSelected(rows.filter(r => !duplicate(r)).map(r => r.external_id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível buscar empresas'); }
    finally { lock.current = false; setBusy(false); }
  };
  const importSelected = async () => {
    if (!user || !unitId || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    let count = 0;
    const saved: Record<string, string> = {};
    try {
      for (const result of results.filter(r => selected.includes(r.external_id)).slice(0, 20)) {
        if (duplicate(result)) continue;
        const id = await create(companyImport(result, unitId, user.id, interest));
        if (!id) { setError('Algumas empresas não foram importadas. Confira a unidade e possíveis cadastros duplicados.'); break; }
        saved[result.external_id] = id;
        setImported(prev => ({ ...prev, [result.external_id]: id }));
        setSelected(prev => prev.filter(k => k !== result.external_id)); count++;
      }
      if (count) toast({ title: `${count} empresa(s) adicionada(s) à carteira` });
      if (count === 1 && mode === 'cnpj' && !results.some(r => selected.includes(r.external_id) && !saved[r.external_id] && !duplicate(r))) navigate(`/crm/empresas/${Object.values(saved)[0]}`);
    } catch { setError('A importação foi interrompida. As empresas já adicionadas foram preservadas.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <section className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="font-heading text-xl font-semibold">Buscar empresas</h2><Button asChild variant="outline"><Link to="/crm/empresas"><Building2 className="mr-2 h-4 w-4" />Leads e empresas</Link></Button></div>
    <div className="flex gap-2" role="group" aria-label="Tipo de busca"><Button variant={mode === 'cnpj' ? 'secondary' : 'ghost'} disabled={busy || saving} onClick={() => { setMode('cnpj'); setResults([]); setSelected([]); setSearched(false); setError(''); }}><Building2 className="mr-2 h-4 w-4" />CNPJ</Button><Button variant={mode === 'location' ? 'secondary' : 'ghost'} disabled={busy || saving} onClick={() => { setMode('location'); setResults([]); setSelected([]); setSearched(false); setError(''); }}><MapPin className="mr-2 h-4 w-4" />Localização</Button></div>
    <fieldset disabled={busy || saving} className="grid gap-4 sm:grid-cols-2 border-0 p-0">
      <div className="space-y-2"><Label>Unidade comercial</Label><Select disabled={busy || saving} value={unitId} onValueChange={v => { setUnitId(v); setSelected([]); }}><SelectTrigger aria-label="Unidade comercial da importação"><SelectValue placeholder="Selecionar unidade" /></SelectTrigger><SelectContent>{unitOptions.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Interesse comercial</Label><Select disabled={busy || saving} value={interest} onValueChange={setInterest}><SelectTrigger aria-label="Interesse comercial"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="coffee_break">Coffee break</SelectItem><SelectItem value="evento_corporativo">Evento corporativo</SelectItem><SelectItem value="encomenda">Encomenda</SelectItem></SelectContent></Select></div>
      {mode === 'cnpj' ? <div className="space-y-2 sm:col-span-2"><Label htmlFor="discovery-cnpj">CNPJ</Label><Input id="discovery-cnpj" inputMode="numeric" maxLength={18} placeholder="00.000.000/0001-00" value={cnpj} onChange={e => setCnpj(e.target.value)} /></div> : <><div className="space-y-2"><Label htmlFor="discovery-segment">Segmento ou empresa</Label><Input id="discovery-segment" maxLength={100} value={segment} onChange={e => setSegment(e.target.value)} placeholder="Clínicas, escritórios, empresas…" /></div><div className="space-y-2"><Label htmlFor="discovery-location">Cidade, bairro ou endereço</Label><Input id="discovery-location" maxLength={160} value={location} onChange={e => setLocation(e.target.value)} placeholder="Ribeirão Preto, SP" /></div></>}
    </fieldset>
    <Button onClick={() => void search()} disabled={busy || saving} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Search className="h-4 w-4" />}{busy ? 'Buscando…' : 'Buscar empresas'}</Button>
    {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
    {searched && !results.length && <p className="text-muted-foreground">Nenhuma empresa encontrada.</p>}
    {results.length > 0 && <><div className="flex flex-wrap justify-between items-center gap-3 border-b border-border pb-3"><span className="text-sm text-muted-foreground">{results.length} resultado(s) · {selected.length} selecionado(s)</span><Button disabled={!selected.length || busy || saving || !unitId} onClick={() => void importSelected()} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}{saving ? 'Importando…' : 'Importar selecionadas'}</Button></div>
      <div className="grid gap-4 md:grid-cols-2">{results.map(r => { const existing = duplicate(r); return <article key={r.external_id} className="rounded-lg border border-border bg-card p-4 min-w-0 space-y-3"><div className="flex items-start gap-3"><Checkbox aria-label={`Selecionar ${r.name}`} disabled={!!existing || saving || busy} checked={!existing && selected.includes(r.external_id)} onCheckedChange={checked => setSelected(prev => checked ? [...prev, r.external_id] : prev.filter(k => k !== r.external_id))} /><div className="min-w-0"><h3 className="font-medium break-words">{r.name}</h3><p className="text-sm text-muted-foreground break-words">{r.segment || 'Sem segmento informado'}</p></div></div><dl className="space-y-1 text-sm break-words">{[['CNPJ', r.document], ['Endereço', r.address], ['Telefone', r.phone], ['E-mail', r.email], ['Site', r.website], ['Situação cadastral', r.registry_status]].filter(([, v]) => v).map(([label, value]) => <div key={label}><dt className="inline text-muted-foreground">{label}: </dt><dd className="inline">{value}</dd></div>)}</dl><p className="text-xs text-muted-foreground">{r.source === 'brasilapi' ? 'BrasilAPI · Dados cadastrais públicos' : 'Google Maps'}{r.attributions?.map(a => ` · ${a.provider}`).join('')}</p>{existing && <Button asChild variant="outline" size="sm"><Link to={`/crm/empresas/${existing}`}><Check className="h-4 w-4 mr-2" />Abrir empresa cadastrada</Link></Button>}</article>; })}</div>
    </>}
  </section>;
}