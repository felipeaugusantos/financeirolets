import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PlusCircle, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnrichedEntry, OfxAllocation } from '@/hooks/useOfxImport';
import { OptionList } from '@/components/ofx/OfxRulesPanel';
import { PAYMENT_METHOD_LABELS, suggestPaymentMethod } from '@/lib/paymentMethod';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const NONE = '__none__';
const RULE = '__rule__';
/** Forma de pagamento deduzida do texto de cada linha do extrato. */
const AUTO = '__auto__';

export interface BulkCreatePatch {
  description: string;
  category_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  partner_id: string | null;
  account_id?: string | null;
  payment_method?: string | null;
  allocations?: OfxAllocation[];
}


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linhas pendentes selecionadas para criação em lote. */
  items: EnrichedEntry[];
  /** Ids cuja descrição já existe em lançamentos do período. */
  duplicates: Set<string>;
  options: OptionList;
  accounts: { id: string; name: string }[];
  /** Conta da conciliação (padrão dos lançamentos criados). */
  defaultAccountId: string;
  busy?: boolean;
  onConfirm: (
    payload: { entryId: string; patch: BulkCreatePatch }[],
    /** Quando informado, cria UM lançamento só com o valor total. */
    grouped?: { description: string; competence_date: string },
  ) => void;
}

/**
 * Revisão única para criar vários lançamentos com a MESMA unidade, frente,
 * conta e categoria. Cada linha pode ser desmarcada antes de confirmar; quando
 * o campo fica em "manter regra", vale a sugestão da regra de conciliação.
 */
