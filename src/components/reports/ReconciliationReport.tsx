import { Fragment, ReactNode, useEffect, useState } from 'react';
import { useReconciliation, ReconciliationFilters, BucketKey, SideData, ChecklistItem, FlagKey, Severity } from '@/hooks/useReconciliation';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, GitCompare, Loader2, Info, ChevronDown, ChevronRight, Tag, Layers, MessageCircle, Sparkles, CheckCircle2, AlertTriangle, XCircle, ListChecks } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null) => d ? d.split('-').reverse().join('/') : '—';

const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

interface RuleSpec {
  key: BucketKey | 'dashboard' | 'dreCompetenciaFull' | 'dreCompetenciaRealizado' | 'dreCaixa';
  label: string;
  rule: string;
  formula: string;
  getValue: (s: SideData) => number;
  getCount?: (s: SideData) => number | undefined;
  plain: (s: SideData, kind: 'receita' | 'despesa') => ReactNode;
}

const RULES: RuleSpec[] = [
  {
    key: 'dashboard',
    label: 'Dashboard (realizado no período)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pago, recebido}',
    formula: 'Σ net_amount onde competência cai no período e já foi liquidado',
    getValue: (s) => s.dashboard,
    plain: (s, kind) => (
      <>
        Tudo que de fato {kind === 'receita' ? 'entrou' : 'saiu'} neste período <em>e</em> cuja data de competência também cai aqui.
        São <B>{fmt(s.dashboard)}</B> — é exatamente o número que aparece no <B>Dashboard</B> para {kind === 'receita' ? 'receitas' : 'despesas'}.
      </>
    ),
  },
  {
    key: 'provisionado',
    label: 'Provisionado (delta Dashboard → DRE Competência cheio)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pendente, agendado}',
    formula: 'DRE Competência (cheio) − Dashboard',
    getValue: (s) => s.provisionado,
    getCount: (s) => s.details.provisionado.count,
    plain: (s, kind) => (
      <>
        São <B>{s.details.provisionado.count}</B> {kind === 'receita' ? 'recebimentos' : 'pagamentos'} previstos para este período
        somando <B>{fmt(s.provisionado)}</B> que ainda <em>não</em> foram {kind === 'receita' ? 'recebidos' : 'pagos'}.
        O <B>Dashboard ignora</B> (só conta o realizado); o <B>DRE Competência cheio</B> inclui.
      </>
    ),
  },
  {
    key: 'dreCompetenciaFull',
    label: 'DRE Competência (cheio)',
    rule: 'competence_date ∈ [início, fim]  (qualquer status ≠ cancelado)',
    formula: 'Dashboard + Provisionado',
    getValue: (s) => s.dreCompetenciaFull,
    plain: (s) => (
      <>
        Soma tudo que <em>pertence</em> ao período pela data de competência, esteja pago ou não.
        Dá <B>{fmt(s.dreCompetenciaFull)}</B> = Dashboard (<B>{fmt(s.dashboard)}</B>) + Provisionado (<B>{fmt(s.provisionado)}</B>).
      </>
    ),
  },
  {
    key: 'dreCompetenciaRealizado',
    label: 'DRE Competência (somente realizado)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pago, recebido}',
    formula: 'Idêntico ao Dashboard',
    getValue: (s) => s.dreCompetenciaRealizado,
    plain: (s) => (
      <>
        Mesma lógica do Dashboard: ignora o provisionado e só conta o que já entrou/saiu.
        Por isso bate exatamente: <B>{fmt(s.dreCompetenciaRealizado)}</B>.
      </>
    ),
  },
  {
    key: 'pagoDePeriodoAnterior',
    label: 'Pagos no período de competência anterior (entram no caixa)',
    rule: 'payment_date ∈ [início, fim]  E  status ∈ {pago, recebido}  E  competence_date ∉ [início, fim]',
    formula: '+ no DRE Caixa',
    getValue: (s) => s.pagoDePeriodoAnterior,
    getCount: (s) => s.details.pagoDePeriodoAnterior.count,
    plain: (s, kind) => (
      <>
        <B>{s.details.pagoDePeriodoAnterior.count}</B> {kind === 'receita' ? 'recebimentos' : 'pagamentos'} de <B>{fmt(s.pagoDePeriodoAnterior)}</B>{' '}
        feitos agora, mas referentes a meses <em>anteriores</em>.
        <B> Entram</B> no DRE Caixa deste período, mas <B>não</B> aparecem no DRE por competência.
      </>
    ),
  },
  {
    key: 'pagoForaDaCompetencia',
    label: 'Competência no período mas pagos fora (saem do caixa)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pago, recebido}  E  payment_date ∉ [início, fim]',
    formula: '− no DRE Caixa',
    getValue: (s) => s.pagoForaDaCompetencia,
    getCount: (s) => s.details.pagoForaDaCompetencia.count,
    plain: (s) => (
      <>
        <B>{s.details.pagoForaDaCompetencia.count}</B> lançamentos de <B>{fmt(s.pagoForaDaCompetencia)}</B>{' '}
        cuja competência é deste período, mas o pagamento caiu <em>antes ou depois</em>.
        Aparecem no <B>DRE Competência</B>, mas <B>saem</B> do DRE Caixa deste período.
      </>
    ),
  },
  {
    key: 'dreCaixa',
    label: 'DRE Caixa',
    rule: 'payment_date ∈ [início, fim]  E  status ∈ {pago, recebido}',
    formula: 'Dashboard + Pagos de período anterior − Pagos fora da competência',
    getValue: (s) => s.dreCaixa,
    plain: (s) => (
      <>
        Só olha a data de pagamento — quem movimentou conta dentro do período.
        <B> {fmt(s.dreCaixa)}</B> = Dashboard (<B>{fmt(s.dashboard)}</B>) + pagos de antes (<B>{fmt(s.pagoDePeriodoAnterior)}</B>) − pagos fora (<B>{fmt(s.pagoForaDaCompetencia)}</B>).
      </>
    ),
  },
];

