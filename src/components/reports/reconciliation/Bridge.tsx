import { Fragment, useState } from 'react';
import { SideData } from '@/hooks/useReconciliation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Info, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmt } from './format';
import { FixApi, Lookups } from './FixActions';
import { DetailPanel } from './DetailPanel';

export function Bridge({ title, side, color, kind, lookups, api }: { title: string; side: SideData; color: 'success' | 'destructive'; kind: 'receita' | 'despesa'; lookups: Lookups; api: FixApi }) {
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
                        <DetailPanel
                          detail={side.details[r.key!]}
                          kind={r.key}
                          side={kind}
                          lookups={lookups}
                          api={api}
                        />
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
