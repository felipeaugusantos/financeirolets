import { useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [form, setForm] = useState<Partial<OfxRule>>({});

  const startNew = (pattern = '') => {
    setForm({ pattern, match_type: 'contains', applies_to: 'ambos', priority: 100, active: true });
    setOpen(true);
  };

  const save = async () => {
    if (!form.pattern?.trim()) {
      toast({ title: 'Informe o texto que aparece no extrato', variant: 'destructive' });
      return;
    }
    const payload = {
      pattern: form.pattern.trim(),
      match_type: form.match_type ?? 'contains',
      applies_to: form.applies_to ?? 'ambos',
      category_id: form.category_id ?? null,
      unit_id: form.unit_id ?? null,
      front_id: form.front_id ?? null,
      partner_id: form.partner_id ?? null,
      priority: Number(form.priority ?? 100),
      active: true,
    };
    const { error } = await (supabase as any).from('ofx_import_rules').insert(payload);
    if (error) { toast({ title: 'Erro ao salvar regra', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Regra criada' });
    setOpen(false);
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from('ofx_import_rules').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
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
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {[nameOf(options.categories, r.category_id), nameOf(options.units, r.unit_id),
                  nameOf(options.fronts, r.front_id), nameOf(options.partners, r.partner_id)]
                  .filter(Boolean).join(' · ') || 'Sem sugestão definida'}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(r.id)} aria-label="Excluir regra">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Nova regra de importação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Texto no extrato</Label>
              <Input
                value={form.pattern ?? ''}
                onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                placeholder="Ex.: IFOOD, STONE, TARIFA PACOTE"
              />
              <p className="text-xs text-muted-foreground">Ignora acentos e maiúsculas.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de comparação</Label>
                <Select value={form.match_type ?? 'contains'} onValueChange={v => setForm(f => ({ ...f, match_type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém o texto</SelectItem>
                    <SelectItem value="regex">Expressão regular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Aplicar em</Label>
                <Select value={form.applies_to ?? 'ambos'} onValueChange={v => setForm(f => ({ ...f, applies_to: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambos">Entradas e saídas</SelectItem>
                    <SelectItem value="receita">Só entradas</SelectItem>
                    <SelectItem value="despesa">Só saídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  onValueChange={v => setForm(f => ({ ...f, [key]: v === NONE ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {list.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar regra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
