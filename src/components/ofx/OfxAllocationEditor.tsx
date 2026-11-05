import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OfxAllocation } from '@/hooks/useOfxImport';

const NONE = '__none__';
export interface OfxSplitRow { unit_id: string | null; front_id: string | null; pct: string }

export function resolveOfxSplit(rows: OfxSplitRow[]) {
  const allocations: OfxAllocation[] = rows.map(r => ({
    unit_id: r.unit_id, front_id: r.front_id,
    allocation_type: 'percentual', value: Number(r.pct.replace(',', '.')),
  }));
  const total = allocations.reduce((sum, a) => sum + a.value, 0);
  const valid = allocations.length > 0 && allocations.every(a =>
    (a.unit_id || a.front_id) && Number.isFinite(a.value) && a.value > 0
  ) && Math.abs(total - 100) < 0.01;
  return { allocations, total, valid };
}

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rows: OfxSplitRow[];
  onRowsChange: (rows: OfxSplitRow[]) => void;
  units: { id: string; name: string }[];
  fronts: { id: string; name: string }[];
}

export default function OfxAllocationEditor({ enabled, onEnabledChange, rows, onRowsChange, units, fronts }: Props) {
  const { total, valid } = resolveOfxSplit(rows);
  const update = (index: number, patch: Partial<OfxSplitRow>) =>
    onRowsChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={enabled} onCheckedChange={v => onEnabledChange(v === true)} />
        Ratear entre unidades e frentes
      </label>
      {enabled && <div className="space-y-2">
        {rows.map((row, index) => <div key={index} className="grid min-w-0 grid-cols-1 gap-2 border-b border-border pb-3 sm:grid-cols-2">
          <Select value={row.unit_id ?? NONE} onValueChange={v => update(index, { unit_id: v === NONE ? null : v })}>
            <SelectTrigger className="h-auto min-h-10 min-w-0 text-left [&>span]:whitespace-normal [&>span]:break-words" aria-label={`Unidade do rateio ${index + 1}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Sem unidade</SelectItem>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={row.front_id ?? NONE} onValueChange={v => update(index, { front_id: v === NONE ? null : v })}>
            <SelectTrigger className="h-auto min-h-10 min-w-0 text-left [&>span]:whitespace-normal [&>span]:break-words" aria-label={`Frente do rateio ${index + 1}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Sem frente</SelectItem>{fronts.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Input className="w-28" inputMode="decimal" placeholder="%" aria-label={`Percentual do rateio ${index + 1}`} value={row.pct} onChange={e => update(index, { pct: e.target.value })} />
            <span className="text-sm text-muted-foreground">%</span>
            <Button size="icon" variant="ghost" className="ml-auto h-10 w-10 shrink-0" title={`Remover rateio ${index + 1}`} aria-label={`Remover rateio ${index + 1}`} onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => onRowsChange([...rows, { unit_id: null, front_id: null, pct: '' }])}><Plus className="h-4 w-4" />Adicionar linha</Button>
          <span className={valid ? 'text-xs text-secondary' : 'text-xs text-destructive'}>Total {Number.isFinite(total) ? total.toFixed(2) : '0.00'}% de 100%</span>
        </div>
      </div>}
    </div>
  );
}