export default function BulkCreateDialog({
  open, onOpenChange, items, duplicates, options, accounts, defaultAccountId, busy, onConfirm,
}: Props) {
  const [form, setForm] = useState<Record<string, string>>({
    category_id: RULE, unit_id: RULE, front_id: RULE, partner_id: RULE,
  });
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [paymentMethod, setPaymentMethod] = useState<string>(AUTO);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  /** Agrupar as linhas em um único lançamento com o valor total. */
  const [grouped, setGrouped] = useState(false);
  const [groupDescription, setGroupDescription] = useState('');
  /** Rateio percentual por unidade e/ou frente aplicado aos lançamentos criados. */
  const [split, setSplit] = useState(false);
  const [splitRows, setSplitRows] = useState<{ unit_id: string; front_id: string; pct: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({ category_id: RULE, unit_id: RULE, front_id: RULE, partner_id: RULE });
    setAccountId(defaultAccountId);
    setPaymentMethod(AUTO);
    // Duplicidades já vêm desmarcadas — o usuário reativa se quiser.
    setSkipped(new Set(items.filter(i => duplicates.has(i.entry.id)).map(i => i.entry.id)));
    setGrouped(false);
    setGroupDescription('');
    setSplit(false);
    setSplitRows([{ unit_id: NONE, front_id: NONE, pct: '' }]);
  }, [open, defaultAccountId, items, duplicates]);

  const included = useMemo(() => items.filter(i => !skipped.has(i.entry.id)), [items, skipped]);
  const hasReceita = items.some(i => i.entry.amount >= 0);
  const hasDespesa = items.some(i => i.entry.amount < 0);
  const categoryList = options.categories.filter(c =>
    (hasReceita && c.type === 'receita') || (hasDespesa && c.type === 'despesa'));

  const resolve = (item: EnrichedEntry, key: string, ruleValue: string | null | undefined) => {
    const v = form[key];
    if (v === RULE) return ruleValue ?? null;
    if (v === NONE) return null;
    return v;
  };

  const splitSum = splitRows.reduce((s, r) => s + (parseFloat(r.pct.replace(',', '.')) || 0), 0);
  const splitValid = !split || (
    splitRows.length > 0 &&
    splitRows.every(r => r.unit_id !== NONE || r.front_id !== NONE) &&
    Math.abs(splitSum - 100) < 0.01
  );
  const allocations: OfxAllocation[] | undefined = split && splitValid
    ? splitRows.map(r => ({
        unit_id: r.unit_id === NONE ? null : r.unit_id,
        front_id: r.front_id === NONE ? null : r.front_id,
        allocation_type: 'percentual' as const,
        value: parseFloat(r.pct.replace(',', '.')) || 0,
      }))
    : undefined;

  const methodFor = (item: EnrichedEntry) => {
    if (paymentMethod === AUTO) return suggestPaymentMethod(item.entry.memo);
    if (paymentMethod === NONE) return null;
    return paymentMethod;
  };


  const total = included.reduce((s, i) => s + Number(i.entry.amount), 0);
  const groupDate = included.map(i => i.entry.posted_at).sort().slice(-1)[0] ?? '';

  const confirm = () => {
    if (grouped) {
      onConfirm(
        included.map(item => ({
          entryId: item.entry.id,
          patch: {
            description: groupDescription.trim() || 'Lançamento agrupado do extrato',
            category_id: resolve(item, 'category_id', item.ruleCategoryId),
            unit_id: resolve(item, 'unit_id', item.ruleUnitId),
            front_id: resolve(item, 'front_id', item.ruleFrontId),
            partner_id: resolve(item, 'partner_id', item.rulePartnerId),
            account_id: accountId || null,
            payment_method: methodFor(item),
            allocations,
          },
        })),
        {
          description: groupDescription.trim() || 'Lançamento agrupado do extrato',
          competence_date: groupDate,
        },
      );
      return;
    }
    onConfirm(included.map(item => ({
      entryId: item.entry.id,
      patch: {
        description: item.entry.memo || 'Lançamento do extrato',
        category_id: resolve(item, 'category_id', item.ruleCategoryId),
        unit_id: resolve(item, 'unit_id', item.ruleUnitId),
        front_id: resolve(item, 'front_id', item.ruleFrontId),
        partner_id: resolve(item, 'partner_id', item.rulePartnerId),
        account_id: accountId || null,
        payment_method: methodFor(item),
        allocations,
      },
    })));
  };


  const fields: [string, string, { id: string; name: string }[]][] = [
    ['category_id', 'Categoria', categoryList as any],
    ['unit_id', 'Unidade', options.units as any],
    ['front_id', 'Frente de negócio', options.fronts as any],
    ['partner_id', 'Parceiro', options.partners as any],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Criar lançamentos em lote</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            Os campos abaixo são aplicados a todas as linhas incluídas. Deixe em
            <strong> "Manter sugestão da regra"</strong> para respeitar a regra de conciliação de cada linha.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {fields.map(([key, label, list]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Select value={form[key]} onValueChange={v => setForm(f => ({ ...f, [key]: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={RULE}>Manter sugestão da regra</SelectItem>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {list.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={AUTO}>Sugerir pelo texto do extrato</SelectItem>
                  <SelectItem value={NONE}>Não informar</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-border p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={split} onCheckedChange={v => setSplit(!!v)} />
              <span>
                Ratear entre <strong>unidades e frentes</strong>
                <span className="block text-xs text-muted-foreground">
                  O rateio percentual é aplicado a cada lançamento criado. A soma precisa fechar 100%.
                </span>
              </span>
            </label>
            {split && (
              <div className="space-y-2">
                {splitRows.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={r.unit_id}
                      onValueChange={v => setSplitRows(p => p.map((x, j) => j === i ? { ...x, unit_id: v } : x))}
                    >
                      <SelectTrigger className="w-40"><SelectValue placeholder="Unidade" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NONE}>Sem unidade</SelectItem>
                        {options.units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select
                      value={r.front_id}
                      onValueChange={v => setSplitRows(p => p.map((x, j) => j === i ? { ...x, front_id: v } : x))}
                    >
                      <SelectTrigger className="w-40"><SelectValue placeholder="Frente" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NONE}>Sem frente</SelectItem>
                        {options.fronts.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-24"
                      inputMode="decimal"
                      placeholder="%"
                      value={r.pct}
                      onChange={e => setSplitRows(p => p.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSplitRows(p => p.filter((_, j) => j !== i))}
                      aria-label="Remover linha do rateio"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSplitRows(p => [...p, { unit_id: NONE, front_id: NONE, pct: '' }])}
                  >
                    <Plus className="h-4 w-4" /> Adicionar linha
                  </Button>
                  <span className={`text-xs ${splitValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                    Total {splitSum.toFixed(2)}% de 100%
                  </span>
                </div>
              </div>
            )}
          </div>



          <div className="rounded-2xl border border-border p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={grouped} onCheckedChange={v => setGrouped(!!v)} />
              <span>
                Criar <strong>um único lançamento</strong> com o valor total das linhas selecionadas
                <span className="block text-xs text-muted-foreground">
                  Todas as linhas do extrato ficam vinculadas a esse lançamento. Sem marcar, é criado um
                  lançamento por linha.
                </span>
              </span>
            </label>
            {grouped && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Descrição do lançamento</Label>
                  <Input
                    value={groupDescription}
                    placeholder="Ex.: Recebimentos do dia"
                    onChange={e => setGroupDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Resumo</Label>
                  <p className="rounded-xl bg-muted/40 p-2 text-xs">
                    {included.length} linha(s) · valor total <strong>{brl(total)}</strong> · data {groupDate ? br(groupDate) : '—'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Linhas do lote ({included.length} de {items.length})</p>
              <Badge variant="outline" className="text-[11px]">Saldo {brl(total)}</Badge>
            </div>
            <div className="rounded-2xl border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 px-2 font-medium w-8"> </th>
                    <th className="py-1.5 px-2 font-medium">Data</th>
                    <th className="py-1.5 px-2 font-medium">Descrição</th>
                    <th className="py-1.5 px-2 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const e = item.entry;
                    const dup = duplicates.has(e.id);
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0">
                        <td className="py-1.5 px-2">
                          <Checkbox
                            checked={!skipped.has(e.id)}
                            onCheckedChange={() => setSkipped(prev => {
                              const next = new Set(prev);
                              next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                              return next;
                            })}
                            aria-label={`Incluir linha de ${br(e.posted_at)}`}
                          />
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{br(e.posted_at)}</td>
                        <td className="py-1.5 px-2">
                          <span className="block truncate max-w-[280px]">{e.memo || '(sem descrição)'}</span>
                          {dup && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
                              <AlertTriangle className="h-3 w-3" /> já existe em lançamentos
                            </span>
                          )}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-medium ${e.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                          {brl(e.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="gap-1.5" disabled={included.length === 0 || !splitValid || busy} onClick={confirm}>
            <PlusCircle className="h-4 w-4" />
            {grouped ? `Criar 1 lançamento de ${brl(total)}` : `Criar ${included.length} lançamento(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
