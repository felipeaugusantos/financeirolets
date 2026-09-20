import { useMemo, useState } from 'react';
import { Lightbulb, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EnrichedEntry } from '@/hooks/useOfxImport';
import { normalizeText } from '@/lib/ofxMatch';
import type { QuickRuleSeed } from '@/components/ofx/QuickRuleDialog';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Palavras do começo do histórico que não identificam a contraparte. */
const PREFIXOS = new Set([
  'pix', 'ted', 'doc', 'transferencia', 'transf', 'pagamento', 'pgto', 'recebido',
  'enviado', 'debito', 'credito', 'conta', 'banco', 'boleto', 'cobranca', 'liquidacao',
  'para', 'de', 'do', 'da', 'des', 'rem', 'via', 'eletron', 'eletronico', 'ident',
]);

const IGNORAR = new Set(['ltda', 'me', 'epp', 'sa', 'eireli', 'cnpj', 'cpf']);

/**
 * Extrai o nome da contraparte do histórico do extrato: descarta prefixos
 * bancários, números e datas, e fica com as duas primeiras palavras do nome.
 */
export function nomeDoHistorico(memo: string): string | null {
  const palavras = normalizeText(memo)
    .replace(/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !/\d/.test(w) && !IGNORAR.has(w));
  const nome = palavras.filter(w => !PREFIXOS.has(w));
  if (nome.length === 0) return null;
  const chave = nome.slice(0, 2).join(' ');
  return chave.length >= 5 ? chave : null;
}

interface Sugestao {
  key: string;
  label: string;
  pattern: string;
  items: EnrichedEntry[];
  total: number;
  appliesTo: 'receita' | 'despesa' | 'ambos';
}

/**
 * Aponta nomes que se repetem nas linhas pendentes ainda sem regra e
 * pergunta se o usuário quer criar a regra correspondente.
 */
export default function SuggestedRulesPanel({
  enriched, onCreateRule,
}: {
  enriched: EnrichedEntry[];
  onCreateRule: (seed: QuickRuleSeed) => void;
}) {
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set());

  const sugestoes = useMemo<Sugestao[]>(() => {
    const map = new Map<string, EnrichedEntry[]>();
    for (const v of enriched) {
      if (v.entry.status !== 'pendente') continue;
      if (v.ruleCategoryId || v.ruleLabel) continue;
      const key = nomeDoHistorico(v.entry.memo || '');
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    return [...map.entries()]
      .filter(([, items]) => items.length >= 2)
      .map(([key, items]) => {
        const positivas = items.filter(i => i.entry.amount >= 0).length;
        return {
          key,
          label: items[0].entry.memo || key,
          pattern: key.toUpperCase(),
          items,
          total: items.reduce((s, i) => s + Number(i.entry.amount), 0),
          appliesTo: (positivas === items.length ? 'receita'
            : positivas === 0 ? 'despesa' : 'ambos') as Sugestao['appliesTo'],
        };
      })
      .sort((a, b) => b.items.length - a.items.length);
  }, [enriched]);

  const visiveis = sugestoes.filter(s => !dispensadas.has(s.key));
  if (visiveis.length === 0) return null;

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex flex-wrap items-center gap-2">
          <Lightbulb className="h-4 w-4 text-accent" />
          Nomes repetidos sem regra
          <Badge variant="outline" className="text-[11px]">{visiveis.length} sugestão(ões)</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Estes nomes aparecem mais de uma vez nas linhas pendentes e ainda não têm regra.
          Quer criar a regra para que a próxima importação já venha classificada?
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {visiveis.slice(0, 15).map(s => (
          <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {s.pattern}
                <Badge variant="secondary" className="ml-2 text-[10px]">{s.items.length} linha(s)</Badge>
                <Badge variant="outline" className="ml-1 text-[10px]">{s.appliesTo}</Badge>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {s.label} · total {brl(s.total)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 rounded-xl text-[11px]"
                onClick={() => onCreateRule({
                  pattern: s.pattern,
                  appliesTo: s.appliesTo,
                  lineCount: s.items.length,
                })}
              >
                <Wand2 className="h-3 w-3" /> Criar regra
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Dispensar sugestão"
                onClick={() => setDispensadas(prev => new Set(prev).add(s.key))}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
