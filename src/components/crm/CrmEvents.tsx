import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { useToast } from '@/hooks/use-toast';
import { CrudDialog, type FieldConfig, type FormValues } from '@/components/settings/CrudDialog';
import { CrudTable, type ColumnConfig } from '@/components/settings/CrudTable';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContractDialog } from './ContractDialog';
import { Card, CardContent } from '@/components/ui/card';
import { proposalTotalsByEvent } from '@/lib/eventDashboard';
import { EVENT_STATUSES, validateEvent } from '@/lib/crmEventRules';
import type { Tables } from '@/integrations/supabase/types';

type Event = Tables<'crm_events'>;
type Company = Tables<'crm_companies'>;
type Opportunity = Tables<'crm_opportunities'>;
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type EventCrud = ReturnType<typeof useSupabaseCrud<Event>>;

export function EventDialog({ companies, events, initial, companyId, onClose, onCreated }: { companies: Company[]; events: EventCrud; initial?: Event; companyId?: string; onClose: () => void; onCreated?: (id: string) => void }) {
  const { toast } = useToast();
  const fields = useMemo<FieldConfig[]>(() => [
    { name: 'company_id', label: 'Empresa', type: 'select', required: true, options: companies.filter(c => c.active && !c.do_not_contact).map(c => ({ value: c.id, label: c.name })) },
    { name: 'title', label: 'Nome do evento', required: true },
    { name: 'event_date', label: 'Data', type: 'date', required: true },
    { name: 'event_time', label: 'Horário', placeholder: '14:00' },
    { name: 'location', label: 'Local', required: true },
    { name: 'status', label: 'Status', type: 'select', required: true, options: EVENT_STATUSES },
    { name: 'notes', label: 'Observações', type: 'textarea' },
  ], [companies]);
  const defaults = useMemo<FormValues>(() => initial ? { ...initial } : { company_id: companyId ?? '', status: 'planejado' }, [initial, companyId]);
  const save = async (raw: FormValues) => {
    const parent = companies.find(c => c.id === raw.company_id && c.active && !c.do_not_contact);
    const row = { title: String(raw.title ?? '').trim(), event_date: String(raw.event_date ?? ''), location: String(raw.location ?? '').trim(), status: String(raw.status ?? '') };
    const error = validateEvent(row);
    if (!parent || error) { toast({ title: error ?? 'Selecione uma empresa disponível', variant: 'destructive' }); return false; }
    const data = { ...row, company_id: parent.id, owner_id: parent.owner_id, unit_id: parent.unit_id, event_time: String(raw.event_time ?? '').trim() || null, notes: String(raw.notes ?? '').trim() || null };
    if (initial) return events.update(initial.id, data);
    const id = await events.create(data);
    if (id) onCreated?.(id);
    return id;
  };
  return <CrudDialog open onClose={onClose} title={initial ? 'Editar evento' : 'Novo evento'} fields={fields} initialData={defaults} onSave={save} contentClassName="rounded-lg max-w-xl max-h-[85vh] overflow-y-auto" />;
}

export function CrmEvents({ companies, events, opportunities = [], unitFilter, search }: { companies: Company[]; opportunities?: Opportunity[]; events: EventCrud; unitFilter: string; search: string }) {
  const [editing, setEditing] = useState<Event | 'new' | null>(null);
  const [status, setStatus] = useState('all');
  const [contractFor, setContractFor] = useState<Event | null>(null);
  const totals = useMemo(() => proposalTotalsByEvent(opportunities), [opportunities]);
  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? 'Empresa indisponível';
  const columns: ColumnConfig<Event>[] = [
    { key: 'title', label: 'Evento', render: (_v, e) => <span className="font-medium">{e.title}</span> },
    { key: 'company_id', label: 'Empresa', render: (id: string) => <Link className="text-primary" to={`/crm/empresas/${id}`}>{companyName(id)}</Link> },
    { key: 'event_date', label: 'Data', render: (_v, e) => <span className="whitespace-nowrap">{e.event_date.split('-').reverse().join('/')} {e.event_time}</span> },
    { key: 'location', label: 'Local' },
    { key: 'status', label: 'Status', render: (v: string) => <Badge variant={v === 'confirmado' ? 'default' : 'secondary'}>{EVENT_STATUSES.find(s => s.value === v)?.label ?? v}</Badge> },
    { key: 'unit_id', label: 'Propostas', render: (_v, e) => { const t = totals[e.id]; return t ? <span className="whitespace-nowrap"><b>{money(t.total)}</b><span className="block text-xs text-muted-foreground">{t.count} proposta(s) · ganho {money(t.won)}</span></span> : <span className="text-muted-foreground">—</span>; } },
    { key: 'notes', label: 'Observações', render: (v: string) => <span className="block max-w-64 whitespace-pre-wrap break-words">{v || '—'}</span> },
    { key: 'id', label: 'Contrato', render: (_v, e) => <Button size="sm" variant="outline" onClick={() => setContractFor(e)}><FileSignature className="mr-1 h-4 w-4" />Contrato</Button> },
  ];
  const visible = events.data.filter(e => e.active && (unitFilter === 'all' || e.unit_id === unitFilter) && (status === 'all' || e.status === status) && `${e.title} ${e.location} ${companyName(e.company_id)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const sum = (k: 'total' | 'won') => Math.round(visible.reduce((a, e) => a + (totals[e.id]?.[k] ?? 0), 0) * 100) / 100;
  const kpis = [['Eventos', String(visible.length)], ['Próximos', String(visible.filter(e => e.event_date >= today && e.status !== 'cancelado').length)], ['Valor das propostas', money(sum('total'))], ['Ganho', money(sum('won'))]];
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map(([l, v]) => <Card key={l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v}</p></CardContent></Card>)}</div>
    <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filtrar status do evento" className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{EVENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
    <CrudTable title="Eventos" columns={columns} data={visible} loading={events.loading} hasActive={false} onAdd={() => setEditing('new')} onEdit={setEditing} onDelete={id => { if (window.confirm('Arquivar evento? As propostas vinculadas serão preservadas.')) void events.update(id, { active: false }); }} />
    {editing && <EventDialog companies={companies} events={events} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    {contractFor && <ContractDialog event={contractFor} company={companies.find(c => c.id === contractFor.company_id)} onClose={() => setContractFor(null)} />}
  </div>;
}