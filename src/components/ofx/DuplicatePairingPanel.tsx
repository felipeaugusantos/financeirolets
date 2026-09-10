import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, ChevronDown, ChevronRight } from 'lucide-react';
import type { DuplicatePairGroup, PairOutcome } from '@/lib/ofxMatch';

interface Props {
  groups: DuplicatePairGroup[];
}

const br = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');
const money = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const OUTCOME_LABEL: Record<PairOutcome, string> = {
  pareado: 'Pareado 1:1',
  unico: 'Candidato único',
  divergente: 'Diverge da regra',
  'sem-lancamento': 'Sem lançamento livre',
};

const OUTCOME_VARIANT: Record<PairOutcome, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pareado: 'default',
  unico: 'secondary',
  divergente: 'outline',
  'sem-lancamento': 'destructive',
};

/**
 * Conferência do rateio 1:1: mostra cada grupo de linhas idênticas do extrato
 * e qual lançamento cada linha reservou.
 */
export default function DuplicatePairingPanel({ groups }: Props) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;

  const totalLines = groups.reduce((s, g) => s + g.entryCount, 0);

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          <CardTitle className="flex items-center gap-2 text-sm font-heading">
            <Copy className="h-4 w-4 text-primary" />
            Linhas idênticas no extrato
            <Badge variant="outline" className="text-[11px]">
              {groups.length} grupo(s) · {totalLines} linha(s)
            </Badge>
          </CardTitle>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <p className="text-xs text-muted-foreground">
          Quando o extrato traz várias linhas com a mesma descrição, data e valor, cada linha reserva um lançamento
          diferente. Confira abaixo como o sistema distribuiu.
        </p>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          {groups.map(g => (
            <div key={g.signature} className="rounded-2xl border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.memo || '(sem descrição)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {br(g.posted_at)} · {money(g.amount)}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[11px]">
                  {g.entryCount} linha(s) × {g.candidateCount} lançamento(s)
                </Badge>
              </div>

              <ol className="space-y-1.5">
                {g.lines.map((l, i) => (
                  <li key={l.key} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">#{i + 1}</span>
                    <Badge variant={OUTCOME_VARIANT[l.outcome]} className="text-[10px]">
                      {OUTCOME_LABEL[l.outcome]}
                    </Badge>
                    <span className="text-muted-foreground">{l.note}</span>
                  </li>
                ))}
              </ol>

              {g.entryCount > g.candidateCount && (
                <p className="text-xs text-destructive">
                  Faltam {g.entryCount - g.candidateCount} lançamento(s) para cobrir todas as linhas — crie os que
                  faltam pela conciliação.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
