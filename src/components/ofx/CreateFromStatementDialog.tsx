import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { suggestRulePattern } from '@/lib/ruleFromEntry';
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
  /** Recebe o termo da regra a salvar, ou null quando o operador não pediu regra. */
  onConfirm: (rulePattern: string | null) => void;
  /** Mostra a opção de salvar regra (só perfis que editam regras). */
  canSaveRule?: boolean;
}

export default function CreateFromStatementDialog({
  createFor, onClose, accountName, duplicateIds, options, form, onFormChange, split, onSplitChange,
  splitRows, onSplitRowsChange, manualSplitValid, busy, onConfirm, canSaveRule = false,
}: Props) {
  const [saveRule, setSaveRule] = useState(false);
  const [pattern, setPattern] = useState('');
  useEffect(() => {
    setSaveRule(false);
    setPattern(suggestRulePattern(createFor?.entry.memo));
  }, [createFor]);
  const ruleInvalid = saveRule && (pattern.trim().length < 3 || !form.category_id);
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
            {canSaveRule && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={saveRule} onCheckedChange={v => setSaveRule(v === true)} aria-label="Salvar como regra" />
                  Salvar como regra para os próximos extratos
                </label>
                {saveRule && (
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-pattern">Quando o texto do extrato contiver</Label>
                    <Input id="rule-pattern" value={pattern} onChange={ev => setPattern(ev.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      {!form.category_id
                        ? 'Escolha a categoria para salvar a regra.'
                        : pattern.trim().length < 3
                          ? 'Use pelo menos 3 letras.'
                          : `Vale só para ${createFor.entry.amount >= 0 ? 'entradas' : 'saídas'} desta conta, com a categoria, unidade${split ? ', rateio' : ''} e parceiro escolhidos. As outras linhas pendentes são reclassificadas na hora.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button onClick={() => onConfirm(saveRule ? pattern.trim() : null)} disabled={busy || ruleInvalid || (split && !manualSplitValid)}>Criar e vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
