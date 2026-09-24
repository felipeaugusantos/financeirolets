import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Target, Loader2, Copy } from 'lucide-react';
import { useBudgets } from '@/hooks/useBudgets';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface DreLine {
  id: string;
  code: string | null;
  name: string;
  is_subtotal: boolean;
  parent_id: string | null;
  sort_order: number;
}

interface Unit {
  id: string;
  name: string;
}

const fmtInput = (v: number) =>
  v === 0 ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseInput = (s: string): number => {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

export default function BudgetSettings({ onBack }: { onBack: () => void }) {
  const [dreLines, setDreLines] = useState<DreLine[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [unitId, setUnitId] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyPct, setCopyPct] = useState('0');

  const { budgets, loading, upsertBudget, copyFromPreviousYear } = useBudgets(year, unitId);

  useEffect(() => {
    Promise.all([
      supabase.from('dre_lines').select('*').eq('active', true).neq('view_scope', 'contabil').order('sort_order'),
      supabase.from('units').select('id, name').eq('active', true).order('name'),
    ]).then(([dre, un]) => {
      setDreLines((dre.data ?? []) as DreLine[]);
      setUnits((un.data ?? []) as Unit[]);
    });
  }, []);

  // Map budget cell key -> amount
  const budgetMap = useMemo(() => {
    const m = new Map<string, number>();
    budgets.forEach(b => m.set(`${b.dre_line_id}:${b.month}`, Number(b.planned_amount)));
    return m;
  }, [budgets]);

  // Show only non-subtotal lines (ones the user can budget directly)
  const editableLines = useMemo(
    () => dreLines.filter(l => !l.is_subtotal),
    [dreLines]
  );

  // Compute depth for indentation
  const depthMap = useMemo(() => {
    const dm = new Map<string, number>();
    const compute = (id: string): number => {
      if (dm.has(id)) return dm.get(id)!;
      const line = dreLines.find(l => l.id === id);
      if (!line || !line.parent_id) {
        dm.set(id, 0);
        return 0;
      }
      const d = compute(line.parent_id) + 1;
      dm.set(id, d);
      return d;
    };
    dreLines.forEach(l => compute(l.id));
    return dm;
  }, [dreLines]);

  const handleCopy = async () => {
    setCopyOpen(false);
    await copyFromPreviousYear(parseFloat(copyPct.replace(',', '.')) || 0);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base font-heading">Orçamento Anual</CardTitle>
            <p className="text-xs text-muted-foreground">
              Defina valores planejados por linha do DRE e mês
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ano</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={unitId ?? '__consolidated__'} onValueChange={v => setUnitId(v === '__consolidated__' ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__consolidated__">Consolidado</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-end justify-end">
              <Button variant="outline" onClick={() => setCopyOpen(true)} className="gap-2">
                <Copy className="h-4 w-4" /> Copiar de {year - 1}
              </Button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="bg-muted/40 sticky top-0">
                <TableRow>
                  <TableHead className="w-[260px] sticky left-0 bg-muted/40 z-10">Linha do DRE</TableHead>
                  {MONTHS.map(m => (
                    <TableHead key={m} className="text-right min-w-[110px]">{m}/{String(year).slice(2)}</TableHead>
                  ))}
                  <TableHead className="text-right min-w-[120px] bg-muted/60">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editableLines.map(line => {
                  const total = MONTHS.reduce((s, _, idx) => s + (budgetMap.get(`${line.id}:${idx + 1}`) || 0), 0);
                  const depth = depthMap.get(line.id) || 0;
                  return (
                    <TableRow key={line.id}>
                      <TableCell
                        className="sticky left-0 bg-card text-sm"
                        style={{ paddingLeft: `${depth * 1 + 1}rem` }}
                      >
                        <span className="text-xs text-muted-foreground mr-1">{line.code}</span>
                        {line.name}
                      </TableCell>
                      {MONTHS.map((_, idx) => {
                        const month = idx + 1;
                        const val = budgetMap.get(`${line.id}:${month}`) || 0;
                        return (
                          <TableCell key={month} className="p-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              defaultValue={fmtInput(val)}
                              placeholder="0,00"
                              className="h-8 text-right tabular-nums text-sm border-transparent hover:border-input focus:border-input"
                              onBlur={e => {
                                const newVal = parseInput(e.target.value);
                                if (newVal !== val) {
                                  upsertBudget(line.id, month, newVal);
                                  e.target.value = fmtInput(newVal);
                                }
                              }}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className={cn('text-right tabular-nums font-semibold bg-muted/30', total === 0 && 'text-muted-foreground')}>
                        {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {editableLines.length === 0 && !loading && (
            <p className="text-sm text-center text-muted-foreground py-8">
              Nenhuma linha do DRE encontrada. Cadastre linhas em Configurações → Linhas do DRE.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar orçamento de {year - 1}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Os valores de {year - 1} serão copiados para {year} aplicando o ajuste percentual abaixo.
              Valores existentes em {year} serão substituídos.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Ajuste (%)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={copyPct}
                onChange={e => setCopyPct(e.target.value)}
                placeholder="Ex.: 10 para +10%"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>Cancelar</Button>
            <Button onClick={handleCopy}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
