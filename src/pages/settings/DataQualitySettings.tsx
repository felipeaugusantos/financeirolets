import { useMemo, useState } from 'react';
import {
  ArrowLeft, AlertTriangle, Copy, Tag, Building2, EyeOff, CalendarX, Users, Loader2,
  RefreshCw, FlaskConical, ArrowLeftRight, ExternalLink, ShieldCheck, Split,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDataQuality, QualityTx } from '@/hooks/useDataQuality';
import { useReviewActions, useReviewStatus, ReviewStatus, ReviewEntry } from '@/hooks/useReviewActions';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import ConfirmChangeDialog, { ConfirmChangePayload } from '@/components/quality/ConfirmChangeDialog';
import AllocationAssistant, { AllocationTarget } from '@/components/quality/AllocationAssistant';
import {
  classifyDuplicate, suggestCategory, suggestStatus, suggestUnitLabel, SuggestTx,
} from '@/lib/reviewSuggestions';
import { exportToCsv, csvNumber, csvDate, CsvCell } from '@/lib/exportCsv';
import { toLocalISODate, todayLocalISO } from '@/lib/utils';

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const openTx = (t: QualityTx) =>
  window.open(`/lancamentos?q=${encodeURIComponent(t.description)}`, '_blank', 'noopener');

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pendente: 'Pendente',
  revisado: 'Revisado',
  corrigido: 'Corrigido',
  ignorado: 'Ignorado conscientemente',
};

