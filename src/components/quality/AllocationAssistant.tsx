import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AllocationDraft } from '@/hooks/useReviewActions';

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface AllocationTarget {
  id: string;
  description: string;
  total: number;
  competence_date: string;
  currentUnits: string[];
}

/**
 * Rateio ASSISTIDO: o usuário define percentuais ou valores por unidade.
 * Não divide igualmente por conta própria e não grava nada sem confirmação.
 */
const NO_FRONT = '__none__';

export default function AllocationAssistant({
  target,
  units,
  fronts = [],
  busy,
  onClose,
  onSave,
}: {
  target: AllocationTarget | null;
  units: { id: string; name: string }[];
  fronts?: { id: string; name: string }[];
  busy?: boolean;
  onClose: () => void;
  onSave: (id: string, rows: AllocationDraft[]) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'percentual' | 'valor'>('percentual');
  const [rows, setRows] = useState<{ unit_id: string; front_id: string; v: string }[]>([
    { unit_id: '', front_id: NO_FRONT, v: '' },
  ]);

  const total = target?.total || 0;
  const sum = useMemo(
    () => rows.reduce((s, r) => s + (parseFloat(r.v.replace(',', '.')) || 0), 0),
    [rows]
  );
  const expected = mode === 'percentual' ? 100 : total;
  const valid =
    rows.length > 0 &&
    rows.every((r) => r.unit_id) &&
    Math.abs(sum - expected) < 0.01 &&
    new Set(rows.map((r) => `${r.unit_id}|${r.front_id}`)).size === rows.length;

  if (!target) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Rateio assistido</DialogTitle>
          <DialogDescription>
            Distribua o valor deste lançamento entre unidades. O valor, a data e a conta não mudam.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border p-3 space-y-1 text-sm">
          <p className="font-medium">{target.description}</p>
          <p className="text-xs text-muted-foreground">
            Valor original <strong>{fmt(total)}</strong> • {target.competence_date.split('-').reverse().join('/')}
          </p>
          {target.currentUnits.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Unidades envolvidas hoje: {target.currentUnits.join(', ')}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Tipo de rateio</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual">Percentual (%)</SelectItem>
                <SelectItem value="valor">Valor (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={r.unit_id}
                onValueChange={(v) => setRows((p) => p.map((x, j) => (j === i ? { ...x, unit_id: v } : x)))}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={r.front_id}
                onValueChange={(v) => setRows((p) => p.map((x, j) => (j === i ? { ...x, front_id: v } : x)))}
              >
                <SelectTrigger className="flex-1"><SelectValue placeholder="Frente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FRONT}>Sem frente</SelectItem>
                  {fronts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-32"
                inputMode="decimal"
                placeholder={mode === 'percentual' ? '%' : 'R$'}
                value={r.v}
                onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
              />
              <Button variant="ghost" size="icon" onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRows((p) => [...p, { unit_id: '', front_id: NO_FRONT, v: '' }])}>
            <Plus className="h-4 w-4" /> Adicionar unidade
          </Button>
        </div>

        <Alert variant={valid ? 'default' : 'destructive'}>
          <AlertDescription className="text-xs">
            Total distribuído: {mode === 'percentual' ? `${sum.toFixed(2)}%` : fmt(sum)} de{' '}
            {mode === 'percentual' ? '100%' : fmt(total)}.{' '}
            {valid ? 'Pronto para salvar.' : 'A soma precisa fechar exatamente para salvar.'}
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button
            disabled={!valid || busy}
            onClick={async () => {
              const ok = await onSave(
                target.id,
                rows.map((r) => ({
                  unit_id: r.unit_id,
                  front_id: r.front_id === NO_FRONT ? null : r.front_id,
                  allocation_type: mode,
                  percentage: mode === 'percentual' ? parseFloat(r.v.replace(',', '.')) : null,
                  amount: mode === 'valor' ? parseFloat(r.v.replace(',', '.')) : null,
                }))
              );
              if (ok) onClose();
            }}
          >
            Salvar rateio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
