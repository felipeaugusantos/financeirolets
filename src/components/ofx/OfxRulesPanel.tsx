import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Power, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import type { OfxRule, RuleAllocation } from '@/lib/ofxMatch';
import type { Json } from '@/integrations/supabase/types';

export interface OptionList {
  categories: { id: string; name: string; type: string }[];
  units: { id: string; name: string }[];
  fronts: { id: string; name: string }[];
  partners: { id: string; name: string }[];
}

const NONE = '__none__';

type Errors = Partial<Record<'pattern' | 'priority' | 'suggestion' | 'amount' | 'allocations', string>>;

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valida o formulário e devolve mensagens claras por campo. */
function validate(form: Partial<OfxRule>, rules: OfxRule[], editingId?: string): Errors {
  const errors: Errors = {};
  const pattern = (form.pattern ?? '').trim();

  if (!pattern) {
    errors.pattern = 'Informe o texto que aparece no extrato.';
  } else if (pattern.length < 2) {
    errors.pattern = 'Use pelo menos 2 caracteres para evitar casar com tudo.';
  } else if (form.match_type === 'regex') {
    try {
      new RegExp(pattern, 'i');
    } catch (e) {
      errors.pattern = `Expressão regular inválida: ${(e as Error).message}`;
    }
  } else if (
    rules.some(r => r.id !== editingId && r.match_type === (form.match_type ?? 'contains')
      && r.pattern.trim().toLowerCase() === pattern.toLowerCase()
      && r.applies_to === (form.applies_to ?? 'ambos'))
  ) {
    errors.pattern = 'Já existe uma regra com esse mesmo texto e aplicação.';
  }

  const priority = Number(form.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 999) {
    errors.priority = 'A prioridade deve ser um número inteiro entre 1 e 999.';
  }

  const allocs = (form.allocations ?? []) as RuleAllocation[];

  if (!form.category_id && !form.unit_id && !form.front_id && !form.partner_id
    && !form.use_statement_unit && allocs.length === 0) {
    errors.suggestion = 'Escolha ao menos uma sugestão (categoria, unidade, frente, parceiro ou rateio).';
  }

  const min = form.min_amount == null ? null : Number(form.min_amount);
  const max = form.max_amount == null ? null : Number(form.max_amount);
  if ((min != null && (Number.isNaN(min) || min < 0)) || (max != null && (Number.isNaN(max) || max < 0))) {
    errors.amount = 'Os valores da faixa devem ser números positivos.';
  } else if (min != null && max != null && min > max) {
    errors.amount = 'O valor mínimo não pode ser maior que o máximo.';
  }

  if (allocs.length > 0) {
    if (allocs.some(a => !a.unit_id && !a.front_id)) {
      errors.allocations = 'Cada linha do rateio precisa de unidade ou frente.';
    } else if (allocs.some(a => !(Number(a.percentage) > 0))) {
      errors.allocations = 'Informe um percentual maior que zero em cada linha do rateio.';
    } else {
      const total = allocs.reduce((sum, a) => sum + Number(a.percentage || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        errors.allocations = `O rateio soma ${total.toFixed(2)}% — precisa fechar em 100%.`;
      }
    }
  }

  return errors;
}

export default function OfxRulesPanel({
  rules, options, accounts = [], onChanged, defaultPattern,
}: {
  rules: OfxRule[];
  options: OptionList;
  accounts?: { id: string; name: string }[];
  onChanged: () => void;
  defaultPattern?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<OfxRule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OfxRule | null>(null);
  const [form, setForm] = useState<Partial<OfxRule>>({});
  const [errors, setErrors] = useState<Errors>({});

  const startNew = (pattern = '') => {
    setEditing(null);
    setErrors({});
    setForm({
      pattern, match_type: 'contains', applies_to: 'ambos', priority: 100, active: true,
      account_id: null, exclude_pattern: '', min_amount: null, max_amount: null,
      use_statement_unit: false, allocations: [],
    });
    setOpen(true);
  };

  const startEdit = (rule: OfxRule) => {
    setEditing(rule);
    setErrors({});
    setForm({ ...rule, allocations: rule.allocations ?? [] });
    setOpen(true);
  };

  const setField = (key: keyof OfxRule, value: unknown) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors({});
  };

  const allocs = (form.allocations ?? []) as RuleAllocation[];
  const setAllocs = (list: RuleAllocation[]) => setField('allocations', list);
  const allocTotal = allocs.reduce((sum, a) => sum + Number(a.percentage || 0), 0);

  const save = async () => {
    const found = validate(form, rules, editing?.id);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      toast({ title: 'Revise os campos destacados', description: Object.values(found).filter(Boolean)[0], variant: 'destructive' });
      return;
    }

    const payload = {
      pattern: (form.pattern ?? '').trim(),
      match_type: form.match_type ?? 'contains',
      applies_to: form.applies_to ?? 'ambos',
      category_id: form.category_id ?? null,
      unit_id: form.unit_id ?? null,
      front_id: form.front_id ?? null,
      partner_id: form.partner_id ?? null,
      priority: Number(form.priority ?? 100),
      active: form.active !== false,
      account_id: form.account_id ?? null,
      exclude_pattern: (form.exclude_pattern ?? '').trim() || null,
      min_amount: form.min_amount == null || (form.min_amount as unknown) === '' ? null : Number(form.min_amount),
      max_amount: form.max_amount == null || (form.max_amount as unknown) === '' ? null : Number(form.max_amount),
      use_statement_unit: !!form.use_statement_unit,
      allocations: (allocs.length ? allocs : null) as unknown as Json,
    };

    setSaving(true);
    const { error } = editing
      ? await supabase.from('ofx_import_rules').update(payload).eq('id', editing.id)
      : await supabase.from('ofx_import_rules').insert(payload);
    setSaving(false);

    if (error) {
      toast({ title: editing ? 'Erro ao atualizar regra' : 'Erro ao salvar regra', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing ? 'Regra atualizada' : 'Regra criada' });
    setOpen(false);
    setEditing(null);
    onChanged();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('ofx_import_rules').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Regra excluída' });
    onChanged();
  };

  const nameOf = (list: { id: string; name: string }[], id?: string | null) =>
    list.find(o => o.id === id)?.name;

  /** Liga/desliga a regra sem apagá-la. */
  const toggleActive = async (rule: OfxRule) => {
    const { error } = await supabase
      .from('ofx_import_rules').update({ active: !rule.active }).eq('id', rule.id);
    if (error) { toast({ title: 'Erro ao alterar a regra', description: error.message, variant: 'destructive' }); return; }
    toast({ title: rule.active ? 'Regra desativada' : 'Regra ativada' });
    onChanged();
  };

  /** Sobe (mais prioridade) ou desce a regra na ordem de aplicação. */
  const movePriority = async (rule: OfxRule, delta: number) => {
    const next = Math.min(999, Math.max(1, Number(rule.priority ?? 100) + delta));
    if (next === Number(rule.priority)) return;
    const { error } = await supabase
      .from('ofx_import_rules').update({ priority: next }).eq('id', rule.id);
    if (error) { toast({ title: 'Erro ao mudar a prioridade', description: error.message, variant: 'destructive' }); return; }
    onChanged();
  };

  const ordered = [...rules].sort(
    (a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0) || a.pattern.localeCompare(b.pattern),
  );

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accent/10">
            <Wand2 className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-sm font-heading">Regras por texto do extrato</CardTitle>
            <p className="text-xs text-muted-foreground">
              Sugerem categoria/unidade automaticamente. Nunca criam lançamento sozinhas.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => startNew(defaultPattern)}>
          <Plus className="h-4 w-4" /> Nova regra
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma regra ainda. Ex.: texto <strong>IFOOD</strong> → categoria "Receita iFood".
          </p>
        )}
        {ordered.map(r => (
          <div
            key={r.id}
            className={`flex items-center justify-between gap-2 rounded-xl border border-border p-2 ${r.active === false ? 'opacity-60' : ''}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {r.pattern}
                <Badge variant="secondary" className="ml-2 text-[10px]">{r.match_type === 'regex' ? 'regex' : 'contém'}</Badge>
                {r.applies_to !== 'ambos' && <Badge variant="outline" className="ml-1 text-[10px]">{r.applies_to}</Badge>}
                <Badge variant="outline" className="ml-1 text-[10px]">prioridade {r.priority}</Badge>
                {r.account_id && (
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {accounts.find(a => a.id === r.account_id)?.name ?? 'conta específica'}
                  </Badge>
                )}
                {r.use_statement_unit && <Badge variant="outline" className="ml-1 text-[10px]">unidade do extrato</Badge>}
                {r.allocations?.length ? <Badge variant="outline" className="ml-1 text-[10px]">rateio</Badge> : null}
                {r.active === false && <Badge variant="destructive" className="ml-1 text-[10px]">inativa</Badge>}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {[nameOf(options.categories, r.category_id), nameOf(options.units, r.unit_id),
                  nameOf(options.fronts, r.front_id), nameOf(options.partners, r.partner_id)]
                  .filter(Boolean).join(' · ') || 'Sem sugestão definida'}
                {r.exclude_pattern ? ` · exceto: ${r.exclude_pattern}` : ''}
                {r.min_amount != null || r.max_amount != null
                  ? ` · ${r.min_amount != null ? `de ${brl(Number(r.min_amount))}` : ''}`
                    + `${r.max_amount != null ? ` até ${brl(Number(r.max_amount))}` : ''}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon" variant="ghost" onClick={() => movePriority(r, -10)}
                aria-label="Aplicar antes (mais prioridade)" title="Aplicar antes das outras"
              >
                <ArrowUp className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                size="icon" variant="ghost" onClick={() => movePriority(r, 10)}
                aria-label="Aplicar depois (menos prioridade)" title="Aplicar depois das outras"
              >
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                size="icon" variant="ghost" onClick={() => toggleActive(r)}
                aria-label={r.active === false ? 'Ativar regra' : 'Desativar regra'}
                title={r.active === false ? 'Ativar regra' : 'Desativar regra'}
              >
                <Power className={`h-4 w-4 ${r.active === false ? 'text-muted-foreground' : 'text-secondary'}`} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => startEdit(r)} aria-label="Editar regra">
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)} aria-label="Excluir regra">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? 'Editar regra de conciliação' : 'Nova regra de conciliação'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Texto no extrato</Label>
              <Input
                value={form.pattern ?? ''}
                onChange={e => setField('pattern', e.target.value)}
                placeholder="Ex.: IFOOD, STONE, TARIFA PACOTE"
                aria-invalid={!!errors.pattern}
              />
              {errors.pattern
                ? <p className="text-xs text-destructive">{errors.pattern}</p>
                : <p className="text-xs text-muted-foreground">Ignora acentos e maiúsculas.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de comparação</Label>
                <Select value={form.match_type ?? 'contains'} onValueChange={v => setField('match_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém o texto</SelectItem>
                    <SelectItem value="regex">Expressão regular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Aplicar em</Label>
                <Select value={form.applies_to ?? 'ambos'} onValueChange={v => setField('applies_to', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambos">Entradas e saídas</SelectItem>
                    <SelectItem value="receita">Só entradas</SelectItem>
                    <SelectItem value="despesa">Só saídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={form.priority ?? 100}
                onChange={e => setField('priority', e.target.value === '' ? NaN : Number(e.target.value))}
                aria-invalid={!!errors.priority}
              />
              {errors.priority
                ? <p className="text-xs text-destructive">{errors.priority}</p>
                : <p className="text-xs text-muted-foreground">Menor número é avaliado primeiro.</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Conta do extrato</Label>
              <Select
                value={form.account_id ?? NONE}
                onValueChange={v => setField('account_id', v === NONE ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Qualquer conta" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NONE}>Qualquer conta</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Permite o mesmo texto ter classificação diferente em cada conta.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Exceções (não aplicar quando aparecer)</Label>
              <Input
                value={form.exclude_pattern ?? ''}
                onChange={e => setField('exclude_pattern', e.target.value)}
                placeholder="Ex.: MARTINHO, ESTORNO"
              />
              <p className="text-xs text-muted-foreground">Separe por vírgula. Ignora acentos e maiúsculas.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor mínimo (R$)</Label>
                <Input
                  type="number" step="0.01" min={0}
                  value={form.min_amount ?? ''}
                  onChange={e => setField('min_amount', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Sem mínimo"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor máximo (R$)</Label>
                <Input
                  type="number" step="0.01" min={0}
                  value={form.max_amount ?? ''}
                  onChange={e => setField('max_amount', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Sem máximo"
                />
              </div>
            </div>
            {errors.amount
              ? <p className="text-xs text-destructive">{errors.amount}</p>
              : <p className="text-xs text-muted-foreground">Comparação pelo valor da linha, sem sinal.</p>}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <Label className="text-sm">Usar a unidade da conta do extrato</Label>
                <p className="text-xs text-muted-foreground">
                  A unidade vem da conta importada, sem precisar de uma regra por unidade.
                </p>
              </div>
              <Switch
                checked={!!form.use_statement_unit}
                onCheckedChange={v => setField('use_statement_unit', v)}
              />
            </div>
            {([
              ['category_id', 'Categoria sugerida', options.categories],
              ['unit_id', 'Unidade sugerida', options.units],
              ['front_id', 'Frente sugerida', options.fronts],
              ['partner_id', 'Parceiro sugerido', options.partners],
            ] as const).map(([key, label, list]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Select
                  value={(form[key] as string | null | undefined) ?? NONE}
                  disabled={key === 'unit_id' && !!form.use_statement_unit}
                  onValueChange={v => setField(key, v === NONE ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {list.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-sm">Rateio automático</Label>
                  <p className="text-xs text-muted-foreground">
                    Divide o lançamento entre unidades/frentes. Precisa fechar 100%.
                  </p>
                </div>
                <Button
                  size="sm" variant="outline" className="rounded-xl"
                  onClick={() => setAllocs([...allocs, { unit_id: null, front_id: null, percentage: 50 }])}
                >
                  <Plus className="h-4 w-4" /> Linha
                </Button>
              </div>
              {allocs.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_auto] items-center gap-2">
                  <Select
                    value={a.unit_id ?? NONE}
                    onValueChange={v => setAllocs(allocs.map((x, j) =>
                      j === i ? { ...x, unit_id: v === NONE ? null : v } : x))}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Unidade" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>Sem unidade</SelectItem>
                      {options.units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={a.front_id ?? NONE}
                    onValueChange={v => setAllocs(allocs.map((x, j) =>
                      j === i ? { ...x, front_id: v === NONE ? null : v } : x))}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Frente" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>Sem frente</SelectItem>
                      {options.fronts.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9" type="number" step="0.01" min={0}
                    value={a.percentage}
                    onChange={e => setAllocs(allocs.map((x, j) =>
                      j === i ? { ...x, percentage: e.target.value === '' ? 0 : Number(e.target.value) } : x))}
                  />
                  <Button
                    size="icon" variant="ghost" aria-label="Remover linha do rateio"
                    onClick={() => setAllocs(allocs.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {allocs.length > 0 && (
                <p className={`text-xs ${Math.abs(allocTotal - 100) > 0.01 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Total rateado: {allocTotal.toFixed(2)}%
                </p>
              )}
              {errors.allocations && <p className="text-xs text-destructive">{errors.allocations}</p>}
            </div>
            {errors.suggestion && <p className="text-xs text-destructive">{errors.suggestion}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta regra?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra "{confirmDelete?.pattern}" deixará de sugerir classificação nas próximas conciliações.
              Lançamentos já conciliados não são alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
