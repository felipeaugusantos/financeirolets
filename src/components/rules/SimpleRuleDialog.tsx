import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import SplitEditor from './SplitEditor';
import { cleanSplit, splitTotal, type SplitLine } from '@/lib/categorySplits';

type Opt = { id: string; name: string };
const ALL = '__all__';
type Where = 'conta' | 'unidade' | 'dividir';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Opt[];
  units: Opt[];
  accounts: Opt[];
  onSaved: () => void;
}

/** Assistente de regra em linguagem simples: "Quando aparecer X → categoria Y, lançar em Z". */
export default function SimpleRuleDialog({ open, onOpenChange, categories, units, accounts, onSaved }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [word, setWord] = useState('');
  const [except, setExcept] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState<string>(ALL);
  const [appliesTo, setAppliesTo] = useState('ambos');
  const [where, setWhere] = useState<Where>('conta');
  const [unitId, setUnitId] = useState('');
  const [split, setSplit] = useState<SplitLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWord(''); setExcept(''); setCategoryId(''); setAccountId(ALL); setAppliesTo('ambos');
    setWhere('conta'); setUnitId(''); setSplit([]);
  }, [open]);

  const save = async () => {
    const pattern = word.trim().toLowerCase();
    if (!pattern) return toast({ title: 'Informe a palavra do extrato', variant: 'destructive' });
    if (!categoryId) return toast({ title: 'Escolha a categoria', variant: 'destructive' });
    if (where === 'unidade' && !unitId) return toast({ title: 'Escolha a unidade', variant: 'destructive' });
    const lines = cleanSplit(split);
    if (where === 'dividir' && (lines.length < 2 || Math.abs(splitTotal(lines) - 100) >= 0.01))
      return toast({ title: 'Escolha 2 ou mais unidades somando 100%', variant: 'destructive' });

    setSaving(true);
    const { error } = await (supabase as any).from('ofx_import_rules').insert({
      pattern,
      match_type: 'contains',
      applies_to: appliesTo,
      category_id: categoryId,
      account_id: accountId === ALL ? null : accountId,
      exclude_pattern: except.trim() || null,
      use_statement_unit: where === 'conta',
      unit_id: where === 'unidade' ? unitId : null,
      allocations: where === 'dividir' ? lines.map(l => ({ ...l, front_id: null })) : null,
      priority: accountId === ALL ? 50 : 40,
      active: true,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
    toast({ title: 'Regra criada', description: `"${pattern}" → ${categories.find(c => c.id === categoryId)?.name}` });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova regra simples</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>1. Quando o extrato tiver a palavra</Label>
            <Input placeholder="Ex.: hapvida" value={word} onChange={e => setWord(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Exceto quando tiver (opcional)</Label>
            <Input placeholder="Ex.: martinho, ifood" value={except} onChange={e => setExcept(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Na conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Qualquer conta</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={appliesTo} onValueChange={setAppliesTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambos">Entradas e saídas</SelectItem>
                  <SelectItem value="receita">Só entradas</SelectItem>
                  <SelectItem value="despesa">Só saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>2. Lançar na categoria</Label>
            <Select value={categoryId || undefined} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>3. Em qual unidade</Label>
            <RadioGroup value={where} onValueChange={v => setWhere(v as Where)} className="gap-2">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="conta" /> Unidade da conta do extrato</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="unidade" /> Sempre uma unidade</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="dividir" /> Dividir entre unidades</label>
            </RadioGroup>
            {where === 'unidade' && (
              <Select value={unitId || undefined} onValueChange={setUnitId}>
                <SelectTrigger><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
                <SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {where === 'dividir' && <SplitEditor value={split} onChange={setSplit} units={units} />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Criar regra'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
