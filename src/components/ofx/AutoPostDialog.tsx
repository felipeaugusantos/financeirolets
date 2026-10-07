import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Zap } from 'lucide-react';
import { EnrichedEntry } from '@/hooks/useOfxImport';
import { OptionList } from '@/components/ofx/OfxRulesPanel';
import { PAYMENT_METHOD_LABELS, suggestPaymentMethod } from '@/lib/paymentMethod';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');

/** Regras de baixo risco: tarifas, antecipações/débito de cartão, telefone, contabilidade etc. */
const SAFE_RULE = /tarifa|antecipacao|stone .*debito|telefone|contabilidade|rentab|sindicato|odonto/;
export function isSafeRule(v: EnrichedEntry): boolean {
  const txt = `${v.ruleLabel ?? ''} ${v.entry.memo ?? ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return SAFE_RULE.test(txt);
}

/** Linha revisada, com os campos possivelmente editados pelo usuário. */
export interface AutoPostItem {
  item: EnrichedEntry;
  categoryId: string | null;
  unitId: string | null;
  frontId: string | null;
  paymentMethod: string | null;
  /** true = mantém o rateio da regra (unidade não foi trocada manualmente). */
  useRuleAllocations: boolean;
}

interface RowEdit { categoryId: string | null; unitId: string | null; frontId: string | null; paymentMethod: string | null; unitTouched: boolean }

export interface AutoPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linhas a revisar (selecionadas, ou as classificadas por regra). */
  items: EnrichedEntry[];
  /** Linhas com possível duplicidade: aparecem desmarcadas e com aviso. */
  duplicateIds: Set<string>;
  options: OptionList;
  busy?: boolean;
  onConfirm: (items: AutoPostItem[]) => void | Promise<void>;
}

const NONE = '';

function Sel({ value, onChange, list, placeholder }: {
  value: string | null; onChange: (v: string | null) => void;
  list: { id: string; name: string }[]; placeholder: string;
}) {
  return (
    <select
      value={value ?? NONE}
      onChange={e => onChange(e.target.value || null)}
      className="w-full min-w-[120px] rounded-md border bg-background px-1.5 py-1 text-xs"
    >
      <option value={NONE}>{placeholder}</option>
      {list.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

/**
 * Revisão final antes de lançar as linhas do extrato. Categoria, unidade, frente e
 * forma de pagamento podem ser ajustadas linha a linha. Nada é criado sem esta conferência.
 */
export default function AutoPostDialog({
  open, onOpenChange, items, duplicateIds, options, busy, onConfirm,
}: AutoPostDialogProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  // Ao abrir: regras de baixo risco vêm marcadas; duplicidades e demais, desmarcadas.
  useEffect(() => {
    if (!open) return;
    setChecked(new Set(items.filter(v => isSafeRule(v) && !duplicateIds.has(v.entry.id)).map(v => v.entry.id)));
    const e: Record<string, RowEdit> = {};
    for (const v of items) {
      e[v.entry.id] = {
        categoryId: v.ruleCategoryId,
        unitId: v.ruleUnitId,
        frontId: v.ruleFrontId,
        paymentMethod: suggestPaymentMethod(v.entry.memo),
        unitTouched: false,
      };
    }
    setEdits(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dupCount = useMemo(() => items.filter(v => duplicateIds.has(v.entry.id)).length, [items, duplicateIds]);

  const name = (list: { id: string; name: string }[], id: string | null) =>
    (id && list.find(o => o.id === id)?.name) || '—';

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  /** Linhas que "Marcar todas" seleciona: as com possível duplicidade ficam de fora e só entram marcadas à mão. */
  const selectable = useMemo(() => items.filter(v => !duplicateIds.has(v.entry.id)), [items, duplicateIds]);
  const allSelected = selectable.length > 0 && selectable.every(v => checked.has(v.entry.id));
  const selectAll = () => setChecked(new Set(selectable.map(v => v.entry.id)));
  const clearAll = () => setChecked(new Set());
  const patch = (id: string, p: Partial<RowEdit>) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const selection = items.filter(v => checked.has(v.entry.id));
  const missingCat = selection.filter(v => !edits[v.entry.id]?.categoryId).length;
  const total = selection.reduce((s, v) => s + Number(v.entry.amount), 0);
  const pmList = Object.entries(PAYMENT_METHOD_LABELS).map(([id, n]) => ({ id, name: n }));

  const confirm = () => onConfirm(selection.map(v => {
    const e = edits[v.entry.id];
    const keepAlloc = !e.unitTouched && (v.ruleAllocations?.length ?? 0) > 0;
    return {
      item: v,
      categoryId: e.categoryId,
      unitId: e.unitId,
      frontId: e.frontId,
      paymentMethod: e.paymentMethod,
      useRuleAllocations: keepAlloc,
    };
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-7xl">
        <DialogHeader>
          <DialogTitle>Lançar linhas do extrato</DialogTitle>
          <DialogDescription>
            Cada linha marcada vira um lançamento já conciliado. Ajuste categoria, unidade,
            frente e forma de pagamento antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {dupCount > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {dupCount} linha(s) com possível lançamento já existente estão desmarcadas e
              sinalizadas. Confira antes de marcar.
            </AlertDescription>
          </Alert>
        )}

        <div className="max-h-[60vh] overflow-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left">
                <th className="p-2 w-8">
                  <Checkbox
                    aria-label="Marcar ou desmarcar todas"
                    checked={allSelected ? true : checked.size > 0 ? 'indeterminate' : false}
                    onCheckedChange={() => (allSelected ? clearAll() : selectAll())}
                  />
                </th>
                <th className="p-2">Data</th>
                <th className="p-2">Descrição</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2">Regra</th>
                <th className="p-2">Categoria</th>
                <th className="p-2">Unidade</th>
                <th className="p-2">Frente</th>
                <th className="p-2">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {items.map(v => {
                const e = edits[v.entry.id];
                if (!e) return null;
                const alloc = v.ruleAllocations ?? [];
                const dup = duplicateIds.has(v.entry.id);
                return (
                  <tr key={v.entry.id} className={`border-t align-top ${dup ? 'bg-amber-500/5' : ''}`}>
                    <td className="p-2">
                      <Checkbox checked={checked.has(v.entry.id)} onCheckedChange={() => toggle(v.entry.id)} />
                    </td>
                    <td className="p-2 whitespace-nowrap">{br(v.entry.posted_at)}</td>
                    <td className="p-2 min-w-[220px] whitespace-normal break-words">
                      {v.entry.memo}
                      {dup && <Badge variant="outline" className="ml-1 rounded-lg text-[10px]">possível duplicidade</Badge>}
                    </td>
                    <td className={`p-2 text-right whitespace-nowrap ${v.entry.amount < 0 ? 'text-destructive' : ''}`}>
                      {brl(v.entry.amount)}
                    </td>
                    <td className="p-2 min-w-[120px] whitespace-normal break-words">
                      {v.ruleLabel ? <span className="font-medium">{v.ruleLabel}</span> : <span className="text-muted-foreground">sem regra</span>}
                    </td>
                    <td className="p-2">
                      <Sel value={e.categoryId} onChange={x => patch(v.entry.id, { categoryId: x })}
                        list={options.categories} placeholder="Escolha…" />
                    </td>
                    <td className="p-2">
                      <Sel value={e.unitId} onChange={x => patch(v.entry.id, { unitId: x, unitTouched: true })}
                        list={options.units} placeholder={alloc.length && !e.unitTouched ? 'Rateio da regra' : '—'} />
                      {alloc.length > 0 && !e.unitTouched && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {alloc.map(a => `${name(options.units, a.unit_id)} ${a.value}%`).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="p-2">
                      <Sel value={e.frontId} onChange={x => patch(v.entry.id, { frontId: x })}
                        list={options.fronts} placeholder="—" />
                    </td>
                    <td className="p-2">
                      <Sel value={e.paymentMethod} onChange={x => patch(v.entry.id, { paymentMethod: x })}
                        list={pmList} placeholder="—" />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                  Nenhuma linha para lançar.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" disabled={busy || selectable.length === 0} onClick={selectAll}
              title={dupCount > 0 ? 'Linhas com possível duplicidade não entram: marque-as uma a uma, se for o caso.' : undefined}>
              Marcar todas{dupCount > 0 ? ` (exceto ${dupCount} duplicidade(s))` : ''}
            </Button>
            <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" disabled={busy || checked.size === 0} onClick={clearAll}>
              Desmarcar todas
            </Button>
            <span className="text-xs text-muted-foreground">
              {selection.length} de {items.length} linha(s) — total {brl(total)}
              {missingCat > 0 && <span className="text-destructive"> · {missingCat} sem categoria</span>}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              className="gap-2 rounded-xl"
              disabled={selection.length === 0 || missingCat > 0 || busy}
              onClick={confirm}
            >
              <Zap className="h-4 w-4" />
              {busy ? 'Lançando...' : `Lançar ${selection.length} linha(s)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
