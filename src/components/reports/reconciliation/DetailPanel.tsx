import { BucketDetail } from '@/hooks/useReconciliation';
import { Badge } from '@/components/ui/badge';
import { Tag, Layers } from 'lucide-react';
import { fmt, fmtDate } from './format';
import { FixActions, FixApi, FixKind, Lookups } from './FixActions';

export function DetailPanel({
  detail, kind, side, lookups, api,
}: {
  detail: Pick<BucketDetail, 'count' | 'items' | 'byCategory' | 'byFront'>;
  kind?: FixKind;
  side?: 'receita' | 'despesa';
  lookups?: Lookups;
  api?: FixApi;
}) {
  const d = detail;
  if (!d || d.count === 0) {
    return <p className="text-xs text-muted-foreground p-3">Sem lançamentos nesta diferença.</p>;
  }
  const showActions = !!(kind && side && lookups && api);
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
                {showActions && <th className="text-right p-2">Ações</th>}
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
                  {showActions && (
                    <td className="p-2 text-right">
                      <FixActions item={it} kind={kind!} side={side!} lookups={lookups!} api={api!} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