function ReviewBadge({
  id, value, note, onChange,
}: {
  id: string; value: ReviewStatus; note?: string | null;
  onChange: (id: string, s: ReviewStatus, note?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<ReviewStatus>(value);

  const openNote = (status: ReviewStatus) => {
    setPending(status);
    setDraft(note ?? '');
    setOpen(true);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Select
        value={value}
        onValueChange={(v: ReviewStatus) => (v === 'ignorado' ? openNote(v) : onChange(id, v))}
      >
        <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{REVIEW_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openNote(value)}>
        {note ? 'Nota ✓' : 'Nota'}
      </Button>
      {note && <span className="text-[11px] text-muted-foreground truncate max-w-[220px]" title={note}>{note}</span>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Nota da conferência</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {pending === 'ignorado'
              ? 'Explique por que este alerta será ignorado (recomendado).'
              : 'Registro opcional, ex.: "Conferido com extrato em 14/08/2026".'}
          </p>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                onChange(id, pending, draft.trim() || null);
                setOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  icon: Icon, title, hint, count, children, onExport, tone = 'warning',
}: {
  icon: any; title: string; hint: string; count: number;
  children: React.ReactNode; onExport?: () => void; tone?: 'warning' | 'destructive' | 'muted';
}) {
  const [open, setOpen] = useState(false);
  const bg = tone === 'destructive' ? 'bg-destructive/10' : tone === 'muted' ? 'bg-muted' : 'bg-warning/10';
  const fg = tone === 'destructive' ? 'text-destructive' : tone === 'muted' ? 'text-muted-foreground' : 'text-warning';
  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 ${bg}`}><Icon className={`h-5 w-5 ${fg}`} /></div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              {title}
              <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{count}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onExport && count > 0 && <Button variant="outline" size="sm" onClick={onExport}>CSV</Button>}
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Ocultar' : 'Ver'}</Button>
        </div>
      </CardHeader>
      {open && <CardContent className="p-0 border-t border-border">{children}</CardContent>}
    </Card>
  );
}

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
      s.has(id) ? s.delete(id) : s.add(id);
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

  const exportTxs = (name: string, items: QualityTx[], problem: string) => {
    const headers = ['ID', 'Competência', 'Descrição', 'Tipo', 'Status', 'Valor Líquido', 'Vencimento', 'Pagamento', 'Problema'];
    const rows: CsvCell[][] = items.map((t) => [
      t.id, csvDate(t.competence_date), t.description, t.type, t.status,
      csvNumber(t.net_amount), csvDate(t.due_date), csvDate(t.payment_date), problem,
    ]);
    exportToCsv(`conferencia_${name}_${todayLocalISO()}.csv`, headers, rows);
  };

  const SelRow = ({ block, t, extra }: { block: string; t: QualityTx; extra?: React.ReactNode }) => {
    if (!passesReview(t.id)) return null;
    return (
    <div className="p-3 space-y-2">
      <div className="flex items-start gap-3">
        <Checkbox checked={selected(block).has(t.id)} onCheckedChange={() => toggle(block, t.id)} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium truncate">{t.description}</p>
            <p className="text-sm whitespace-nowrap">{fmt(t.net_amount)}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fmtDate(t.competence_date)} • {t.type} / {t.status}
            {t.account_id ? ` • ${q.accountNameById.get(t.account_id) ?? 'Conta'}` : ''}
            {t.category_id ? ` • ${q.categoryNameById.get(t.category_id) ?? 'Categoria'}` : ' • Sem categoria'}
            {t.unit_id ? ` • ${q.unitNameById.get(t.unit_id) ?? 'Unidade'}` : ' • Sem unidade'}
            {` • ID ${t.id.slice(0, 8)}`}
          </p>
          {extra}
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openTx(t)}>
              <ExternalLink className="h-3 w-3" /> Abrir lançamento
            </Button>
            <ReviewBadge id={t.id} value={rs(t.id)} note={rnote(t.id)} onChange={setReviewStatus} />
          </div>
        </div>
      </div>
    </div>
    );
  };

  const BulkBar = ({ block, ids, children }: { block: string; ids: string[]; children?: React.ReactNode }) => (
    <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/40 border-b border-border">
      <Checkbox
        checked={ids.length > 0 && selected(block).size === ids.length}
        onCheckedChange={(v) => setAll(block, ids, !!v)}
      />
      <span className="text-xs text-muted-foreground">
        Selecionar todos ({selected(block).size}/{ids.length})
      </span>
      <div className="ml-auto flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );

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
            <Select value={reviewFilter} onValueChange={(v: any) => setReviewFilter(v)}>
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
        <div className="space-y-3">
          {/* 2 — Lançamentos de teste */}
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

          {/* 4 — Transferências no DRE */}
          <Section
            icon={ArrowLeftRight}
            title="Transferências entrando no DRE"
            hint="Movimentações entre contas com affects_dre = true, inflando o resultado."
            count={q.transfersInDre.length}
            onExport={() => exportTxs('transferencias_dre', q.transfersInDre, 'transferência com affects_dre = true')}
          >
            <BulkBar block="transf" ids={q.transfersInDre.map((t) => t.id)}>
              <Button
                size="sm" className="h-7 text-xs"
                disabled={selected('transf').size === 0}
                onClick={() => {
                  const ids = Array.from(selected('transf'));
                  const items = q.transfersInDre.filter((t) => ids.includes(t.id));
                  setConfirm({
                    title: `Remover ${ids.length} transferência(s) do DRE`,
                    summary: 'Esta ação altera apenas a participação do lançamento no DRE. Valor, data, conta e histórico financeiro permanecem inalterados.',
                    impact: 'Os lançamentos deixam de compor o DRE (e o DRE Comparativo). O Fluxo de Caixa continua igual.',
                    rows: items.map((t) => row(t, 'affects_dre: true', 'affects_dre: false')),
                    confirmLabel: 'Remover do DRE',
                    onConfirm: () => applyPatch(ids, { affects_dre: false }, 'Removidos do DRE').then(() => {}),
                  });
                }}
              >
                Remover do DRE ({selected('transf').size})
              </Button>
            </BulkBar>
            <div className="divide-y divide-border">
              {q.transfersInDre.slice(0, 200).map((t) => (
                <SelRow
                  key={t.id} block="transf" t={t}
                  extra={
                    <p className="text-[11px] text-primary pt-1">
                      Sugestão: remover do DRE (affects_dre: true → false). {t.type === 'receita' ? 'Entrada' : 'Saída'}.
                    </p>
                  }
                />
              ))}
              {q.transfersInDre.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
            </div>
          </Section>

          {/* 3 — Categorias sem linha de DRE */}
          <Section
            icon={Tag}
            title="Categorias sem linha de DRE"
            hint="Cada lançamento é mostrado individualmente — nada é remapeado em bloco."
            count={q.orphanCategoryGroups.reduce((s, g) => s + g.items.length, 0)}
            onExport={() => exportTxs('sem_linha_dre', q.orphanCategoryGroups.flatMap((g) => g.items), 'categoria sem linha de DRE')}
          >
            <div className="divide-y divide-border">
              {q.orphanCategoryGroups.map((g) => {
                const block = `orphan-${g.categoryId}`;
                const ids = g.items.map((t) => t.id);
                return (
                  <div key={g.categoryId}>
                    <div className="p-3 bg-muted/40">
                      <p className="text-sm font-medium">{g.categoryName} • {g.items.length} lançamento(s)</p>
                      {g.categoryName.toLowerCase().includes('empréstimo') && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Verifique se o valor representa principal do empréstimo, juros ou ambos. O principal
                            de empréstimo não deve entrar automaticamente no resultado como despesa operacional.
                          </AlertDescription>
                        </Alert>
                      )}
                      {g.categoryName.toLowerCase().includes('sem id') && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Os lançamentos aqui têm naturezas diferentes. Reclassifique um a um; use seleção
                          múltipla apenas depois de conferir que são realmente iguais.
                        </p>
                      )}
                    </div>
                    <BulkBar block={block} ids={ids}>
                      <Select value={bulkCategory} onValueChange={setBulkCategory}>
                        <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder="Nova categoria" /></SelectTrigger>
                        <SelectContent>
                          {q.categories.filter((c) => c.dre_line_id).map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm" className="h-7 text-xs"
                        disabled={selected(block).size === 0 || !bulkCategory}
                        onClick={() => {
                          const sels = Array.from(selected(block));
                          const items = g.items.filter((t) => sels.includes(t.id));
                          const newName = q.categoryNameById.get(bulkCategory) ?? 'categoria';
                          setConfirm({
                            title: `Reclassificar ${sels.length} lançamento(s)`,
                            summary: `A categoria dos selecionados passa para "${newName}". Valor, data, conta e status não mudam.`,
                            impact: 'Os lançamentos passam a compor a linha de DRE dessa categoria.',
                            rows: items.map((t) => row(t, `categoria: ${g.categoryName}`, `categoria: ${newName}`)),
                            confirmLabel: 'Reclassificar',
                            onConfirm: () => applyPatch(sels, { category_id: bulkCategory }, 'Categoria atualizada').then(() => {}),
                          });
                        }}
                      >
                        Aplicar aos selecionados ({selected(block).size})
                      </Button>
                    </BulkBar>
                    <div className="divide-y divide-border">
                      {g.items.slice(0, 200).map((t) => {
                        const s = suggestCategory(t.description);
                        return (
                          <SelRow
                            key={t.id} block={block} t={t}
                            extra={
                              <p className={`text-[11px] pt-1 ${s.lowConfidence ? 'text-warning' : 'text-primary'}`}>
                                {s.categoryName ? `Sugestão: ${s.categoryName}. ` : ''}
                                {s.reason}
                                {s.lowConfidence ? ' — Revisão manual necessária.' : ''}
                              </p>
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {q.orphanCategoryGroups.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
            </div>
          </Section>

          {/* 5 — Tipo x status */}
          <Section
            icon={AlertTriangle}
            title="Tipo x status incompatível"
            hint="Receita marcada como pago, despesa marcada como recebido."
            count={q.typeStatusMismatch.length}
            onExport={() => exportTxs('tipo_status', q.typeStatusMismatch, 'tipo/status incompatível')}
          >
            <BulkBar block="ts" ids={q.typeStatusMismatch.map((t) => t.id)}>
              <Button
                size="sm" className="h-7 text-xs"
                disabled={selected('ts').size === 0}
                onClick={() => {
                  const ids = Array.from(selected('ts'));
                  const items = q.typeStatusMismatch.filter((t) => ids.includes(t.id));
                  setConfirm({
                    title: `Corrigir status de ${ids.length} lançamento(s)`,
                    summary: 'Apenas o status é alterado. Tipo, valor, data e categoria permanecem exatamente como estão.',
                    impact: 'Relatórios que separam realizado por tipo passam a classificar corretamente estes lançamentos.',
                    rows: items.map((t) => row(t, `status: ${t.status}`, `status: ${suggestStatus(t)}`)),
                    confirmLabel: 'Aplicar correção',
                    onConfirm: async () => {
                      for (const t of items) {
                        const next = suggestStatus(t);
                        if (next) await applyPatch([t.id], { status: next }, 'Status corrigido');
                      }
                    },
                  });
                }}
              >
                Aplicar sugestão ({selected('ts').size})
              </Button>
            </BulkBar>
            <div className="divide-y divide-border">
              {q.typeStatusMismatch.slice(0, 200).map((t) => (
                <SelRow
                  key={t.id} block="ts" t={t}
                  extra={
                    <p className="text-[11px] text-primary pt-1">
                      {t.type === 'receita' ? 'Receita' : 'Despesa'} | status atual: {t.status} → Sugestão: {suggestStatus(t)}
                    </p>
                  }
                />
              ))}
              {q.typeStatusMismatch.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
            </div>
          </Section>

          {/* 6/7 — Duplicidades + rateio */}
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

          {/* 8 — Sem categoria */}
          <Section
            icon={Tag}
            title="Sem categoria"
            hint="Sugestões são apenas recomendação; nada vem pré-selecionado."
            count={q.semCategoria.length}
            onExport={() => exportTxs('sem_categoria', q.semCategoria, 'sem categoria')}
          >
            <BulkBar block="semcat" ids={q.semCategoria.map((t) => t.id)}>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {q.categories.filter((c) => c.active !== false).map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm" className="h-7 text-xs"
                disabled={selected('semcat').size === 0 || !bulkCategory}
                onClick={() => {
                  const ids = Array.from(selected('semcat'));
                  const items = q.semCategoria.filter((t) => ids.includes(t.id));
                  const newName = q.categoryNameById.get(bulkCategory) ?? 'categoria';
                  setConfirm({
                    title: `Definir categoria em ${ids.length} lançamento(s)`,
                    summary: `Os selecionados passam a usar a categoria "${newName}".`,
                    impact: 'Os lançamentos passam a compor a linha de DRE dessa categoria.',
                    rows: items.map((t) => row(t, 'categoria: (vazia)', `categoria: ${newName}`)),
                    confirmLabel: 'Definir categoria',
                    onConfirm: () => applyPatch(ids, { category_id: bulkCategory }, 'Categoria definida').then(() => {}),
                  });
                }}
              >
                Aplicar aos selecionados ({selected('semcat').size})
              </Button>
            </BulkBar>
            <div className="divide-y divide-border">
              {q.semCategoria.slice(0, 200).map((t) => {
                const s = suggestCategory(t.description);
                return (
                  <SelRow
                    key={t.id} block="semcat" t={t}
                    extra={
                      <p className={`text-[11px] pt-1 ${s.lowConfidence ? 'text-warning' : 'text-primary'}`}>
                        {s.categoryName ? `Sugestão: ${s.categoryName}. ` : ''}
                        {s.reason}
                        {s.lowConfidence ? ' — Revisão manual necessária.' : ''}
                      </p>
                    }
                  />
                );
              })}
              {q.semCategoria.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
            </div>
          </Section>

          {/* 9 — Sem unidade */}
          <Section
            icon={Building2}
            title="Sem unidade e sem rateio"
            hint="Filtre, selecione e confirme. Nenhuma unidade é atribuída automaticamente."
            count={q.semUnidade.length}
            onExport={() => exportTxs('sem_unidade', semUnidadeFiltrado, 'sem unidade/rateio')}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 border-b border-border">
              <Input placeholder="Descrição" className="h-8 text-xs" value={unitFilters.desc}
                onChange={(e) => setUnitFilters((f) => ({ ...f, desc: e.target.value }))} />
              <Select value={unitFilters.cat || 'all'} onValueChange={(v) => setUnitFilters((f) => ({ ...f, cat: v === 'all' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todas as categorias</SelectItem>
                  {q.categories.map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={unitFilters.account || 'all'} onValueChange={(v) => setUnitFilters((f) => ({ ...f, account: v === 'all' ? '' : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todas as contas</SelectItem>
                  {q.accounts.map((a) => <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Valor mínimo" className="h-8 text-xs" inputMode="decimal" value={unitFilters.min}
                onChange={(e) => setUnitFilters((f) => ({ ...f, min: e.target.value }))} />
            </div>
            <BulkBar block="semuni" ids={semUnidadeFiltrado.map((t) => t.id)}>
              <Select value={bulkUnit} onValueChange={setBulkUnit}>
                <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  {q.units.map((u) => <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm" className="h-7 text-xs"
                disabled={selected('semuni').size === 0 || !bulkUnit}
                onClick={() => {
                  const ids = Array.from(selected('semuni'));
                  const items = semUnidadeFiltrado.filter((t) => ids.includes(t.id));
                  const newName = q.unitNameById.get(bulkUnit) ?? 'unidade';
                  setConfirm({
                    title: `Atribuir unidade a ${ids.length} lançamento(s)`,
                    summary: `Os selecionados passam para a unidade "${newName}". Valor, data e categoria não mudam.`,
                    impact: 'Os valores deixam de aparecer como "Sem unidade" no DRE Comparativo e nos filtros por unidade.',
                    rows: items.map((t) => row(t, 'unidade: (vazia)', `unidade: ${newName}`)),
                    confirmLabel: 'Atribuir unidade',
                    onConfirm: () => applyPatch(ids, { unit_id: bulkUnit }, 'Unidade atribuída').then(() => {}),
                  });
                }}
              >
                Atribuir aos selecionados ({selected('semuni').size})
              </Button>
            </BulkBar>
            <div className="divide-y divide-border">
              {semUnidadeFiltrado.slice(0, 200).map((t) => {
                const hint = suggestUnitLabel(t as unknown as SuggestTx, t.category_id ? q.categoryNameById.get(t.category_id) : undefined);
                return (
                  <SelRow
                    key={t.id} block="semuni" t={t}
                    extra={hint ? <p className="text-[11px] text-primary pt-1">Sugestão provável: {hint} — exige sua confirmação.</p> : undefined}
                  />
                );
              })}
              {semUnidadeFiltrado.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso com os filtros atuais.</p>}
            </div>
          </Section>

          {/* 10 — Pagos sem data */}
          <Section
            icon={CalendarX}
            title="Pagos sem data de pagamento"
            hint="Informe a data manualmente. Competência e vencimento são apenas referência."
            count={q.pagoSemData.length}
            onExport={() => exportTxs('pago_sem_data', q.pagoSemData, 'pago sem data de pagamento')}
          >
            <div className="divide-y divide-border">
              {q.pagoSemData.map((t) => (
                <div key={t.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-sm whitespace-nowrap">{fmt(t.net_amount)}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Competência {fmtDate(t.competence_date)} • Vencimento {fmtDate(t.due_date)} • {t.status} • ID {t.id.slice(0, 8)}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="date" className="h-8 w-44 text-xs"
                      value={payDates[t.id] || ''}
                      onChange={(e) => setPayDates((p) => ({ ...p, [t.id]: e.target.value }))}
                    />
                    <Button
                      size="sm" className="h-8 text-xs" disabled={!payDates[t.id]}
                      onClick={() => setConfirm({
                        title: 'Informar data de pagamento',
                        summary: 'Somente a data de pagamento é preenchida, com o valor que você digitou.',
                        impact: 'O lançamento passa a aparecer no Fluxo de Caixa realizado e no DRE em regime de caixa nesse mês.',
                        rows: [row(t, 'pagamento: (vazio)', `pagamento: ${fmtDate(payDates[t.id])}`)],
                        confirmLabel: 'Salvar data',
                        onConfirm: () => applyPatch([t.id], { payment_date: payDates[t.id] }, 'Data de pagamento informada').then(() => {}),
                      })}
                    >
                      Salvar data informada
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openTx(t)}>
                      <ExternalLink className="h-3 w-3" /> Abrir lançamento
                    </Button>
                    <ReviewBadge id={t.id} value={rs(t.id)} note={rnote(t.id)} onChange={setReviewStatus} />
                  </div>
                </div>
              ))}
              {q.pagoSemData.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum caso.</p>}
            </div>
          </Section>

          {/* Blocos informativos (somente leitura) */}
          <Section icon={EyeOff} title="Fora do DRE (affects_dre = false)" hint="Somente leitura — conferência do que foi marcado para não impactar o resultado."
            count={q.foraDoDre.length} tone="muted" onExport={() => exportTxs('fora_dre', q.foraDoDre, 'affects_dre = false')}>
            <SimpleTable items={q.foraDoDre} />
          </Section>

          <Section icon={EyeOff} title="Fora do caixa (affects_cashflow = false)" hint="Somente leitura — ex.: receita bruta de venda no cartão."
            count={q.foraDoCaixa.length} tone="muted" onExport={() => exportTxs('fora_caixa', q.foraDoCaixa, 'affects_cashflow = false')}>
            <SimpleTable items={q.foraDoCaixa} />
          </Section>

          <Section icon={Users} title="Despesas sem fornecedor" hint="Somente leitura — ajuste pelo próprio lançamento."
            count={q.semFornecedor.length} tone="muted" onExport={() => exportTxs('sem_fornecedor', q.semFornecedor, 'despesa sem fornecedor')}>
            <SimpleTable items={q.semFornecedor} />
          </Section>

          <Section icon={Tag} title="Linhas do DRE com várias categorias" hint="Somente leitura." count={q.dreLineIssues.length} tone="muted">
            <div className="divide-y divide-border">
              {q.dreLineIssues.map((l) => (
                <div key={l.dreLineName} className="p-3">
                  <p className="text-sm font-medium">{l.dreLineName}</p>
                  <p className="text-xs text-muted-foreground">{l.categories.join(' • ')}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      <ConfirmChangeDialog payload={confirm} onClose={() => setConfirm(null)} busy={busy} />
      <AllocationAssistant
        target={allocTarget}
        units={q.units}
        busy={busy}
        onClose={() => setAllocTarget(null)}
        onSave={saveAllocations}
      />
    </div>
  );
}

function SimpleTable({ items, limit = 50 }: { items: QualityTx[]; limit?: number }) {
  if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento nesta condição.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Competência</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-[10px]">ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.slice(0, limit).map((t) => (
            <TableRow key={t.id}>
              <TableCell className="whitespace-nowrap">{fmtDate(t.competence_date)}</TableCell>
              <TableCell className="max-w-[280px] truncate">{t.description}</TableCell>
              <TableCell>{t.type}</TableCell>
              <TableCell>{t.status}</TableCell>
              <TableCell className="text-right">{fmt(t.net_amount)}</TableCell>
              <TableCell className="text-[10px] text-muted-foreground">{t.id.slice(0, 8)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length > limit && (
        <p className="p-3 text-xs text-muted-foreground">Mostrando {limit} de {items.length}. Use o CSV para a lista completa.</p>
      )}
    </div>
  );
}
