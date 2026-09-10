import { useEffect, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OptionList } from '@/components/ofx/OfxRulesPanel';

const NONE = '__none__';

export interface QuickRuleSeed {
  /** Texto sugerido para a regra (padrão do histórico). */
  pattern: string;
  /** 'receita' | 'despesa' | 'ambos' conforme o sinal das linhas. */
  appliesTo: 'receita' | 'despesa' | 'ambos';
  /** Quantas linhas do extrato seriam afetadas — só informativo. */
  lineCount?: number;
}

/**
 * Cria uma regra de conciliação a partir de uma linha (ou grupo) do extrato,
 * já com o texto preenchido. A regra apenas sugere classificação.
 */
export default function QuickRuleDialog({
  seed, options, onOpenChange, onSaved,
}: {
  seed: QuickRuleSeed | null;
  options: OptionList;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pattern, setPattern] = useState('');
  const [form, setForm] = useState<Record<string, string>>({
    category_id: NONE, unit_id: NONE, front_id: NONE, partner_id: NONE,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seed) return;
    setPattern(seed.pattern);
    setForm({ category_id: NONE, unit_id: NONE, front_id: NONE, partner_id: NONE });
    setError(null);
  }, [seed]);

  const val = (k: string) => (form[k] === NONE ? null : form[k]);

  const save = async () => {
    const text = pattern.trim();
    if (text.length < 2) { setError('Use pelo menos 2 caracteres no texto da regra.'); return; }
    if (!val('category_id') && !val('unit_id') && !val('front_id') && !val('partner_id')) {
      setError('Escolha ao menos uma sugestão (categoria, unidade, frente ou parceiro).');
      return;
    }
    setSaving(true);
    const { error: err } = await (supabase as any).from('ofx_import_rules').insert({
      pattern: text,
      match_type: 'contains',
      applies_to: seed?.appliesTo ?? 'ambos',
      category_id: val('category_id'),
      unit_id: val('unit_id'),
      front_id: val('front_id'),
      partner_id: val('partner_id'),
      priority: 100,
      active: true,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    toast({ title: 'Regra criada', description: `Linhas com "${text}" passam a receber a sugestão.` });
    onOpenChange(false);
    onSaved();
  };

  const categoryList = options.categories.filter(c =>
    seed?.appliesTo === 'ambos' ? true : c.type === seed?.appliesTo);

  const fields: [string, string, { id: string; name: string }[]][] = [
    ['category_id', 'Categoria', categoryList as any],
    ['unit_id', 'Unidade', options.units as any],
    ['front_id', 'Frente de negócio', options.fronts as any],
    ['partner_id', 'Parceiro', options.partners as any],
  ];

  return (
    <Dialog open={!!seed} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Criar regra a partir desta linha</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Texto que aparece no extrato</Label>
            <Input value={pattern} onChange={e => setPattern(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              A regra casa por "contém", sem diferenciar acento ou maiúscula.
              {seed?.lineCount ? ` ${seed.lineCount} linha(s) pendente(s) usam esse padrão hoje.` : ''}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([key, label, list]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Select value={form[key]} onValueChange={v => setForm(f => ({ ...f, [key]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {list.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="gap-1.5" disabled={saving} onClick={save}>
            <Wand2 className="h-4 w-4" /> Salvar regra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
