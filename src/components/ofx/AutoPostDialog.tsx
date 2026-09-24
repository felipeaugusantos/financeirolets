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

/** Regras de baixo risco: tarifas, antecipações/débito de cartão, telefone, contabilidade etc. */
const SAFE_RULE = /tarifa|antecipacao|stone .*debito|telefone|contabilidade|rentab|sindicato|odonto/;
export function isSafeRule(v: EnrichedEntry): boolean {
  const txt = `${(v as any).ruleLabel ?? ''} ${v.entry.memo ?? ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return SAFE_RULE.test(txt);
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');

export interface AutoPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linhas pendentes que uma regra classificou (categoria definida). */
  items: EnrichedEntry[];
  /** Linhas cuja descrição já existe em algum lançamento do período. */
  duplicateIds: Set<string>;
  options: OptionList;
  busy?: boolean;
  onConfirm: (items: EnrichedEntry[]) => void | Promise<void>;
}

/**
 * Revisão final antes de lançar automaticamente todas as linhas do extrato que
 * as regras de conciliação já classificaram. Nada é criado sem esta conferência.
 */
export default function AutoPostDialog({
  open, onOpenChange, items, duplicateIds, options, busy, onConfirm,
}: AutoPostDialogProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const eligible = useMemo(
    () => items.filter(v => !duplicateIds.has(v.entry.id)),
    [items, duplicateIds],
  );
  const skipped = useMemo(
    () => items.filter(v => duplicateIds.has(v.entry.id)),
    [items, duplicateIds],
  );

  useEffect(() => {
    if (open) setChecked(new Set(eligible.filter(isSafeRule).map(v => v.entry.id)));
  }, [open, eligible]);

  const name = (list: { id: string; name: string }[], id: string | null) =>
    (id && list.find(o => o.id === id)?.name) || '—';

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selection = eligible.filter(v => checked.has(v.entry.id));
  const total = selection.reduce((s, v) => s + Number(v.entry.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Lançar automaticamente pelas regras</DialogTitle>
          <DialogDescription>
            Cada linha vira um lançamento com a categoria, unidade, frente, rateio e
            forma de pagamento sugeridos pela regra, e já fica conciliada.
          </DialogDescription>
        </DialogHeader>

        {skipped.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {skipped.length} linha(s) fora da lista: já existe lançamento com a
              mesma descrição no período. Confira manualmente se for necessário.
            </AlertDescription>
          </Alert>
        )}

        <div className="max-h-[52vh] overflow-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60">
              <tr className="text-left">
                <th className="p-2 w-8"></th>
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
              {eligible.map(v => {
                const pm = suggestPaymentMethod(v.entry.memo);
                const alloc = v.ruleAllocations ?? [];
                return (
                  <tr key={v.entry.id} className="border-t align-top">
                    <td className="p-2">
                      <Checkbox
                        checked={checked.has(v.entry.id)}
                        onCheckedChange={() => toggle(v.entry.id)}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">{br(v.entry.posted_at)}</td>
                    <td className="p-2 max-w-[240px] truncate" title={v.entry.memo ?? ''}>
                      {v.entry.memo}
                    </td>
                    <td className={`p-2 text-right whitespace-nowrap ${v.entry.amount < 0 ? 'text-destructive' : ''}`}>
                      {brl(v.entry.amount)}
                    </td>
                    <td className="p-2 max-w-[140px] truncate" title={v.ruleLabel ?? ''}>
                      <Badge variant="outline" className="rounded-lg">{v.ruleLabel}</Badge>
                    </td>
                    <td className="p-2">{name(options.categories as any, v.ruleCategoryId)}</td>
                    <td className="p-2">
                      {alloc.length > 0
                        ? alloc.map(a => `${name(options.units as any, a.unit_id)} ${a.value}%`).join(' · ')
                        : name(options.units as any, v.ruleUnitId)}
                    </td>
                    <td className="p-2">{name(options.fronts as any, v.ruleFrontId)}</td>
                    <td className="p-2">{pm ? PAYMENT_METHOD_LABELS[pm] : '—'}</td>
                  </tr>
                );
              })}
              {eligible.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                  Nenhuma linha pendente classificada por regra neste período.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selection.length} de {eligible.length} linha(s) — total {brl(total)}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2 rounded-xl"
              disabled={selection.length === 0 || busy}
              onClick={() => onConfirm(selection)}
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
