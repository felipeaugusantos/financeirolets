import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Clock, CalendarClock, BarChart3, Info, Building2, CalendarIcon, AlignLeft, Layers, LayoutGrid } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, toLocalISODate, parseDateUTC } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Treemap } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDashboard } from '@/hooks/useDashboard';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { useNavigate } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MAX_BARS = 8;

/** Groups small items into "Outros" so the chart stays readable with many categories. */
function condenseBars(data: Array<{ name: string; value: number }>) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_BARS) return sorted;
  const top = sorted.slice(0, MAX_BARS - 1);
  const rest = sorted.slice(MAX_BARS - 1);
  const restValue = rest.reduce((s, d) => s + d.value, 0);
  return [...top, { name: `Outros (${rest.length})`, value: restValue }];
}

function CategoryBars({
  data, emptyLabel, accent,
}: {
  data: Array<{ name: string; value: number }>;
  emptyLabel: string;
  accent: string;
}) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }
  const items = condenseBars(data);
  const total = items.reduce((s, d) => s + d.value, 0);
  const max = Math.max(...items.map((d) => d.value), 1);
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {items.map((d) => {
        const pct = total > 0 ? (d.value / total) * 100 : 0;
        const width = (d.value / max) * 100;
        return (
          <div key={d.name} className="group">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-card-foreground truncate" title={d.name}>
                {d.name}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {fmt(d.value)} <span className="opacity-60">· {pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${width}%`, background: accent }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type ChartMode = 'bars' | 'stacked' | 'treemap';

function ChartModeToggle({ value, onChange }: { value: ChartMode; onChange: (v: ChartMode) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as ChartMode)}
      className="h-7"
    >
      <ToggleGroupItem value="bars" aria-label="Barras horizontais" className="h-7 w-7 p-0" title="Barras horizontais">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="stacked" aria-label="Barra empilhada" className="h-7 w-7 p-0" title="Barra empilhada">
        <Layers className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="treemap" aria-label="Treemap" className="h-7 w-7 p-0" title="Treemap">
        <LayoutGrid className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function StackedBar({ data, total }: { data: Array<{ name: string; value: number }>; total: number }) {
  return (
    <div className="space-y-3">
      <div className="flex h-8 w-full overflow-hidden rounded-lg border border-border">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={d.name}
              className="h-full transition-all hover:opacity-80"
              style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
              title={`${d.name}: ${fmt(d.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-64 overflow-y-auto pr-1">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-2 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="truncate flex-1" title={d.name}>{d.name}</span>
              <span className="text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TreemapChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const treeData = data.map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length] }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={treeData}
          dataKey="value"
          nameKey="name"
          stroke="hsl(var(--background))"
          content={<TreemapNode />}
        >
          <RTooltip
            formatter={(value: number) => [fmt(value), '']}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

/** Props injetadas pelo Recharts via content={<TreemapNode />}. */
interface TreemapNodeProps { x?: number; y?: number; width?: number; height?: number; name?: string; value?: number; fill?: string }

function TreemapNode(props: TreemapNodeProps) {
  const { x, y, width, height, name, value, fill } = props;
  const showLabel = width > 60 && height > 28;
  const showValue = width > 80 && height > 44;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="hsl(var(--background))" strokeWidth={2} rx={4} />
      {showLabel && (
        <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={600} style={{ pointerEvents: 'none' }}>
          {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7) - 1) + '…' : name}
        </text>
      )}
      {showValue && (
        <text x={x + 6} y={y + 30} fill="#fff" fontSize={10} opacity={0.85} style={{ pointerEvents: 'none' }}>
          {fmt(value)}
        </text>
      )}
    </g>
  );
}

function CategoryChart({
  data, emptyLabel, accent, mode,
}: {
  data: Array<{ name: string; value: number }>;
  emptyLabel: string;
  accent: string;
  mode: ChartMode;
}) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }
  const items = condenseBars(data);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (mode === 'stacked') return <StackedBar data={items} total={total} />;
  if (mode === 'treemap') return <TreemapChart data={items} />;
  return <CategoryBars data={data} emptyLabel={emptyLabel} accent={accent} />;
}

type PeriodPreset = 'current_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'ytd' | 'last_year' | 'custom';

function resolvePeriod(preset: PeriodPreset, custom: { from?: string; to?: string }): { from: string; to: string; label: string; isMonth: boolean } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const ymd = (d: Date) => toLocalISODate(d);
  switch (preset) {
    case 'last_month': {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0);
      return { from: ymd(from), to: ymd(to), label: 'Mês anterior', isMonth: true };
    }
    case 'last_3_months': {
      const from = new Date(y, m - 2, 1);
      const to = new Date(y, m + 1, 0);
      return { from: ymd(from), to: ymd(to), label: 'Últimos 3 meses', isMonth: false };
    }
    case 'last_6_months': {
      const from = new Date(y, m - 5, 1);
      const to = new Date(y, m + 1, 0);
      return { from: ymd(from), to: ymd(to), label: 'Últimos 6 meses', isMonth: false };
    }
    case 'ytd': {
      const from = new Date(y, 0, 1);
      const to = new Date(y, m + 1, 0);
      return { from: ymd(from), to: ymd(to), label: `Ano atual (${y})`, isMonth: false };
    }
    case 'last_year': {
      const from = new Date(y - 1, 0, 1);
      const to = new Date(y - 1, 11, 31);
      return { from: ymd(from), to: ymd(to), label: `Ano anterior (${y - 1})`, isMonth: false };
    }
    case 'custom': {
      const from = custom.from || ymd(new Date(y, m, 1));
      const to = custom.to || ymd(new Date(y, m + 1, 0));
      return { from, to, label: 'Personalizado', isMonth: false };
    }
    case 'current_month':
    default: {
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      return { from: ymd(from), to: ymd(to), label: 'Mês atual', isMonth: true };
    }
  }
}

