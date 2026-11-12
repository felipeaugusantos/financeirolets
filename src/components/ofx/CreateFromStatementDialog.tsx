import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EnrichedEntry, TransactionPatch } from '@/hooks/useOfxImport';
import type { OptionList } from '@/components/ofx/OfxRulesPanel';
import OfxAllocationEditor, { type OfxSplitRow } from '@/components/ofx/OfxAllocationEditor';
import { NONE, br, brl } from './ofxFormat';

interface Props {
  createFor: EnrichedEntry | null;
  onClose: () => void;
  accountName?: string;
  duplicateIds: Set<string>;
  options: OptionList;
  form: Partial<TransactionPatch>;
  onFormChange: Dispatch<SetStateAction<Partial<TransactionPatch>>>;
  split: boolean;
  onSplitChange: (enabled: boolean) => void;
  splitRows: OfxSplitRow[];
  onSplitRowsChange: (rows: OfxSplitRow[]) => void;
  manualSplitValid: boolean;
  busy: boolean;
  onConfirm: () => void;
}

export default function CreateFromStatementDialog({
  createFor, onClose, accountName, duplicateIds, options, form, onFormChange, split, onSplitChange,
  splitRows, onSplitRowsChange, manualSplitValid, busy, onConfirm,
}: Props) {
  return (
    <Dialog open={!!createFor} onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0 pr-6"><DialogTitle className="font-heading">Criar lançamento a partir do extrato</DialogTitle></DialogHeader>
        {createFor && (
          <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto pr-2">
            <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-0.5">
              <p><strong>Extrato:</strong> {br(createFor.entry.posted_at)} · {brl(createFor.entry.amount)}</p>
              <p className="text-muted-foreground">{createFor.entry.memo}</p>
              <p className="text-muted-foreground">
                Será criado como <strong>{createFor.entry.amount >= 0 ? 'receita recebida' : 'despesa paga'}</strong> na conta selecionada,
                com data de pagamento igual à do extrato.
              </p>
            </div>
            {duplicateIds.has(createFor.entry.id) && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Já existe um lançamento com esta mesma descrição no período. Confirme se não é duplicidade antes de criar.
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-border p-2">
                <p className="text-muted-foreground">Valor</p>
                <p className="font-medium">{brl(Math.abs(createFor.entry.amount))}</p>
              </div>
              <div className="rounded-xl border border-border p-2">
                <p className="text-muted-foreground">Data</p>
                <p className="font-medium">{br(createFor.entry.posted_at)}</p>
              </div>
              <div className="rounded-xl border border-border p-2">
                <p className="text-muted-foreground">Conta</p>
                <p className="font-medium truncate">{accountName ?? '—'}</p>
              </div>
            </div>
            {createFor.ruleLabel && (
              <p className="text-xs text-muted-foreground">
                Campos pré-preenchidos pela regra de conciliação "<strong>{createFor.ruleLabel}</strong>". Revise e salve.
              </p>
            )}
            {!split && (createFor.ruleAllocations?.length ?? 0) > 0 && (
              <p className="text-xs rounded-lg border border-border bg-muted/50 p-2">
                {form.unit_id
                  ? 'Unidade escolhida: o rateio da regra não será aplicado.'
                  : `Será aplicado o rateio da regra entre ${createFor.ruleAllocations?.map(a => `${options.units.find(u => u.id === a.unit_id)?.name ?? '—'} ${a.value ?? ''}%`).join(', ')}. Escolha uma unidade só se quiser lançar tudo nela.`}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={form.description ?? ''} onChange={ev => onFormChange((f) => ({ ...f, description: ev.target.value }))} />
            </div>
            {([
              ['category_id', 'Categoria', options.categories.filter(c =>
                createFor.entry.amount >= 0 ? c.type === 'receita' : c.type === 'despesa')],
              ['unit_id', 'Unidade', options.units],
              ['front_id', 'Frente de negócio', options.fronts],
              ['partner_id', 'Parceiro', options.partners],
            ] as const).map(([key, label, list]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Select
                  value={(form[key] as string | null | undefined) ?? NONE}
                  disabled={split && (key === 'unit_id' || key === 'front_id')}
                  onValueChange={v => onFormChange((f) => ({ ...f, [key]: v === NONE ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {list.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <OfxAllocationEditor enabled={split} onEnabledChange={onSplitChange}
              rows={splitRows} onRowsChange={onSplitRowsChange}
              units={options.units} fronts={options.fronts} />
          </div>
        )}
        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={busy || (split && !manualSplitValid)}>Criar e vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
