import { useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDreTransfers } from '@/hooks/useDreTransfers';
import { useReviewActions } from '@/hooks/useReviewActions';
import ConfirmChangeDialog, { ConfirmChangePayload } from '@/components/quality/ConfirmChangeDialog';
import { FinanceSnapshot } from '@/hooks/useFinanceSnapshot';

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');

/**
 * Linhas do grupo 6 (transferências, aportes, movimentações patrimoniais) que
 * ainda entram no DRE. Retirá-las não muda o Fluxo de Caixa.
 */
export default function DreTransfersPanel({
  range,
  snapshot,
  onApplied,
}: {
  range: { from: string; to: string };
  snapshot?: FinanceSnapshot;
  onApplied?: (entry: { label: string; delta: number }) => void;
}) {
  const { rows, accountNameById, loading, reload } = useDreTransfers(range);
  const { applyPatch, busy } = useReviewActions(reload);
  const [open, setOpen] = useState(false);
  const [onlyRelevant, setOnlyRelevant] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmChangePayload | null>(null);

  const visible = useMemo(
    () => (onlyRelevant ? rows.filter((r) => Math.abs(r.net_amount) >= 1) : rows),
    [rows, onlyRelevant]
  );

  const deltaOf = (items: typeof rows) =>
    items.reduce((s, r) => s + (r.type === 'receita' ? -r.net_amount : r.net_amount), 0);

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const remove = (items: typeof rows) => {
    if (items.length === 0) return;
    const d = deltaOf(items);
    setConfirm({
      title: 'Tirar do DRE',
      summary: `${items.length} lançamento(s) deixam de afetar o DRE. Valor, data, conta e status permanecem exatamente como estão.`,
      impact:
        `Resultado do DRE muda em ${fmt(d)}` +
        (snapshot ? ` (${fmt(snapshot.resultado)} → ${fmt(snapshot.resultado + d)})` : '') +
        `. Fluxo de Caixa permanece ${snapshot ? fmt(snapshot.liquido) : 'inalterado'}.`,
      rows: items.map((r) => ({
        id: r.id,
        description: `${r.description} • ${r.dreCode} ${r.dreName}`,
        value: fmt(r.net_amount),
        date: fmtDate(r.payment_date || r.competence_date),
        before: 'Afeta o DRE',
        after: 'Fora do DRE (segue no Caixa)',
      })),
      confirmLabel: 'Tirar do DRE',
      onConfirm: async () => {
        await applyPatch(items.map((r) => r.id), { affects_dre: false }, 'Transferência retirada do DRE');
        setSel(new Set());
        onApplied?.({ label: `${items.length} transferência(s) fora do DRE`, delta: d });
      },
    });
  };

  const selected = visible.filter((r) => sel.has(r.id));

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl shrink-0 bg-warning/10">
            <Landmark className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              Transferências ainda no DRE
              <Badge variant={visible.length > 0 ? 'destructive' : 'secondary'}>{visible.length}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Linhas do grupo 6 que hoje afetam o resultado • impacto total {fmt(deltaOf(visible))}
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
              Transferência entre contas não é receita nem despesa. Tirando do DRE, o resultado do mês
              deixa de contar dinheiro que só mudou de lugar — o extrato continua batendo.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-3 flex-wrap p-3 bg-muted/40 border-b border-border">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={onlyRelevant} onCheckedChange={(v) => setOnlyRelevant(!!v)} />
              Ocultar centavos (rendimentos abaixo de R$ 1,00)
            </label>
            <Button
              size="sm"
              className="ml-auto"
              disabled={selected.length === 0 || busy}
              onClick={() => remove(selected)}
            >
              Tirar {selected.length} do DRE
            </Button>
          </div>

          <ScrollArea className="max-h-[420px]">
            <div className="divide-y divide-border">
              {visible.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  Nenhuma transferência afetando o DRE no período.
                </p>
              )}
              {visible.map((r) => (
                <div key={r.id} className="p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium truncate">{r.description}</p>
                        <p className="text-sm whitespace-nowrap">
                          {r.type === 'receita' ? '' : '- '}
                          {fmt(r.net_amount)}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(r.payment_date || r.competence_date)} •{' '}
                        {r.account_id ? accountNameById.get(r.account_id) ?? 'Conta' : 'Sem conta'} •{' '}
                        {r.categoryName} • DRE {r.dreCode} {r.dreName} • ID {r.id.slice(0, 8)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Impacto se tirar: <strong>{fmt(deltaOf([r]))}</strong>
                        {snapshot && (
                          <> • Resultado {fmt(snapshot.resultado)} → {fmt(snapshot.resultado + deltaOf([r]))}</>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs gap-1"
                          onClick={() =>
                            window.open(`/lancamentos?q=${encodeURIComponent(r.description)}`, '_blank', 'noopener')
                          }
                        >
                          <ExternalLink className="h-3 w-3" /> Abrir
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => remove([r])}
                        >
                          Tirar só este
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      )}

      <ConfirmChangeDialog payload={confirm} onClose={() => setConfirm(null)} busy={busy} />
    </Card>
  );
}