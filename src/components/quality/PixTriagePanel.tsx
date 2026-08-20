import { useMemo, useState } from 'react';
import { ArrowLeftRight, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePixTriage } from '@/hooks/usePixTriage';
import { useReviewActions } from '@/hooks/useReviewActions';
import ConfirmChangeDialog, { ConfirmChangePayload } from '@/components/quality/ConfirmChangeDialog';
import {
  PIX_NATURES,
  PIX_NATURE_BY_VALUE,
  PixNature,
  dreImpact,
  patchForNature,
  readNatureTag,
} from '@/lib/pixTriage';

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export default function PixTriagePanel({
  range,
  term = 'Martinho',
}: {
  range: { from: string; to: string };
  term?: string;
}) {
  const { rows, pairs, suggestions, classified, accountNameById, loading, reload } = usePixTriage(range, term);
  const { applyPatch, busy } = useReviewActions(reload);
  const [choices, setChoices] = useState<Record<string, PixNature>>({});
  const [confirm, setConfirm] = useState<ConfirmChangePayload | null>(null);
  const [open, setOpen] = useState(false);

  const effective = useMemo(() => {
    const map: Record<string, PixNature> = {};
    rows.forEach((t) => {
      map[t.id] = choices[t.id] ?? readNatureTag(t.notes) ?? suggestions[t.id]?.nature ?? 'venda';
    });
    return map;
  }, [rows, choices, suggestions]);

  const pending = useMemo(
    () =>
      rows.filter((t) => {
        const nature = effective[t.id];
        const def = PIX_NATURE_BY_VALUE[nature];
        const tagged = readNatureTag(t.notes);
        return tagged !== nature || (t.affects_dre !== false) !== def.affects_dre;
      }),
    [rows, effective]
  );

  const delta = useMemo(() => dreImpact(pending, effective), [pending, effective]);
  const total = rows.reduce((s, t) => s + (t.type === 'receita' ? t.net_amount : -t.net_amount), 0);

  const pairOf = useMemo(() => {
    const m = new Map<string, string>();
    pairs.forEach((p) => {
      m.set(p.inId, p.outId);
      m.set(p.outId, p.inId);
    });
    return m;
  }, [pairs]);

  const applySelection = (items: typeof rows) => {
    if (items.length === 0) return;
    setConfirm({
      title: 'Classificar natureza dos PIX',
      summary: `${items.length} lançamento(s) receberão a natureza escolhida. Nenhum valor, data ou conta é alterado.`,
      impact:
        delta === 0
          ? 'Sem mudança no resultado do DRE. O Fluxo de Caixa permanece igual.'
          : `Resultado do DRE muda em ${fmt(delta)}. O Fluxo de Caixa permanece igual — o dinheiro passou na conta de qualquer forma.`,
      rows: items.map((t) => {
        const nature = effective[t.id];
        return {
          id: t.id,
          description: t.description,
          value: fmt(t.net_amount),
          date: fmtDate(t.payment_date || t.competence_date),
          before: t.affects_dre !== false ? 'No DRE' : 'Fora do DRE',
          after: `${PIX_NATURE_BY_VALUE[nature].label} • ${
            PIX_NATURE_BY_VALUE[nature].affects_dre ? 'No DRE' : 'Fora do DRE'
          }`,
        };
      }),
      confirmLabel: 'Aplicar classificação',
      onConfirm: async () => {
        // Cada natureza vira um patch próprio (notes carrega a marca por lançamento).
        for (const t of items) {
          await applyPatch([t.id], patchForNature(t, effective[t.id]), 'Natureza classificada');
        }
        setChoices({});
      },
    });
  };

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl shrink-0 bg-warning/10">
            <ArrowLeftRight className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              PIX a classificar ({term})
              <Badge variant={pending.length > 0 ? 'destructive' : 'secondary'}>{pending.length}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {rows.length} PIX no período • líquido {fmt(total)} • {classified} já classificado(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Ocultar' : 'Ver'}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="p-0 border-t border-border">
          <Alert className="rounded-none border-x-0 border-t-0">
            <AlertDescription className="text-xs">
              A mesma origem traz vendas, remanejo entre contas e repasses de Stone/iFood. Classifique
              lançamento a lançamento: só a natureza <strong>venda</strong> permanece como receita no DRE.
              Todas continuam no Fluxo de Caixa.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-3 flex-wrap p-3 bg-muted/40 border-b border-border">
            <span className="text-xs text-muted-foreground">
              Impacto no DRE se aplicar tudo:{' '}
              <strong className={delta < 0 ? 'text-destructive' : 'text-foreground'}>{fmt(delta)}</strong>
            </span>
            {pairs.length > 0 && (
              <Badge variant="outline" className="text-[11px]">
                {pairs.length} par(es) entrada/saída detectado(s)
              </Badge>
            )}
            <Button
              size="sm"
              className="ml-auto"
              disabled={pending.length === 0 || busy}
              onClick={() => applySelection(pending)}
            >
              Aplicar {pending.length} classificação(ões)
            </Button>
          </div>

          <ScrollArea className="max-h-[520px]">
            <div className="divide-y divide-border">
              {rows.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Nenhum PIX encontrado no período.</p>
              )}
              {rows.map((t) => {
                const nature = effective[t.id];
                const tagged = readNatureTag(t.notes);
                const sug = suggestions[t.id];
                const partner = pairOf.get(t.id);
                return (
                  <div key={t.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-sm whitespace-nowrap">
                        {t.type === 'receita' ? '' : '- '}
                        {fmt(t.net_amount)}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(t.payment_date || t.competence_date)} •{' '}
                      {t.account_id ? accountNameById.get(t.account_id) ?? 'Conta' : 'Sem conta'} •{' '}
                      {t.affects_dre !== false ? 'hoje no DRE' : 'hoje fora do DRE'} • ID {t.id.slice(0, 8)}
                    </p>
                    {partner && (
                      <p className="text-[11px] text-warning">
                        Possível transferência: par com o lançamento {partner.slice(0, 8)} de mesmo valor.
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={nature}
                        onValueChange={(v: PixNature) => setChoices((p) => ({ ...p, [t.id]: v }))}
                      >
                        <SelectTrigger className="h-8 w-[280px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIX_NATURES.map((n) => (
                            <SelectItem key={n.value} value={n.value} className="text-xs">
                              {n.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {tagged ? (
                        <Badge variant="secondary" className="text-[11px]">Classificado</Badge>
                      ) : (
                        sug && (
                          <span className="text-[11px] text-muted-foreground">Sugestão: {sug.reason}</span>
                        )
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          window.open(
                            `/lancamentos?q=${encodeURIComponent(t.description)}`,
                            '_blank',
                            'noopener'
                          )
                        }
                      >
                        <ExternalLink className="h-3 w-3" /> Abrir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={busy}
                        onClick={() => applySelection([t])}
                      >
                        Aplicar só este
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {PIX_NATURE_BY_VALUE[nature].hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      )}

      <ConfirmChangeDialog payload={confirm} onClose={() => setConfirm(null)} busy={busy} />
    </Card>
  );
}