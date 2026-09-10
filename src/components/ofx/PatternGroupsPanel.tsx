import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, PlusCircle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EnrichedEntry } from '@/hooks/useOfxImport';
import { memoPattern } from '@/lib/ofxMatch';
import type { QuickRuleSeed } from '@/components/ofx/QuickRuleDialog';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

interface Group {
  pattern: string;
  label: string;
  items: EnrichedEntry[];
  total: number;
  appliesTo: 'receita' | 'despesa' | 'ambos';
  hasRule: boolean;
}

/**
 * Agrupa as linhas pendentes por padrão de histórico (tarifas, Stone,
 * antecipações...). O trabalho repetitivo do dia a dia vira uma decisão por
 * grupo, em vez de uma por linha.
 */
export default function PatternGroupsPanel({
  enriched, onCreateRule, onCreateMany,
}: {
  enriched: EnrichedEntry[];
  onCreateRule: (seed: QuickRuleSeed) => void;
  onCreateMany: (items: EnrichedEntry[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, EnrichedEntry[]>();
    for (const v of enriched) {
      if (v.entry.status !== 'pendente') continue;
      const key = memoPattern(v.entry.memo || '') || '(sem histórico)';
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    return [...map.entries()]
      .map(([pattern, items]) => {
        const positives = items.filter(i => i.entry.amount >= 0).length;
        return {
          pattern,
          label: items[0].entry.memo || pattern,
          items,
          total: items.reduce((s, i) => s + Number(i.entry.amount), 0),
          appliesTo: (positives === items.length ? 'receita'
            : positives === 0 ? 'despesa' : 'ambos') as Group['appliesTo'],
          hasRule: items.some(i => !!i.ruleLabel),
        };
      })
      .filter(g => g.items.length > 1)
      .sort((a, b) => b.items.length - a.items.length);
  }, [enriched]);

  if (groups.length === 0) return null;

  const covered = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex flex-wrap items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Pendências agrupadas por histórico
          <Badge variant="outline" className="text-[11px]">{groups.length} padrão(ões) · {covered} linha(s)</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Linhas que se repetem toda semana. Classifique o grupo inteiro de uma vez ou
          crie uma regra para que a próxima importação já venha classificada.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                <th className="w-8 p-2"></th>
                <th className="p-2 text-left font-medium">Histórico</th>
                <th className="p-2 text-right font-medium">Linhas</th>
                <th className="p-2 text-right font-medium">Total</th>
                <th className="w-64 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g.pattern}>
                  <tr className="border-t border-border">
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setOpen(o => (o === g.pattern ? null : g.pattern))}
                        aria-label="Ver linhas do grupo"
                      >
                        {open === g.pattern ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="p-2">
                      <span className="line-clamp-1">{g.label}</span>
                      {g.hasRule && <Badge variant="outline" className="mt-0.5 text-[10px]">já tem regra</Badge>}
                    </td>
                    <td className="p-2 text-right tabular-nums">{g.items.length}</td>
                    <td className={`p-2 text-right tabular-nums whitespace-nowrap ${g.total >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                      {brl(g.total)}
                    </td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-xl gap-1 text-[11px]"
                        onClick={() => onCreateRule({
                          pattern: g.items[0].entry.memo?.slice(0, 60) || g.pattern,
                          appliesTo: g.appliesTo,
                          lineCount: g.items.length,
                        })}
                      >
                        <Wand2 className="h-3 w-3" /> Criar regra
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-xl gap-1 text-[11px]"
                        onClick={() => onCreateMany(g.items)}
                      >
                        <PlusCircle className="h-3 w-3" /> Classificar {g.items.length}
                      </Button>
                    </td>
                  </tr>
                  {open === g.pattern && g.items.map(i => (
                    <tr key={i.entry.id} className="border-t border-border/50 bg-muted/20">
                      <td></td>
                      <td className="p-2 pl-6 text-muted-foreground">
                        {br(i.entry.posted_at)} · {i.entry.memo}
                      </td>
                      <td></td>
                      <td className="p-2 text-right tabular-nums">{brl(i.entry.amount)}</td>
                      <td></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
