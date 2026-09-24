import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import SplitEditor from './SplitEditor';
import { cleanSplit, splitTotal, type CategorySplitRule, type SplitLine } from '@/lib/categorySplits';

type Opt = { id: string; name: string };
const ALL = '__all__';

interface Props {
  categories: (Opt & { type?: string })[];
  units: Opt[];
  accounts: Opt[];
  canEdit: boolean;
}

/** Divisão padrão por categoria: vale sem depender do texto do extrato. */
export default function CategorySplitsPanel({ categories, units, accounts, canEdit }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<CategorySplitRule[]>([]);
  const [editing, setEditing] = useState<Partial<CategorySplitRule> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from('category_split_rules').select('*');
    setRows((data ?? []) as CategorySplitRule[]);
  };
  useEffect(() => { load(); }, []);

  const name = (list: Opt[], id?: string | null) => list.find(x => x.id === id)?.name ?? '—';
  const sorted = useMemo(
    () => [...rows].sort((a, b) => name(categories, a.category_id).localeCompare(name(categories, b.category_id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, categories]
  );

  const save = async () => {
    if (!editing?.category_id) return toast({ title: 'Escolha a categoria', variant: 'destructive' });
    const lines = cleanSplit(editing.allocations);
    if (lines.length < 1 || Math.abs(splitTotal(lines) - 100) >= 0.01)
      return toast({ title: 'A divisão precisa somar 100%', variant: 'destructive' });
    setSaving(true);
    const payload = {
      category_id: editing.category_id,
      account_id: editing.account_id || null,
      allocations: lines,
      notes: editing.notes || null,
      active: editing.active ?? true,
    };
    const { error } = editing.id
      ? await (supabase as any).from('category_split_rules').update(payload).eq('id', editing.id)
      : await (supabase as any).from('category_split_rules').insert({ ...payload, created_by: user?.id ?? null });
    setSaving(false);
    if (error) {
      const dup = String(error.message).includes('uniq');
      return toast({
        title: 'Não foi possível salvar',
        description: dup ? 'Já existe divisão para essa categoria nessa conta.' : error.message,
        variant: 'destructive',
      });
    }
    toast({ title: 'Divisão salva' });
    setEditing(null);
    load();
  };

  const remove = async (r: CategorySplitRule) => {
    if (!confirm(`Excluir a divisão de "${name(categories, r.category_id)}"?`)) return;
    const { error } = await (supabase as any).from('category_split_rules').delete().eq('id', r.id);
    if (error) return toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    load();
  };

  const toggle = async (r: CategorySplitRule, active: boolean) => {
    await (supabase as any).from('category_split_rules').update({ active }).eq('id', r.id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Quando um lançamento do extrato cair nesta categoria e não tiver unidade definida, o valor é dividido
          automaticamente. A divisão de uma conta específica vence a divisão geral.
        </p>
        {canEdit && (
          <Button className="gap-2 rounded-xl" onClick={() => setEditing({ allocations: [], active: true })}>
            <Plus className="h-4 w-4" /> Nova divisão
          </Button>
        )}
      </div>

      {sorted.length === 0 && (
        <Card className="rounded-2xl"><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma divisão por categoria cadastrada.
        </CardContent></Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map(r => (
          <Card key={r.id} className="rounded-2xl">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-heading font-semibold">{name(categories, r.category_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.account_id ? `Só na conta ${name(accounts, r.account_id)}` : 'Qualquer conta'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && <Switch checked={r.active} onCheckedChange={v => toggle(r, v)} aria-label="Ativa" />}
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ ...r, allocations: cleanSplit(r.allocations) })} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {cleanSplit(r.allocations).map(l => (
                  <Badge key={l.unit_id} variant="secondary">{name(units, l.unit_id)} {l.percentage}%</Badge>
                ))}
                {!r.active && <Badge variant="outline">Desligada</Badge>}
              </div>
              {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? 'Editar divisão' : 'Nova divisão por categoria'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={editing.category_id || undefined} onValueChange={v => setEditing({ ...editing, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Conta do extrato</Label>
                <Select value={editing.account_id || ALL} onValueChange={v => setEditing({ ...editing, account_id: v === ALL ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Qualquer conta</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Dividir entre</Label>
                <SplitEditor
                  value={(editing.allocations as SplitLine[]) ?? []}
                  onChange={v => setEditing({ ...editing, allocations: v })}
                  units={units}
                />
              </div>
              <div className="space-y-1">
                <Label>Observação (opcional)</Label>
                <Input value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
