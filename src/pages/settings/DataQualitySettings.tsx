import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDataQuality, QualityTx } from '@/hooks/useDataQuality';
import { useReviewActions, useReviewStatus, ReviewStatus } from '@/hooks/useReviewActions';
import ConfirmChangeDialog, { ConfirmChangePayload } from '@/components/quality/ConfirmChangeDialog';
import AllocationAssistant, { AllocationTarget } from '@/components/quality/AllocationAssistant';
import PixTriagePanel from '@/components/quality/PixTriagePanel';
import DreTransfersPanel from '@/components/quality/DreTransfersPanel';
import { useFinanceSnapshot } from '@/hooks/useFinanceSnapshot';
import { classifyDuplicate, SuggestTx } from '@/lib/reviewSuggestions';
import { exportToCsv, csvNumber, csvDate, CsvCell } from '@/lib/exportCsv';
import { toLocalISODate, todayLocalISO } from '@/lib/utils';
import { fmt, fmtDate, REVIEW_LABEL } from '@/components/quality/qualityFormat';
import { QualityContext, type QualityCtx } from '@/components/quality/qualityContext';
import { TestSuspectsSection } from '@/components/quality/TestSuspectsSection';
import { TransfersInDreSection } from '@/components/quality/TransfersInDreSection';
import { OrphanCategoriesSection } from '@/components/quality/OrphanCategoriesSection';
import { TypeStatusSection } from '@/components/quality/TypeStatusSection';
import { DuplicatesSection } from '@/components/quality/DuplicatesSection';
import { SemCategoriaSection } from '@/components/quality/SemCategoriaSection';
import { SemUnidadeSection } from '@/components/quality/SemUnidadeSection';
import { PagoSemDataSection } from '@/components/quality/PagoSemDataSection';
import { ForaDoDreSection, ForaDoCaixaSection, AllocationIssuesSection, SemFornecedorSection, DreLinesSection } from '@/components/quality/ReadOnlySections';

