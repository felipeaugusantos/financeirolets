import { FlaskConical, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QualitySection as Section } from './QualitySection';
import { useQualityCtx } from './qualityContext';
import { fmt, fmtDate, openTx } from './qualityFormat';
import { ReviewBadge } from './ReviewBadge';

export function TestSuspectsSection() {
  const { q, applyPatch, deleteTransactions, setConfirm, rs, rnote, setReviewStatus, row, exportTxs } = useQualityCtx();
  return (
    <Section
      icon={FlaskConical}
      title="Possíveis lançamentos de teste"
      hint="Descrição sugere teste/demo. Nada é excluído nem cancelado sem sua confirmação."
      count={q.testSuspects.length}
      tone="destructive"
      onExport={() => exportTxs('teste', q.testSuspects, 'possível lançamento de teste')}
    >
      <div className="divide-y divide-border">
        {q.testSuspects.map((t) => (
          <div key={t.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{t.description}</p>
              <p className="text-sm">{fmt(t.net_amount)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {fmtDate(t.competence_date)} • {t.type} / {t.status} • ID {t.id.slice(0, 8)}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openTx(t)}>
                <ExternalLink className="h-3 w-3" /> Abrir lançamento
              </Button>
              <Button
                variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setConfirm({
                  title: 'Cancelar lançamento',
                  summary: 'O lançamento passa para o status "cancelado" e sai dos relatórios, mas continua no histórico.',
                  impact: 'Sai do DRE, do Fluxo de Caixa e do Dashboard. Valor, data e conta permanecem inalterados.',
                  rows: [row(t, `status: ${t.status}`, 'status: cancelado')],
                  confirmLabel: 'Cancelar lançamento',
                  onConfirm: () => applyPatch([t.id], { status: 'cancelado' }, 'Lançamento cancelado').then(() => {}),
                })}
              >
                Cancelar lançamento
              </Button>
              <Button
                variant="destructive" size="sm" className="h-7 text-xs"
                onClick={() => setConfirm({
                  title: 'Excluir lançamento definitivamente',
                  summary: 'O registro será removido do banco. A exclusão fica registrada na Auditoria.',
                  impact: 'Some de todos os relatórios e do histórico de lançamentos. Ação irreversível pela tela.',
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
        {q.testSuspects.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
      </div>
    </Section>
  );
}
