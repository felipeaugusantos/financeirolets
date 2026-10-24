import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Building2, Package, CalendarDays, ChevronRight, ListFilter, Plus, Search, Check, Users, Cookie } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CrudTable, type ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, type FieldConfig, type FormValues } from '@/components/settings/CrudDialog';
import { CRM_STAGES, normalizeCompanyDocument, validateCrmStage } from '@/lib/crmRules';
import { CompanyDiscovery } from '@/components/crm/CompanyDiscovery';
import { CrmOrders } from '@/components/crm/CrmOrders';
import { CrmProducts } from '@/components/crm/CrmProducts';
import type { Tables } from '@/integrations/supabase/types';

type Company = Tables<'crm_companies'>;
type Opportunity = Tables<'crm_opportunities'>;
type Activity = Tables<'crm_activities'>;
type Contact = Tables<'crm_contacts'>;
type Editor = { kind: 'company' | 'opportunity' | 'activity' | 'contact'; data?: FormValues };
const stages: Record<string, string> = { qualificacao: 'Qualificação', briefing: 'Briefing / degustação', proposta: 'Proposta', negociacao: 'Negociação', ganha: 'Ganha', perdida: 'Perdida' };
const leadStates = [{ value: 'novo', label: 'Novo' }, { value: 'em_contato', label: 'Em contato' }, { value: 'qualificado', label: 'Qualificado' }, { value: 'descartado', label: 'Descartado' }, { value: 'cliente', label: 'Cliente' }];
const interests = [{ value: 'coffee_break', label: 'Coffee break' }, { value: 'evento_corporativo', label: 'Evento corporativo' }, { value: 'encomenda', label: 'Encomenda' }, { value: 'distribuicao', label: 'Distribuição / revenda' }];
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (date: string | null) => date ? date.split('-').reverse().join('/') : '—';
const nav = [{ path: '/crm/agenda', label: 'Minha agenda', icon: CalendarDays }, { path: '/crm/buscar', label: 'Buscar empresas', icon: Search }, { path: '/crm/clientes', label: 'Clientes', icon: Users }, { path: '/crm/empresas', label: 'Leads e empresas', icon: Building2 }, { path: '/crm/produtos', label: 'Produtos', icon: Cookie }, { path: '/crm/funil', label: 'Funil', icon: ListFilter }, { path: '/crm/pedidos', label: 'Distribuição & pedidos', icon: Package }];

