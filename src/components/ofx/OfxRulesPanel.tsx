import { useState } from 'react';
import { Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
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
import type { OfxRule } from '@/lib/ofxMatch';

export interface OptionList {
  categories: { id: string; name: string; type: string }[];
  units: { id: string; name: string }[];
  fronts: { id: string; name: string }[];
  partners: { id: string; name: string }[];
}

const NONE = '__none__';

type Errors = Partial<Record<'pattern' | 'priority' | 'suggestion', string>>;

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

  if (!form.category_id && !form.unit_id && !form.front_id && !form.partner_id) {
    errors.suggestion = 'Escolha ao menos uma sugestão (categoria, unidade, frente ou parceiro).';
  }

  return errors;
}

export default function OfxRulesPanel({
  rules, options, onChanged, defaultPattern,
}: {
  rules: OfxRule[];
  options: OptionList;
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
    setForm({ pattern, match_type: 'contains', applies_to: 'ambos', priority: 100, active: true });
    setOpen(true);
  };

  const startEdit = (rule: OfxRule) => {
    setEditing(rule);
    setErrors({});
    setForm({ ...rule });
    setOpen(true);
  };

  const setField = (key: keyof OfxRule, value: unknown) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key === 'pattern' ? 'pattern' : key === 'priority' ? 'priority' : 'suggestion']: undefined }));
  };

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
      active: true,
    };

    setSaving(true);
    const { error } = editing
      ? await (supabase as any).from('ofx_import_rules').update(payload).eq('id', editing.id)
      : await (supabase as any).from('ofx_import_rules').insert(payload);
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
    const { error } = await (supabase as any).from('ofx_import_rules').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Regra excluída' });
    onChanged();
  };

  const nameOf = (list: { id: string; name: string }[], id?: string | null) =>
    list.find(o => o.id === id)?.name;

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
        {rules.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {r.pattern}
                <Badge variant="secondary" className="ml-2 text-[10px]">{r.match_type === 'regex' ? 'regex' : 'contém'}</Badge>
                {r.applies_to !== 'ambos' && <Badge variant="outline" className="ml-1 text-[10px]">{r.applies_to}</Badge>}
                <Badge variant="outline" className="ml-1 text-[10px]">prioridade {r.priority}</Badge>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {[nameOf(options.categories, r.category_id), nameOf(options.units, r.unit_id),
                  nameOf(options.fronts, r.front_id), nameOf(options.partners, r.partner_id)]
                  .filter(Boolean).join(' · ') || 'Sem sugestão definida'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
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
            {([
              ['category_id', 'Categoria sugerida', options.categories],
              ['unit_id', 'Unidade sugerida', options.units],
              ['front_id', 'Frente sugerida', options.fronts],
              ['partner_id', 'Parceiro sugerido', options.partners],
            ] as const).map(([key, label, list]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Select
                  value={(form as any)[key] ?? NONE}
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
