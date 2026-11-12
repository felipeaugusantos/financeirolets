import { useState } from 'react';
import { SideData, ChecklistItem, Severity } from '@/hooks/useReconciliation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, ListChecks } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { fmt } from './format';
import { FixApi, FixKind, Lookups } from './FixActions';
import { DetailPanel } from './DetailPanel';

const SEV_STYLES: Record<Severity, { icon: typeof CheckCircle2; border: string; bg: string; text: string; label: string }> = {
  ok:    { icon: CheckCircle2,   border: 'border-success/40',     bg: 'bg-success/5',     text: 'text-success',     label: 'OK' },
  info:  { icon: Info,           border: 'border-primary/40',     bg: 'bg-primary/5',     text: 'text-primary',     label: 'Info' },
  warn:  { icon: AlertTriangle,  border: 'border-amber-500/50',   bg: 'bg-amber-500/5',   text: 'text-amber-600',   label: 'Atenção' },
  error: { icon: XCircle,        border: 'border-destructive/50', bg: 'bg-destructive/5', text: 'text-destructive', label: 'Erro' },
};

export function Checklist({ items, data, lookups, api }: { items: ChecklistItem[]; data: { receitas: SideData; despesas: SideData }; lookups: Lookups; api: FixApi }) {
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
                  <DetailPanel
                    detail={detail}
                    kind={(it.bucketKey || it.flagKey) as FixKind | undefined}
                    side={it.side}
                    lookups={lookups}
                    api={api}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