export default function Crm() {
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useCurrentUserRoles();
  const { toast } = useToast();
  const location = useLocation();
  const { companyId } = useParams();
  const companies = useSupabaseCrud<Company>('crm_companies');
  const opportunities = useSupabaseCrud<Opportunity>('crm_opportunities');
  const activities = useSupabaseCrud<Activity>('crm_activities');
  const contacts = useSupabaseCrud<Contact>('crm_contacts');
  const units = useSupabaseCrud<Tables<'units'>>('units', 'name');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const company = companies.data.find(c => c.id === companyId);
  const isAgenda = location.pathname.endsWith('/agenda');
  const isPipeline = location.pathname.endsWith('/funil');
  const isDiscovery = location.pathname.endsWith('/buscar');
  const isOrders = location.pathname.endsWith('/pedidos');
  const isProducts = location.pathname.endsWith('/produtos');
  const isClients = location.pathname.endsWith('/clientes');
  const canUse = roles.some(r => ['admin', 'gerente_unidade', 'vendedor'].includes(r));
  const loading = companies.loading || opportunities.loading || activities.loading || contacts.loading;
  const unitOptions = useMemo(() => units.data.filter(u => u.active).map(u => ({ value: u.id, label: u.name })), [units.data]);
  const companyOptions = useMemo(() => companies.data.filter(c => c.active && !c.do_not_contact).map(c => ({ value: c.id, label: c.name })), [companies.data]);
  const companyName = (id: string) => companies.data.find(c => c.id === id)?.name ?? 'Empresa indisponível';
  const unitName = (id: string) => units.data.find(u => u.id === id)?.name ?? '—';
  const matches = (c: Company) => (unitFilter === 'all' || c.unit_id === unitFilter) && `${c.name} ${c.document ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  const filteredCompanies = companies.data.filter(c => c.active && matches(c) && (statusFilter === 'all' || c.status === statusFilter));
  const visibleOpportunities = opportunities.data.filter(o => o.active && (companyId ? o.company_id === companyId : (unitFilter === 'all' || o.unit_id === unitFilter) && `${o.title} ${companyName(o.company_id)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const visibleActivities = activities.data.filter(a => a.active && (companyId ? a.company_id === companyId : (unitFilter === 'all' || a.unit_id === unitFilter) && `${a.title} ${companyName(a.company_id)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && (!fromDate || (a.due_date ?? '') >= fromDate) && (!toDate || (a.due_date ?? '') <= toDate)).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const openEditor = (kind: Editor['kind'], row?: Company | Opportunity | Activity | Contact) => {
    setEditor({ kind, data: row ? { ...row } : { ...(kind === 'company' && isClients ? { status: 'cliente', interest: 'distribuicao' } : {}), company_id: companyId ?? '', unit_id: company?.unit_id ?? '', owner_id: user?.id ?? '', stage: 'qualificacao', interest: 'coffee_break', status: 'novo', sale_type: 'coffee_break', delivery_mode: 'entrega', kind: 'tarefa', source: 'manual' } });
  };
  const fields = useMemo<FieldConfig[]>(() => {
    const unit: FieldConfig = { name: 'unit_id', label: 'Unidade comercial', type: 'select', required: true, options: unitOptions };
    const parent: FieldConfig = { name: 'company_id', label: 'Empresa', type: 'select', required: true, options: companyOptions };
    if (editor?.kind === 'company') return [
      { name: 'name', label: 'Empresa', required: true }, { name: 'document', label: 'CNPJ' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail' },
      { name: 'contact_name', label: 'Responsável' }, { name: 'segment', label: 'Segmento' }, { name: 'address', label: 'Endereço de entrega' }, unit,
      { name: 'payment_terms', label: 'Condição de pagamento padrão' },
      { name: 'interest', label: 'Interesse', type: 'select', options: interests, required: true },
      { name: 'status', label: 'Situação', type: 'select', options: leadStates, required: true },
      { name: 'source', label: 'Origem', required: true }, { name: 'notes', label: 'Observações', type: 'textarea' }
    ];
    if (editor?.kind === 'contact') return [parent, { name: 'name', label: 'Nome do contato', required: true }, { name: 'position', label: 'Cargo' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail' }, { name: 'source', label: 'Origem', required: true }];
    if (editor?.kind === 'activity') return [parent, { name: 'title', label: 'Próxima ação', required: true }, unit,
      { name: 'kind', label: 'Tipo', type: 'select', options: ['tarefa','ligacao','reuniao','degustacao','mensagem'].map(value => ({ value, label: { tarefa: 'Tarefa', ligacao: 'Ligação', reuniao: 'Reunião', degustacao: 'Degustação', mensagem: 'Mensagem' }[value] ?? value })), required: true },
      { name: 'due_date', label: 'Data agendada', type: 'date', required: true }, { name: 'notes', label: 'Registro do contato', type: 'textarea' }];
    return [parent, { name: 'title', label: 'Oportunidade', required: true }, unit,
      { name: 'sale_type', label: 'Tipo de pedido', type: 'select', options: interests, required: true },
      { name: 'stage', label: 'Etapa', type: 'select', options: CRM_STAGES.map(value => ({ value, label: stages[value] })), required: true },
      { name: 'estimated_value', label: 'Valor estimado (R$)', type: 'number' }, { name: 'event_date', label: 'Data do evento / entrega', type: 'date' },
      { name: 'event_time', label: 'Horário' }, { name: 'attendees', label: 'Participantes', type: 'number' },
      { name: 'production_unit_id', label: 'Unidade de produção', type: 'select', options: [{ value: '__none__', label: 'Não definida' }, ...unitOptions] },
      { name: 'delivery_mode', label: 'Atendimento', type: 'select', options: [{ value: 'entrega', label: 'Entrega' }, { value: 'retirada', label: 'Retirada' }], required: true },
      { name: 'address', label: 'Endereço do evento' }, { name: 'requested_items', label: 'Itens e quantidades', type: 'textarea' },
      { name: 'requirements', label: 'Montagem, serviço e restrições alimentares', type: 'textarea' }, { name: 'loss_reason', label: 'Motivo de perda', type: 'textarea' }
    ];
  }, [editor?.kind, companyOptions, unitOptions]);
  const save = async (raw: FormValues): Promise<boolean | string> => {
    if (!editor || !user) return false;
    const missing = fields.find(f => f.required && !String(raw[f.name] ?? '').trim());
    if (missing) { toast({ title: `Preencha: ${missing.label}`, variant: 'destructive' }); return false; }
    const row: FormValues = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === '' || v === '__none__' ? null : v]));
    const id = editor.data?.id;
    if (editor.kind === 'company') {
      row.document = normalizeCompanyDocument(String(raw.document ?? ''));
      if (row.document && String(row.document).length !== 14) { toast({ title: 'Informe um CNPJ com 14 dígitos', variant: 'destructive' }); return false; }
      return typeof id === 'string' ? companies.update(id, row) : companies.create({ ...row, owner_id: user.id });
    }
    if (editor.kind === 'contact') return typeof id === 'string' ? contacts.update(id, row) : contacts.create(row);
    const parent = companies.data.find(c => c.id === row.company_id);
    if (!parent || parent.do_not_contact || !parent.active) { toast({ title: 'Empresa indisponível para contato', variant: 'destructive' }); return false; }
    if (row.unit_id !== parent.unit_id) { toast({ title: 'Use a unidade comercial da empresa', variant: 'destructive' }); return false; }
    if (editor.kind === 'opportunity') {
      if (!validateCrmStage(raw.stage as Opportunity['stage'] & typeof CRM_STAGES[number], String(raw.loss_reason ?? ''))) { toast({ title: 'Informe o motivo de perda', variant: 'destructive' }); return false; }
      row.estimated_value = Number(raw.estimated_value || 0);
      row.attendees = raw.attendees === '' || raw.attendees == null ? null : Number(raw.attendees);
      if (!Number.isFinite(row.estimated_value) || row.estimated_value < 0 || (typeof row.attendees === 'number' && (!Number.isInteger(row.attendees) || row.attendees < 1))) { toast({ title: 'Confira valor e participantes', variant: 'destructive' }); return false; }
      row.closed_at = ['ganha','perdida'].includes(String(raw.stage)) ? editor.data?.closed_at || new Date().toISOString() : null;
      return typeof id === 'string' ? opportunities.update(id, row) : opportunities.create({ ...row, owner_id: parent.owner_id });
    }
    return typeof id === 'string' ? activities.update(id, row) : activities.create({ ...row, owner_id: parent.owner_id });
  };
  const archive = (kind: Editor['kind'], id: string) => {
    if (!window.confirm('Arquivar este registro? O histórico será preservado.')) return;
    void ({ company: companies, opportunity: opportunities, activity: activities, contact: contacts }[kind].update(id, { active: false }));
  };
  const companyColumns: ColumnConfig<Company>[] = [
    { key: 'name', label: 'Empresa', render: (_v, c) => <Link to={`/crm/empresas/${c.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{c.name}</Link> },
    { key: 'segment', label: 'Segmento' }, { key: 'unit_id', label: 'Unidade', render: (v: string) => unitName(v) },
    { key: 'status', label: 'Situação', render: (v: string, c) => <Badge variant="outline">{c.do_not_contact ? 'Não contatar' : leadStates.find(s => s.value === v)?.label}</Badge> },
    { key: 'phone', label: 'Telefone' }
  ];
  const activityColumns: ColumnConfig<Activity>[] = [
    { key: 'due_date', label: 'Data', render: (v: string) => dateLabel(v) },
    { key: 'title', label: 'Próxima ação' }, { key: 'company_id', label: 'Empresa', render: (v: string) => <Link className="text-primary" to={`/crm/empresas/${v}`}>{companyName(v)}</Link> },
    { key: 'completed', label: 'Situação', render: (v: boolean, a) => <Button size="sm" variant={v ? 'secondary' : 'outline'} onClick={() => void activities.update(a.id, { completed: !v })} className="gap-1"><Check className="h-3 w-3" />{v ? 'Concluída' : a.due_date && a.due_date < new Date().toLocaleDateString('en-CA') ? 'Atrasada' : 'Pendente'}</Button> }
  ];
  if (rolesLoading) return <p className="text-muted-foreground">Carregando CRM…</p>;
  if (!canUse) return <div className="space-y-2"><h1 className="font-heading text-2xl font-semibold">CRM</h1><p className="text-muted-foreground">Seu perfil não tem acesso à carteira comercial.</p></div>;
  return <div className="space-y-6">
    <header className="flex items-center gap-3"><Building2 className="h-7 w-7 text-primary" /><div><h1 className="font-heading text-2xl font-semibold">CRM</h1><p className="text-sm text-muted-foreground">Vendas corporativas e coffee breaks</p></div></header>
    <nav aria-label="CRM" className="flex flex-wrap gap-2 border-b border-border pb-3">{nav.map(n => <Button asChild variant={location.pathname.startsWith(n.path) ? 'secondary' : 'ghost'} key={n.path}><Link to={n.path}><n.icon className="mr-2 h-4 w-4" />{n.label}</Link></Button>)}</nav>
    {!companyId && !isDiscovery && !isProducts && <div className="flex flex-wrap items-end gap-3">
      <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar no CRM" placeholder="Buscar empresa, CNPJ ou contato" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
      <Select value={unitFilter} onValueChange={setUnitFilter}><SelectTrigger className="w-full sm:w-52" aria-label="Filtrar unidade"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem>{unitOptions.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent></Select>
      {!isAgenda && !isPipeline && !isOrders && !isClients && <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-44" aria-label="Filtrar situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem>{leadStates.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>}
      {isAgenda && <><div><Label htmlFor="crm-from">De</Label><Input id="crm-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div><div><Label htmlFor="crm-to">Até</Label><Input id="crm-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div></>}
    </div>}
    {isProducts ? <CrmProducts /> : isOrders ? <CrmOrders companies={companies.data} unitFilter={unitFilter} search={search} /> : isDiscovery ? <CompanyDiscovery companies={companies.data} unitOptions={unitOptions} create={companies.create} /> : companyId ? loading ? <p>Carregando empresa…</p> : !company ? <p className="text-muted-foreground">Empresa não encontrada ou sem permissão de acesso.</p> : <>
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold">{company.name}</h2><p className="text-sm text-muted-foreground">{unitName(company.unit_id)} · {company.segment || 'Sem segmento'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => openEditor('company', company)}>Editar empresa</Button><Button variant="outline" onClick={() => void companies.update(company.id, { do_not_contact: !company.do_not_contact })}>{company.do_not_contact ? 'Permitir contato' : 'Não contatar'}</Button></div></div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">{[['CNPJ',company.document],['Telefone',company.phone],['E-mail',company.email],['Endereço',company.address],['Origem',company.source],['Observações',company.notes]].map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value || '—'}</dd></div>)}</dl>
      {company.do_not_contact && <Badge variant="destructive">Não contatar</Badge>}
      <CrudTable title="Contatos" hasActive={false} columns={[{ key: 'name', label: 'Nome' }, { key: 'position', label: 'Cargo' }, { key: 'phone', label: 'Telefone' }, { key: 'email', label: 'E-mail' }]} data={contacts.data.filter(c => c.company_id === company.id && c.active)} loading={contacts.loading} onAdd={() => openEditor('contact')} onEdit={c => openEditor('contact', c)} onDelete={id => archive('contact', id)} />
      <CrudTable title="Oportunidades" hasActive={false} columns={[{ key: 'title', label: 'Oportunidade' }, { key: 'stage', label: 'Etapa', render: (v: string) => stages[v] }, { key: 'estimated_value', label: 'Valor estimado', render: (v: number) => money(v) }, { key: 'event_date', label: 'Evento', render: (v: string) => dateLabel(v) }]} data={visibleOpportunities} loading={opportunities.loading} onAdd={() => openEditor('opportunity')} onEdit={o => openEditor('opportunity', o)} onDelete={id => archive('opportunity', id)} />
      <CrudTable title="Histórico e próximas ações" hasActive={false} columns={activityColumns} data={visibleActivities} loading={activities.loading} onAdd={() => openEditor('activity')} onEdit={a => openEditor('activity', a)} onDelete={id => archive('activity', id)} />
    </> : isAgenda ? <>
      <div className="flex flex-wrap justify-between items-center gap-2"><h2 className="font-heading text-lg font-semibold">Próximos eventos</h2><Button variant="outline" asChild><Link to="/crm/funil">Abrir funil <ChevronRight className="ml-1 h-4 w-4" /></Link></Button></div>
      <div className="divide-y divide-border">{visibleOpportunities.filter(o => o.event_date && o.stage !== 'perdida' && (!fromDate || o.event_date >= fromDate) && (!toDate || o.event_date <= toDate)).sort((a,b) => (a.event_date ?? '').localeCompare(b.event_date ?? '')).map(o => <div key={o.id} className="flex flex-wrap justify-between gap-2 py-3"><Link to={`/crm/empresas/${o.company_id}`} className="font-medium text-primary">{o.title} · {companyName(o.company_id)}</Link><span className="text-sm text-muted-foreground">{dateLabel(o.event_date)} {o.event_time}</span></div>)}{!visibleOpportunities.some(o => o.event_date && o.stage !== 'perdida' && (!fromDate || o.event_date >= fromDate) && (!toDate || o.event_date <= toDate)) && <p className="text-muted-foreground py-3">Nenhum evento no período.</p>}</div>
      <CrudTable title="Minha agenda" columns={activityColumns} data={visibleActivities} loading={loading} hasActive={false} onAdd={() => openEditor('activity')} onEdit={a => openEditor('activity', a)} onDelete={id => archive('activity', id)} />
    </> : isPipeline ? <>
      <div className="flex flex-wrap justify-between items-center gap-2"><h2 className="font-heading text-lg font-semibold">Funil de oportunidades</h2><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/crm/buscar"><Search className="h-4 w-4 mr-1" />Buscar empresas</Link></Button><Button onClick={() => openEditor('opportunity')} size="sm"><Plus className="h-4 w-4 mr-1" />Nova oportunidade</Button></div></div>
      {loading ? <p>Carregando oportunidades…</p> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{CRM_STAGES.map(stage => <section key={stage} className="min-w-0 border-t-2 border-primary pt-3"><div className="flex justify-between mb-3"><h3 className="font-heading font-medium text-sm">{stages[stage]}</h3><Badge variant="secondary">{visibleOpportunities.filter(o => o.stage === stage).length}</Badge></div><div className="space-y-3">{visibleOpportunities.filter(o => o.stage === stage).map(o => <article key={o.id} className="border border-border rounded-lg p-3 space-y-2 bg-card"><Link to={`/crm/empresas/${o.company_id}`} className="text-sm text-primary">{companyName(o.company_id)}</Link><h4 className="font-medium break-words">{o.title}</h4><p className="text-sm">{money(o.estimated_value)}</p><p className="text-xs text-muted-foreground">{dateLabel(o.event_date)} · {unitName(o.unit_id)}</p><Button size="sm" variant="outline" onClick={() => openEditor('opportunity', o)}>Abrir briefing</Button></article>)}{!visibleOpportunities.some(o => o.stage === stage) && <p className="text-xs text-muted-foreground py-4">Nenhuma oportunidade</p>}</div></section>)}</div>}
    </> : isClients ? <CrudTable title="Clientes" columns={companyColumns} data={companies.data.filter(c => c.active && c.status === 'cliente' && matches(c))} loading={loading} hasActive={false} onAdd={() => openEditor('company')} onEdit={c => openEditor('company', c)} onDelete={id => archive('company', id)} /> : <CrudTable title="Leads e empresas" columns={companyColumns} data={filteredCompanies} loading={loading} hasActive={false} onAdd={() => openEditor('company')} onEdit={c => openEditor('company', c)} onDelete={id => archive('company', id)} />}
    {editor && <CrudDialog open onClose={() => setEditor(null)} title={`${editor.data?.id ? 'Editar' : 'Novo'} ${ {company: isClients ? 'cliente' : 'lead / empresa',contact:'contato',activity:'contato / tarefa',opportunity:'oportunidade e briefing'}[editor.kind]}`} fields={fields} initialData={editor.data} onSave={save} contentClassName="rounded-lg max-w-2xl max-h-[85vh] overflow-y-auto" />}
  </div>;
}