const PIE_COLORS = [
  'hsl(340, 82%, 52%)',
  'hsl(184, 100%, 39%)',
  'hsl(40, 70%, 50%)',
  'hsl(122, 52%, 33%)',
  'hsl(0, 69%, 50%)',
  'hsl(260, 60%, 55%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)',
];

const chartConfig = {
  receitas: { label: 'Receitas', color: 'hsl(122, 52%, 33%)' },
  despesas: { label: 'Despesas', color: 'hsl(0, 69%, 50%)' },
  receitasProv: { label: 'Receitas provisionadas', color: 'hsl(122, 52%, 33%)' },
  despesasProv: { label: 'Despesas provisionadas', color: 'hsl(0, 69%, 50%)' },
};

export default function Dashboard() {
  const [unitId, setUnitId] = useState<string>('');
  const [frontId, setFrontId] = useState<string>('');
  const [includeProvisioned, setIncludeProvisioned] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('current_month');
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [chartMode, setChartMode] = useState<ChartMode>('bars');

  const { data: units } = useSupabaseCrud<Tables<'units'>>('units');
  const { data: fronts } = useSupabaseCrud<Tables<'business_fronts'>>('business_fronts');

  const period = useMemo(
    () => resolvePeriod(periodPreset, { from: customFrom, to: customTo }),
    [periodPreset, customFrom, customTo]
  );

  const dashFilters = {
    unitId: unitId && unitId !== 'all' ? unitId : undefined,
    frontId: frontId && frontId !== 'all' ? frontId : undefined,
    includeProvisioned,
    period: { from: period.from, to: period.to },
  };

  const { saldoTotal, saldoInicialConfigurado, receitasMes, despesasMes, receitasProvisionadas, despesasProvisionadas, contasAtrasadas, vencendoHoje, overdueBills, dueTodayBills, monthlyData, categoryData, receitaCategoryData, loading, semCategoria, semUnidade, margemContribuicao, variacaoReceita, variacaoDespesa, unitRanking, error, refreshing, reload } = useDashboard(dashFilters);
  const navigate = useNavigate();

  const activeUnits = (units)?.filter((u) => u.active) ?? [];
  const activeFronts = (fronts)?.filter((f) => f.active) ?? [];

  const fmtPct = (v: number | null) => v !== null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '';

  const receitasTotal = receitasMes + (includeProvisioned ? receitasProvisionadas : 0);
  const despesasTotal = despesasMes + (includeProvisioned ? despesasProvisionadas : 0);
  const periodSuffix = period.isMonth ? 'mês' : 'período';
  const variationLabel = period.isMonth ? 'vs mês anterior' : 'vs período anterior';
  const receitasSub = includeProvisioned && receitasProvisionadas > 0
    ? `Realizado ${fmt(receitasMes)} • Prov. ${fmt(receitasProvisionadas)}`
    : (variacaoReceita !== null ? fmtPct(variacaoReceita) + ' ' + variationLabel : '');
  const despesasSub = includeProvisioned && despesasProvisionadas > 0
    ? `Realizado ${fmt(despesasMes)} • Prov. ${fmt(despesasProvisionadas)}`
    : (variacaoDespesa !== null ? fmtPct(variacaoDespesa) + ' ' + variationLabel : '');

  const cards = [
    {
      title: saldoInicialConfigurado ? 'Saldo Total' : 'Movimentação calculada',
      value: fmt(saldoTotal),
      icon: DollarSign,
      color: 'text-secondary',
      sub: saldoInicialConfigurado ? '' : 'Saldo inicial não configurado — não é o saldo bancário',
    },
    { title: `Receitas do ${periodSuffix}`, value: fmt(receitasTotal), icon: TrendingUp, color: 'text-success', sub: receitasSub },
    { title: `Despesas do ${periodSuffix}`, value: fmt(despesasTotal), icon: TrendingDown, color: 'text-destructive', sub: despesasSub },
    { title: 'Margem', value: fmt(margemContribuicao), icon: BarChart3, color: margemContribuicao >= 0 ? 'text-success' : 'text-destructive', sub: '' },
    { title: 'Contas em Atraso', value: String(contasAtrasadas), icon: AlertTriangle, color: contasAtrasadas > 0 ? 'text-warning' : 'text-muted-foreground', sub: '' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral financeira do grupo</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i} className="shadow-card rounded-2xl border-border min-w-0">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" aria-busy={refreshing}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            Visão geral financeira do grupo
            {refreshing && (
              <span className="inline-flex items-center gap-1 text-xs" role="status">
                <Loader2 className="h-3 w-3 animate-spin" /> Atualizando…
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Mês atual</SelectItem>
              <SelectItem value="last_month">Mês anterior</SelectItem>
              <SelectItem value="last_3_months">Últimos 3 meses</SelectItem>
              <SelectItem value="last_6_months">Últimos 6 meses</SelectItem>
              <SelectItem value="ytd">Ano atual (YTD)</SelectItem>
              <SelectItem value="last_year">Ano anterior</SelectItem>
              <SelectItem value="custom">Personalizado…</SelectItem>
            </SelectContent>
          </Select>
          {periodPreset === 'custom' && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-9 text-xs font-normal', !customFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {customFrom ? format(parseDateUTC(customFrom), 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom ? parseDateUTC(customFrom) : undefined} onSelect={(d) => setCustomFrom(d ? format(d, 'yyyy-MM-dd') : undefined)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-9 text-xs font-normal', !customTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {customTo ? format(parseDateUTC(customTo), 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo ? parseDateUTC(customTo) : undefined} onSelect={(d) => setCustomTo(d ? format(d, 'yyyy-MM-dd') : undefined)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </>
          )}
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Todas Unidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Unidades</SelectItem>
              {activeUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={frontId} onValueChange={setFrontId}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Todas Frentes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Frentes</SelectItem>
              {activeFronts.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 h-9">
                  <Switch id="prov" checked={includeProvisioned} onCheckedChange={setIncludeProvisioned} />
                  <Label htmlFor="prov" className="text-xs cursor-pointer whitespace-nowrap">Incluir provisionados</Label>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                Realizado = pagamentos efetivados. Provisionado = lançamentos do mês ainda não pagos (regime de competência).
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => {
              setPeriodPreset('current_month');
              setCustomFrom(undefined);
              setCustomTo(undefined);
              setUnitId('all');
              setFrontId('all');
              setIncludeProvisioned(false);
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              Não foi possível carregar todos os números ({error}). Os valores abaixo podem estar
              desatualizados ou incompletos.
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reload}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 transition-opacity', refreshing && 'opacity-60')}>
        {cards.map((card) => (
          <Card key={card.title} className="shadow-card rounded-2xl border-border min-w-0">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-2">
              <CardTitle className="text-xs font-medium text-muted-foreground truncate">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 shrink-0 ${card.color}`} />
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="text-base sm:text-lg lg:text-2xl font-bold font-heading text-card-foreground break-words tabular-nums leading-tight">
                {card.value}
              </div>
              {card.sub && (
                <p className="text-[10px] text-muted-foreground mt-1 break-words">{card.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Incomplete data alert */}
      {(semCategoria > 0 || semUnidade > 0) && (
        <Alert variant="default" className="border-warning/50 bg-warning/5">
          <Info className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs text-warning">
            {semCategoria > 0 && <span>{semCategoria} lançamento{semCategoria > 1 ? 's' : ''} sem categoria. </span>}
            {semUnidade > 0 && <span>{semUnidade} sem unidade. </span>}
            <span>Esses dados não aparecerão corretamente nos relatórios DRE.</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Alerts */}
      {(overdueBills.length > 0 || dueTodayBills.length > 0) && (
        <div className="space-y-3">
          {dueTodayBills.length > 0 && (
            <Card className="shadow-card rounded-2xl border-warning/50 bg-warning/5 cursor-pointer" onClick={() => navigate('/contas')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarClock className="h-4 w-4 text-warning" />
                  <span className="text-sm font-heading font-semibold text-warning">
                    {dueTodayBills.length} conta{dueTodayBills.length > 1 ? 's' : ''} vencendo hoje
                  </span>
                </div>
                <div className="space-y-1">
                  {dueTodayBills.slice(0, 5).map(b => (
                    <div key={b.id} className="flex items-center justify-between text-xs">
                      <span className="text-card-foreground truncate max-w-[60%]">
                        {b.description} {b.partner_name && <span className="text-muted-foreground">• {b.partner_name}</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] border-warning text-warning">
                          {b.type === 'despesa' ? 'Pagar' : 'Receber'}
                        </Badge>
                        <span className="font-bold font-heading">{fmt(Number(b.net_amount))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {overdueBills.length > 0 && (
            <Card className="shadow-card rounded-2xl border-destructive/50 bg-destructive/5 cursor-pointer" onClick={() => navigate('/contas')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-heading font-semibold text-destructive">
                    {overdueBills.length} conta{overdueBills.length > 1 ? 's' : ''} vencida{overdueBills.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-1">
                  {overdueBills.slice(0, 5).map(b => {
                    const [y, m, d] = b.due_date.split('-');
                    return (
                      <div key={b.id} className="flex items-center justify-between text-xs">
                        <span className="text-card-foreground truncate max-w-[50%]">
                          {b.description} {b.partner_name && <span className="text-muted-foreground">• {b.partner_name}</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{d}/{m}</span>
                          <Badge variant="destructive" className="text-[10px]">
                            {b.type === 'despesa' ? 'Pagar' : 'Receber'}
                          </Badge>
                          <span className="font-bold font-heading">{fmt(Number(b.net_amount))}</span>
                        </div>
                      </div>
                    );
                  })}
                  {overdueBills.length > 5 && (
                    <p className="text-xs text-muted-foreground mt-1">+ {overdueBills.length - 5} outras</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Receitas vs Despesas ({period.label})</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.every(m => m.receitas === 0 && m.despesas === 0) ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma transação paga no período
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-56 w-full">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => fmt(Number(value))} />} />
                  <Bar dataKey="receitas" stackId="r" fill="var(--color-receitas)" radius={includeProvisioned ? [0,0,0,0] : [4,4,0,0]} />
                  {includeProvisioned && (
                    <Bar dataKey="receitasProv" stackId="r" fill="var(--color-receitas)" fillOpacity={0.4} radius={[4,4,0,0]} />
                  )}
                  <Bar dataKey="despesas" stackId="d" fill="var(--color-despesas)" radius={includeProvisioned ? [0,0,0,0] : [4,4,0,0]} />
                  {includeProvisioned && (
                    <Bar dataKey="despesasProv" stackId="d" fill="var(--color-despesas)" fillOpacity={0.4} radius={[4,4,0,0]} />
                  )}
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-heading">Despesas por Categoria ({period.label})</CardTitle>
            <ChartModeToggle value={chartMode} onChange={setChartMode} />
          </CardHeader>
          <CardContent>
            <CategoryChart mode={chartMode} data={categoryData} emptyLabel="Nenhuma despesa paga neste período" accent="hsl(0, 69%, 50%)" />
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-heading">Receitas por Categoria ({period.label})</CardTitle>
            <ChartModeToggle value={chartMode} onChange={setChartMode} />
          </CardHeader>
          <CardContent>
            <CategoryChart mode={chartMode} data={receitaCategoryData} emptyLabel="Nenhuma receita recebida neste período" accent="hsl(122, 52%, 33%)" />
          </CardContent>
        </Card>
      </div>

      {/* Unit Ranking */}
      {unitRanking.length > 0 && (
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Ranking de Despesas por Unidade ({period.label})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unitRanking.map((u, i) => {
                const maxDesp = unitRanking[0]?.despesas || 1;
                const pct = (u.despesas / maxDesp) * 100;
                return (
                  <div key={u.unitId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-card-foreground flex items-center gap-2">
                        <span className="text-muted-foreground w-4 text-right">{i + 1}º</span>
                        {u.unitName}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-destructive font-bold">{fmt(u.despesas)}</span>
                        {u.receitas > 0 && (
                          <span className="text-success text-[10px]">Rec: {fmt(u.receitas)}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-destructive/70 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