function RulesBreakdown({ title, side, color, kind }: { title: string; side: SideData; color: 'success' | 'destructive'; kind: 'receita' | 'despesa' }) {
  const identityCompetencia = side.dashboard + side.provisionado;
  const identityCaixa = side.dashboard + side.pagoDePeriodoAnterior - side.pagoForaDaCompetencia;
  const okComp = Math.abs(identityCompetencia - side.dreCompetenciaFull) < 0.01;
  const okCaixa = Math.abs(identityCaixa - side.dreCaixa) < 0.01;

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader>
        <CardTitle className={cn('text-base font-heading', color === 'success' ? 'text-success' : 'text-destructive')}>
          {title} — regras aplicadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {RULES.map((r) => {
            const value = r.getValue(side);
            const count = r.getCount?.(side);
            const isTotal = r.key === 'dashboard' || r.key === 'dreCompetenciaFull'
              || r.key === 'dreCompetenciaRealizado' || r.key === 'dreCaixa';
            return (
              <div
                key={r.key}
                className={cn(
                  'rounded-xl border border-border p-3',
                  isTotal ? 'bg-muted/40' : 'bg-card',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-sm', isTotal && 'font-semibold')}>{r.label}</span>
                      {typeof count === 'number' && (
                        <Badge variant="secondary" className="text-[10px]">{count} lanç.</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground/70">Regra: </span>
                        <span className="font-mono">{r.rule}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground/70">Fórmula: </span>
                        {r.formula}
                      </div>
                    </div>
                    <div className="mt-2 rounded-lg bg-primary/5 border border-primary/15 p-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary mb-1">
                        <MessageCircle className="h-3 w-3" /> Em palavras
                      </div>
                      <div className="text-xs leading-relaxed text-foreground/80">
                        {r.plain(side, kind)}
                      </div>
                    </div>
                  </div>
                  <div className={cn('tabular-nums text-sm shrink-0', isTotal && 'font-semibold')}>
                    {fmt(value)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          <div className={cn(
            'rounded-xl border p-2.5 text-xs',
            okComp ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5',
          )}>
            <div className="font-semibold mb-1">Identidade Competência</div>
            <div className="font-mono">
              Dashboard ({fmt(side.dashboard)}) + Provisionado ({fmt(side.provisionado)}) = {fmt(identityCompetencia)}
            </div>
            <div className="font-mono">DRE Competência (cheio) = {fmt(side.dreCompetenciaFull)} {okComp ? '✓' : '✗'}</div>
          </div>
          <div className={cn(
            'rounded-xl border p-2.5 text-xs',
            okCaixa ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5',
          )}>
            <div className="font-semibold mb-1">Identidade Caixa</div>
            <div className="font-mono">
              Dashboard ({fmt(side.dashboard)}) + Pagos ant. ({fmt(side.pagoDePeriodoAnterior)}) − Pagos fora ({fmt(side.pagoForaDaCompetencia)}) = {fmt(identityCaixa)}
            </div>
            <div className="font-mono">DRE Caixa = {fmt(side.dreCaixa)} {okCaixa ? '✓' : '✗'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailPanel({ detail }: { detail: { count: number; items: any[]; byCategory: any[]; byFront: any[] } }) {
  const d = detail;
  if (!d || d.count === 0) {
    return <p className="text-xs text-muted-foreground p-3">Sem lançamentos nesta diferença.</p>;
  }
  return (
    <div className="space-y-3 p-3 bg-muted/20 rounded-xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
            <Tag className="h-3 w-3" /> Por categoria
          </div>
          <div className="space-y-1">
            {d.byCategory.map((g) => (
              <div key={g.name} className="flex items-center justify-between text-xs">
                <span className="truncate">{g.name} <span className="text-muted-foreground">({g.count})</span></span>
                <span className="tabular-nums font-medium">{fmt(g.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
            <Layers className="h-3 w-3" /> Por frente
          </div>
          <div className="space-y-1">
            {d.byFront.map((g) => (
              <div key={g.name} className="flex items-center justify-between text-xs">
                <span className="truncate">{g.name} <span className="text-muted-foreground">({g.count})</span></span>
                <span className="tabular-nums font-medium">{fmt(g.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1.5">Lançamentos ({d.count})</div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="text-left p-2">Descrição</th>
                <th className="text-left p-2">Categoria</th>
                <th className="text-left p-2">Frente</th>
                <th className="text-left p-2">Comp.</th>
                <th className="text-left p-2">Pgto.</th>
                <th className="text-left p-2">Status</th>
                <th className="text-right p-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="p-2">
                    <div className="truncate max-w-[220px]" title={it.description}>{it.description}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{it.id.slice(0, 8)}</div>
                  </td>
                  <td className="p-2 text-muted-foreground">{it.category_name}</td>
                  <td className="p-2 text-muted-foreground">{it.front_name}</td>
                  <td className="p-2">{fmtDate(it.competence_date)}</td>
                  <td className="p-2">{fmtDate(it.payment_date)}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{it.status}</Badge>
                  </td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmt(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Bridge({ title, side, color }: { title: string; side: SideData; color: 'success' | 'destructive' }) {
  return BridgeImpl({ title, side, color });
}

const SEV_STYLES: Record<Severity, { icon: typeof CheckCircle2; border: string; bg: string; text: string; label: string }> = {
  ok:    { icon: CheckCircle2,   border: 'border-success/40',     bg: 'bg-success/5',     text: 'text-success',     label: 'OK' },
  info:  { icon: Info,           border: 'border-primary/40',     bg: 'bg-primary/5',     text: 'text-primary',     label: 'Info' },
  warn:  { icon: AlertTriangle,  border: 'border-amber-500/50',   bg: 'bg-amber-500/5',   text: 'text-amber-600',   label: 'Atenção' },
  error: { icon: XCircle,        border: 'border-destructive/50', bg: 'bg-destructive/5', text: 'text-destructive', label: 'Erro' },
};

function Checklist({ items, data }: { items: ChecklistItem[]; data: { receitas: SideData; despesas: SideData } }) {
  const [onlyAlerts, setOnlyAlerts] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  const counts = items.reduce(
    (acc, it) => ({ ...acc, [it.severity]: (acc[it.severity] || 0) + 1 }),
    { ok: 0, info: 0, warn: 0, error: 0 } as Record<Severity, number>
  );
  const shown = onlyAlerts ? items.filter((i) => i.severity !== 'ok') : items;

  const resolveDetail = (it: ChecklistItem) => {
    if (!it.side) return null;
    const side = it.side === 'receita' ? data.receitas : data.despesas;
    if (it.bucketKey) return side.details[it.bucketKey];
    if (it.flagKey) return side.flags[it.flagKey];
    return null;
  };

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <ListChecks className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">Checklist de conferência</CardTitle>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {counts.error > 0 && <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">{counts.error} erro</Badge>}
              {counts.warn > 0 && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">{counts.warn} atenção</Badge>}
              {counts.info > 0 && <Badge variant="outline" className="text-[10px] text-primary border-primary/40">{counts.info} info</Badge>}
              {counts.ok > 0 && <Badge variant="outline" className="text-[10px] text-success border-success/40">{counts.ok} ok</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Switch checked={onlyAlerts} onCheckedChange={setOnlyAlerts} id="only-alerts" />
          <label htmlFor="only-alerts" className="cursor-pointer text-muted-foreground">Só atenção</label>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {shown.length === 0 && (
          <p className="text-xs text-muted-foreground">Tudo certo — nenhuma divergência encontrada no período.</p>
        )}
        {shown.map((it) => {
          const sty = SEV_STYLES[it.severity];
          const Icon = sty.icon;
          const detail = resolveDetail(it);
          const expandable = !!detail && detail.count > 0;
          const isOpen = !!open[it.id];
          return (
            <div
              key={it.id}
              className={cn('rounded-xl border-l-4 border border-border p-3', sty.border, sty.bg)}
            >
              <div
                className={cn('flex items-start gap-3', expandable && 'cursor-pointer')}
                onClick={expandable ? () => toggle(it.id) : undefined}
              >
                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', sty.text)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{it.title}</span>
                    {typeof it.count === 'number' && (
                      <Badge variant="secondary" className="text-[10px]">{it.count} lanç.</Badge>
                    )}
                    {expandable && (
                      isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                             : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{it.message}</p>
                </div>
                {typeof it.amount === 'number' && (
                  <div className={cn('tabular-nums text-sm font-semibold shrink-0', sty.text)}>
                    {fmt(it.amount)}
                  </div>
                )}
              </div>
              {expandable && isOpen && detail && (
                <div className="mt-2">
                  <DetailPanel detail={detail} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function BridgeImpl({ title, side, color }: { title: string; side: SideData; color: 'success' | 'destructive' }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (i: number) => setOpen((s) => ({ ...s, [i]: !s[i] }));

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader>
        <CardTitle className={cn('text-base font-heading', color === 'success' ? 'text-success' : 'text-destructive')}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableBody>
            {side.rows.map((r, i) => {
              const expandable = !!r.key && (side.details[r.key]?.count ?? 0) > 0;
              const isOpen = !!open[i];
              return (
                <Fragment key={i}>
                  <TableRow
                    className={cn(
                      r.emphasis === 'total' && 'bg-muted/40 font-semibold',
                      expandable && 'cursor-pointer hover:bg-muted/30',
                    )}
                    onClick={expandable ? () => toggle(i) : undefined}
                  >
                    <TableCell className="text-sm">
                      <div className="flex items-start gap-2">
                        {expandable ? (
                          isOpen ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                                 : <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                        ) : <span className="w-3.5" />}
                        <span>{r.label}</span>
                        {expandable && (
                          <Badge variant="secondary" className="text-[10px] ml-1">
                            {side.details[r.key!].count}
                          </Badge>
                        )}
                        {r.hint && (
                          <span title={r.hint} className="cursor-help mt-0.5">
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={cn(
                      'text-right tabular-nums',
                      r.emphasis === 'delta' && (r.value >= 0 ? 'text-emerald-600' : 'text-red-500'),
                      r.emphasis === 'total' && 'font-semibold',
                    )}>
                      {fmt(r.value)}
                    </TableCell>
                  </TableRow>
                  {expandable && isOpen && (
                    <TableRow>
                      <TableCell colSpan={2} className="p-2">
                        <DetailPanel detail={side.details[r.key!]} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function ReconciliationReport({ onBack }: { onBack: () => void }) {
  const { data, loading, generate } = useReconciliation();
  const [units, setUnits] = useState<any[]>([]);
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [filters, setFilters] = useState<ReconciliationFilters>({
    dateFrom: firstOfMonth,
    dateTo: lastOfMonth,
  });
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name').then(({ data }) => {
      setUnits(data ?? []);
    });
  }, []);

  const handleGenerate = async () => {
    await generate(filters);
    setGenerated(true);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <GitCompare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">Reconciliação Dashboard ↔ DRE</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mostra, no período, a ponte entre Dashboard, DRE Competência (cheio e somente realizado) e DRE Caixa.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={filters.unit_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, unit_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {generated && data && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Bridge title="Receitas" side={data.receitas} color="success" />
          <Bridge title="Despesas" side={data.despesas} color="destructive" />
        </div>
      )}

      {generated && data && (
        <Card className="shadow-card rounded-2xl border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-heading">Resumo em uma frase</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-foreground/85 space-y-2">
            <p>
              Neste período seu <B>Dashboard</B> mostra <span className="text-success font-semibold">{fmt(data.receitas.dashboard)}</span> em receitas
              e <span className="text-destructive font-semibold">{fmt(data.despesas.dashboard)}</span> em despesas (já realizadas).
            </p>
            <p>
              O <B>DRE por Competência</B> adiciona o provisionado: <span className="text-success font-semibold">+{fmt(data.receitas.provisionado)}</span> em receitas
              e <span className="text-destructive font-semibold">+{fmt(data.despesas.provisionado)}</span> em despesas,
              chegando a <B>{fmt(data.receitas.dreCompetenciaFull)}</B> / <B>{fmt(data.despesas.dreCompetenciaFull)}</B>.
            </p>
            <p>
              O <B>DRE por Caixa</B> ajusta o Dashboard somando pagos de períodos anteriores
              (<B>+{fmt(data.receitas.pagoDePeriodoAnterior)}</B> / <B>+{fmt(data.despesas.pagoDePeriodoAnterior)}</B>) e tirando os pagos fora
              (<B>−{fmt(data.receitas.pagoForaDaCompetencia)}</B> / <B>−{fmt(data.despesas.pagoForaDaCompetencia)}</B>),
              resultando em <B>{fmt(data.receitas.dreCaixa)}</B> / <B>{fmt(data.despesas.dreCaixa)}</B>.
            </p>
          </CardContent>
        </Card>
      )}

      {generated && data && (
        <div className="grid lg:grid-cols-2 gap-4">
          <RulesBreakdown title="Receitas" side={data.receitas} color="success" kind="receita" />
          <RulesBreakdown title="Despesas" side={data.despesas} color="destructive" kind="despesa" />
        </div>
      )}
    </div>
  );
}