export default function DataQualitySettings({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState({
    from: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    to: todayLocalISO(),
  });
  const q = useDataQuality(range);
  const { applyPatch, deleteTransactions, saveAllocations, busy } = useReviewActions(q.reload);
  const { reviewStatus, setReviewStatus, reloadReviews, reviewsLoading } = useReviewStatus();
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | 'todos'>('pendente');
  const [confirm, setConfirm] = useState<ConfirmChangePayload | null>(null);
  const [allocTarget, setAllocTarget] = useState<AllocationTarget | null>(null);

  // seleção por bloco
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const selected = (block: string) => sel[block] ?? new Set<string>();
  const toggle = (block: string, id: string) =>
    setSel((p) => {
      const s = new Set(p[block] ?? []);
      if (s.has(id)) s.delete(id); else s.add(id);
      return { ...p, [block]: s };
    });
  const setAll = (block: string, ids: string[], on: boolean) =>
    setSel((p) => ({ ...p, [block]: on ? new Set(ids) : new Set() }));

  const rs = (id: string): ReviewStatus => reviewStatus[id]?.status ?? 'pendente';
  const rnote = (id: string): string | null => reviewStatus[id]?.note ?? null;
  const passesReview = (id: string) => reviewFilter === 'todos' || rs(id) === reviewFilter;

  const reviewCounts = useMemo(() => {
    const all = new Set<string>([
      ...q.semCategoria.map((t) => t.id),
      ...q.semUnidade.map((t) => t.id),
      ...q.typeStatusMismatch.map((t) => t.id),
      ...q.foraDoDre.map((t) => t.id),
      ...q.pagoSemData.map((t) => t.id),
    ]);
    const c: Record<ReviewStatus | 'todos', number> = {
      todos: all.size, pendente: 0, revisado: 0, corrigido: 0, ignorado: 0,
    };
    all.forEach((id) => { c[rs(id)] += 1; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.semCategoria, q.semUnidade, q.typeStatusMismatch, q.foraDoDre, q.pagoSemData, reviewStatus]);

  const row = (t: QualityTx, before: string, after: string) => ({
    id: t.id,
    description: t.description,
    value: fmt(t.net_amount),
    date: fmtDate(t.competence_date),
    before,
    after,
  });

  // filtros do bloco "sem unidade"
  const [unitFilters, setUnitFilters] = useState({ desc: '', cat: '', account: '', min: '' });
  const [bulkUnit, setBulkUnit] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [payDates, setPayDates] = useState<Record<string, string>>({});

  const semUnidadeFiltrado = useMemo(() => {
    return q.semUnidade.filter((t) => {
      if (unitFilters.desc && !t.description.toLowerCase().includes(unitFilters.desc.toLowerCase())) return false;
      if (unitFilters.cat && t.category_id !== unitFilters.cat) return false;
      if (unitFilters.account && t.account_id !== unitFilters.account) return false;
      if (unitFilters.min && Math.abs(t.net_amount) < parseFloat(unitFilters.min.replace(',', '.'))) return false;
      return true;
    });
  }, [q.semUnidade, unitFilters]);

  const dupGroups = useMemo(
    () => q.duplicates.map((g) => ({ ...g, ...classifyDuplicate(g.items as unknown as SuggestTx[]) })),
    [q.duplicates]
  );

  // ---- Trava de caixa + histórico da sessão -------------------------------
  // O caixa de julho já está conciliado com os extratos. Qualquer correção de
  // DRE feita nesta tela deve manter o líquido do período idêntico.
  const { snapshot, loading: snapLoading, reload: reloadSnapshot } = useFinanceSnapshot(range);
  const baselineCash = useRef<number | null>(null);
  const [sessionLog, setSessionLog] = useState<{ label: string; delta: number; at: string }[]>([]);

  useEffect(() => {
    baselineCash.current = null;
  }, [range.from, range.to]);

  useEffect(() => {
    if (!snapLoading && baselineCash.current === null) baselineCash.current = snapshot.liquido;
  }, [snapLoading, snapshot.liquido]);

  const cashDrift = baselineCash.current === null ? 0 : snapshot.liquido - baselineCash.current;
  const cashOk = Math.abs(cashDrift) < 0.005;

  const registerChange = (entry: { label: string; delta: number }) => {
    setSessionLog((l) => [
      { ...entry, at: new Date().toLocaleTimeString('pt-BR') },
      ...l,
    ]);
    reloadSnapshot();
    q.reload();
  };

  const exportTxs = (name: string, items: QualityTx[], problem: string) => {
    const headers = ['ID', 'Competência', 'Descrição', 'Tipo', 'Status', 'Valor Líquido', 'Vencimento', 'Pagamento', 'Problema'];
    const rows: CsvCell[][] = items.map((t) => [
      t.id, csvDate(t.competence_date), t.description, t.type, t.status,
      csvNumber(t.net_amount), csvDate(t.due_date), csvDate(t.payment_date), problem,
    ]);
    exportToCsv(`conferencia_${name}_${todayLocalISO()}.csv`, headers, rows);
  };

  const ctx: QualityCtx = {
    q, applyPatch, deleteTransactions, setConfirm, setAllocTarget, selected, toggle, setAll, rs, rnote, passesReview,
    setReviewStatus, row, exportTxs, bulkCategory, setBulkCategory, unitFilters, setUnitFilters, bulkUnit, setBulkUnit,
    semUnidadeFiltrado, payDates, setPayDates, dupGroups,
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div>
        <h2 className="font-heading text-xl font-bold text-card-foreground">Conferência de lançamentos</h2>
        <p className="text-sm text-muted-foreground">
          Identifica problemas, sugere a correção e só altera depois que você revisar e confirmar.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Nenhuma correção é aplicada automaticamente. Toda ação abre uma confirmação com{' '}
          <strong>antes</strong>, <strong>depois</strong> e <strong>impacto</strong>, e fica registrada na
          Auditoria (quem, quando, valores anteriores e novos).
        </AlertDescription>
      </Alert>

      <Card className="shadow-card rounded-2xl border-border">
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Competência de</Label>
            <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">até</Label>
            <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => { q.reload(); reloadReviews(); }}
              disabled={q.loading || reviewsLoading}
            >
              {q.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Situação da conferência</Label>
            <Select value={reviewFilter} onValueChange={(v) => setReviewFilter(v as ReviewStatus | 'todos')}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente" className="text-xs">Pendente ({reviewCounts.pendente})</SelectItem>
                <SelectItem value="revisado" className="text-xs">Revisado ({reviewCounts.revisado})</SelectItem>
                <SelectItem value="corrigido" className="text-xs">Corrigido ({reviewCounts.corrigido})</SelectItem>
                <SelectItem value="ignorado" className="text-xs">Ignorado ({reviewCounts.ignorado})</SelectItem>
                <SelectItem value="todos" className="text-xs">Todos ({reviewCounts.todos})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardContent className="pt-0 flex flex-wrap gap-2">
          {(['pendente', 'revisado', 'corrigido', 'ignorado'] as ReviewStatus[]).map((s) => (
            <Badge key={s} variant={s === 'pendente' ? 'destructive' : 'secondary'} className="text-[11px]">
              {REVIEW_LABEL[s]}: {reviewCounts[s]}
            </Badge>
          ))}
          <Badge variant="outline" className="text-[11px]">Total analisado: {reviewCounts.todos}</Badge>
        </CardContent>
      </Card>

      {q.loading ? (
        <p className="text-sm text-muted-foreground">Analisando lançamentos...</p>
      ) : (
        <QualityContext.Provider value={ctx}>
        <div className="space-y-3">
          {/* Painel ao vivo: DRE muda, caixa não pode mudar */}
          <Card className="shadow-card rounded-2xl border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-sm font-heading">
                Situação do período ({fmtDate(range.from)} a {fmtDate(range.to)})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={reloadSnapshot} disabled={snapLoading}>
                {snapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Receita (DRE)', value: snapshot.receita },
                  { label: 'Despesa (DRE)', value: snapshot.despesa },
                  { label: 'Resultado (DRE)', value: snapshot.resultado },
                  { label: 'Caixa líquido', value: snapshot.liquido },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-border p-3">
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className="text-sm font-semibold">{fmt(k.value)}</p>
                  </div>
                ))}
              </div>
              <Alert variant={cashOk ? 'default' : 'destructive'}>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {cashOk ? (
                    <>
                      Trava de caixa ativa: o líquido do período segue em{' '}
                      <strong>{fmt(snapshot.liquido)}</strong>, idêntico ao início desta conferência. As
                      correções aqui mexem só no DRE.
                    </>
                  ) : (
                    <>
                      Atenção: o caixa do período mudou em <strong>{fmt(cashDrift)}</strong> desde o início
                      desta conferência. Revise a última correção antes de continuar — o extrato já estava
                      conciliado.
                    </>
                  )}
                </AlertDescription>
              </Alert>
              {sessionLog.length > 0 && (
                <div className="rounded-xl border border-border divide-y divide-border">
                  {sessionLog.map((e, i) => (
                    <p key={i} className="p-2 text-[11px] text-muted-foreground">
                      {e.at} • {e.label} • impacto no resultado {fmt(e.delta)}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <PixTriagePanel range={range} snapshot={snapshot} onApplied={registerChange} />
          <DreTransfersPanel range={range} snapshot={snapshot} onApplied={registerChange} />
          {/* 2 — Lançamentos de teste */}
          <TestSuspectsSection />

          {/* 4 — Transferências no DRE */}
          <TransfersInDreSection />

          {/* 3 — Categorias sem linha de DRE */}
          <OrphanCategoriesSection />

          {/* 5 — Tipo x status */}
          <TypeStatusSection />

          {/* 6/7 — Duplicidades + rateio */}
          <DuplicatesSection />

          {/* 8 — Sem categoria */}
          <SemCategoriaSection />

          {/* 9 — Sem unidade */}
          <SemUnidadeSection />

          {/* 10 — Pagos sem data */}
          <PagoSemDataSection />

          {/* Blocos informativos (somente leitura) */}
          <ForaDoDreSection />

          <ForaDoCaixaSection />

          <AllocationIssuesSection />

          <SemFornecedorSection />

          <DreLinesSection />
        </div>
        </QualityContext.Provider>
      )}

      <ConfirmChangeDialog payload={confirm} onClose={() => setConfirm(null)} busy={busy} />
      <AllocationAssistant
        target={allocTarget}
        units={q.units}
        fronts={q.fronts}
        busy={busy}
        onClose={() => setAllocTarget(null)}
        onSave={saveAllocations}
      />
    </div>
  );
}
