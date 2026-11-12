import { Copy, ExternalLink, Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { fmt, fmtDate, openTx } from './qualityFormat';
import { ReviewBadge } from './ReviewBadge';

export function DuplicatesSection() {
  const { q, applyPatch, deleteTransactions, setConfirm, setAllocTarget, rs, rnote, setReviewStatus, row, exportTxs, dupGroups } = useQualityCtx();
  return (
    <Section
      icon={Copy}
      title="Possíveis duplicidades"
      hint="Separadas por severidade. Nenhum registro é escolhido para exclusão automaticamente."
      count={dupGroups.filter((g) => g.severity !== 'legitimo').length}
      onExport={() => exportTxs('duplicados', q.duplicates.flatMap((g) => g.items), 'possível duplicado')}
    >
      <div className="divide-y divide-border">
        {dupGroups.slice(0, 40).map((g) => (
          <div key={g.key} className="p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={g.severity === 'forte' ? 'destructive' : g.severity === 'conferir' ? 'default' : 'secondary'}
              >
                {g.severity === 'forte' ? 'Duplicidade forte' : g.severity === 'conferir' ? 'Precisa conferir' : 'Provavelmente legítimo'}
              </Badge>
              <span className="text-xs text-muted-foreground">{g.items.length} lançamentos</span>
              <Button
                variant="outline" size="sm" className="h-7 text-xs ml-auto"
                onClick={() => g.items.forEach((t) => setReviewStatus(t.id, 'revisado'))}
              >
                Manter ambos (legítimo)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{g.reason}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {g.items.slice(0, 6).map((t) => (
                <div key={t.id} className="rounded-xl border border-border p-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-sm whitespace-nowrap">{fmt(t.net_amount)}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(t.competence_date)} • {t.unit_id ? q.unitNameById.get(t.unit_id) : 'Sem unidade'} •{' '}
                    {t.account_id ? q.accountNameById.get(t.account_id) : 'Sem conta'} • {t.status} • ID {t.id.slice(0, 8)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openTx(t)}>
                      <ExternalLink className="h-3 w-3" /> Abrir
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => setAllocTarget({
                        id: t.id,
                        description: t.description,
                        total: Number(t.net_amount) || 0,
                        competence_date: t.competence_date,
                        currentUnits: g.items.map((x) => (x.unit_id ? q.unitNameById.get(x.unit_id) || '—' : 'Sem unidade')),
                      })}
                    >
                      <Split className="h-3 w-3" /> Usar rateio
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setConfirm({
                        title: 'Cancelar lançamento',
                        summary: 'O lançamento passa para "cancelado" e sai dos relatórios, mas continua no histórico.',
                        impact: 'Sai do DRE, do Fluxo de Caixa e do Dashboard.',
                        rows: [row(t, `status: ${t.status}`, 'status: cancelado')],
                        confirmLabel: 'Cancelar lançamento',
                        onConfirm: () => applyPatch([t.id], { status: 'cancelado' }, 'Lançamento cancelado').then(() => {}),
                      })}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive" size="sm" className="h-7 text-xs"
                      onClick={() => setConfirm({
                        title: 'Excluir lançamento definitivamente',
                        summary: 'Somente este registro será removido. O outro lançamento do par permanece.',
                        impact: 'Some de todos os relatórios. Ação irreversível pela tela.',
                        rows: [row(t, 'existe no sistema', 'excluído')],
                        destructive: true,
                        requireTyped: 'EXCLUIR',
                        confirmLabel: 'Excluir definitivamente',
                        onConfirm: () => deleteTransactions([t.id]).then(() => {}),
                      })}
                    >
                      Excluir
                    </Button>
                    <ReviewBadge id={t.id} value={rs(t.id)} note={rnote(t.id)} onChange={setReviewStatus} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Manter ambos? Basta marcar como “Revisado” — nada é alterado.
            </p>
          </div>
        ))}
        {dupGroups.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum grupo suspeito no período.</p>}
      </div>
    </Section>
  );
}
