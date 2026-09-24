import { Plus, Trash2, Equal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { evenSplit, splitTotal, type SplitLine } from '@/lib/categorySplits';
import { cn } from '@/lib/utils';

interface Props {
  value: SplitLine[];
  onChange: (v: SplitLine[]) => void;
  units: { id: string; name: string }[];
}

/** Editor de divisão entre unidades em %, com total visível e botão "dividir igualmente". */
export default function SplitEditor({ value, onChange, units }: Props) {
  const total = splitTotal(value);
  const ok = Math.abs(total - 100) < 0.01;
  const set = (i: number, patch: Partial<SplitLine>) =>
    onChange(value.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={l.unit_id || undefined} onValueChange={v => set(i, { unit_id: v })}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              {units.map(u => (
                <SelectItem key={u.id} value={u.id} disabled={value.some((x, k) => k !== i && x.unit_id === u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-24">
            <Input
              type="number" inputMode="decimal" min={0} max={100} step="0.01"
              value={Number.isFinite(l.percentage) ? l.percentage : ''}
              onChange={e => set(i, { percentage: Number(e.target.value) })}
              className="pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label="Remover unidade">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onChange([...value, { unit_id: '', percentage: 0 }])}>
          <Plus className="h-4 w-4" /> Unidade
        </Button>
        <Button
          type="button" variant="outline" size="sm" className="gap-1"
          disabled={value.filter(l => l.unit_id).length < 2}
          onClick={() => onChange(evenSplit(value.filter(l => l.unit_id).map(l => l.unit_id)))}
        >
          <Equal className="h-4 w-4" /> Dividir igualmente
        </Button>
        <span className={cn('ml-auto text-sm font-medium', ok ? 'text-secondary' : 'text-destructive')}>
          Total: {total.toLocaleString('pt-BR')}%
        </span>
      </div>
    </div>
  );
}
