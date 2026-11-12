import { useEffect, useState } from 'react';
import { useReconciliation, ReconciliationFilters } from '@/hooks/useReconciliation';
import { supabase } from '@/integrations/supabase/client';
import { useKaikinContext } from '@/hooks/useKaikinContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, GitCompare, Loader2, Sparkles } from 'lucide-react';
import { toast as sonner } from 'sonner';
import { toLocalISODate } from '@/lib/utils';
import { ReportCustomizer, useReportSections, SectionGroup } from './ReportCustomizer';
import { fmt } from './reconciliation/format';
import { AuditHistory } from './reconciliation/AuditHistory';
import { FixApi, Lookups } from './reconciliation/FixActions';
import { B, RulesBreakdown } from './reconciliation/RulesBreakdown';
import { Checklist } from './reconciliation/Checklist';
import { Bridge } from './reconciliation/Bridge';

export default function ReconciliationReport({ onBack }: { onBack: () => void }) {
  const { data, loading, generate, fixTransaction, fixing } = useReconciliation();
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [fronts, setFronts] = useState<{ id: string; name: string }[]>([]);
  const [catReceita, setCatReceita] = useState<{ id: string; name: string }[]>([]);
  const [catDespesa, setCatDespesa] = useState<{ id: string; name: string }[]>([]);
  const today = new Date();
  const firstOfMonth = toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastOfMonth = toLocalISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [filters, setFilters] = useState<ReconciliationFilters>({
    dateFrom: firstOfMonth,
    dateTo: lastOfMonth,
  });
  const [generated, setGenerated] = useState(false);
  const [auditRefresh, setAuditRefresh] = useState(0);

  type RecSecKey =
    | 'showBridge' | 'showSummary' | 'showChecklist' | 'showRules' | 'showAudit'
    | 'showReceitas' | 'showDespesas';
  const recGroups: SectionGroup<RecSecKey>[] = [
    {
      label: 'Blocos da reconciliação',
      items: [
        { key: 'showBridge', label: 'Ponte de buckets (Receitas / Despesas)' },
        { key: 'showSummary', label: 'Resumo em uma frase' },
        { key: 'showChecklist', label: 'Checklist de conferência' },
        { key: 'showRules', label: 'Regras aplicadas (passo a passo)' },
        { key: 'showAudit', label: 'Histórico de correções (auditoria)' },
      ],
    },
    {
      label: 'Lados',
      items: [
        { key: 'showReceitas', label: 'Coluna Receitas' },
        { key: 'showDespesas', label: 'Coluna Despesas' },
      ],
    },
  ];
  const recSec = useReportSections<RecSecKey>('reconciliacao.sections.v1', {
    showBridge: true, showSummary: true, showChecklist: true, showRules: true, showAudit: true,
    showReceitas: true, showDespesas: true,
  });
  const showRec = recSec.isOn('showReceitas');
  const showDesp = recSec.isOn('showDespesas');
  const sideClass = showRec && showDesp ? 'grid lg:grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4';

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name').then(({ data }) => setUnits(data ?? []));
    supabase.from('business_fronts').select('id, name').eq('active', true).order('name').then(({ data }) => setFronts(data ?? []));
    supabase.from('categories').select('id, name, type').order('name').then(({ data }) => {
      const rows = (data ?? []) as Array<{ id: string; name: string; type: string }>;
      setCatReceita(rows.filter(r => r.type === 'receita').map(({ id, name }) => ({ id, name })));
      setCatDespesa(rows.filter(r => r.type === 'despesa').map(({ id, name }) => ({ id, name })));
    });
  }, []);

  const handleGenerate = async () => {
    await generate(filters);
    setGenerated(true);
  };

  const lookups: Lookups = {
    categoriesByType: { receita: catReceita, despesa: catDespesa },
    units,
    fronts,
  };

  const api: FixApi = {
    fixing,
    apply: async (item, patch, message) => {
      const ok = await fixTransaction(item.id, patch);
      if (ok) {
        const short = item.description.length > 40 ? item.description.slice(0, 40) + '…' : item.description;
        sonner.success('✓ Lançamento corrigido', { description: `${short} — ${message}` });
        setAuditRefresh((n) => n + 1);
      }
    },
  };

  // Injeta o contexto da Reconciliação no Kaikin para perguntas contextualizadas
  useKaikinContext(
    data
      ? {
          scope: 'reconciliacao',
          period: { from: filters.dateFrom, to: filters.dateTo },
          unit_id: filters.unit_id ?? null,
          totals: {
            receitas: {
              dashboard: data.receitas.dashboard,
              provisionado: data.receitas.provisionado,
              dreCompetenciaFull: data.receitas.dreCompetenciaFull,
              dreCaixa: data.receitas.dreCaixa,
              pagoForaDaCompetencia: data.receitas.pagoForaDaCompetencia,
              pagoDePeriodoAnterior: data.receitas.pagoDePeriodoAnterior,
            },
            despesas: {
              dashboard: data.despesas.dashboard,
              provisionado: data.despesas.provisionado,
              dreCompetenciaFull: data.despesas.dreCompetenciaFull,
              dreCaixa: data.despesas.dreCaixa,
              pagoForaDaCompetencia: data.despesas.pagoForaDaCompetencia,
              pagoDePeriodoAnterior: data.despesas.pagoDePeriodoAnterior,
            },
          },
          checklist: data.checklist.map((c) => ({
            id: c.id,
            severity: c.severity,
            title: c.title,
            side: c.side,
            count: c.count,
            amount: c.amount,
          })),
        }
      : null
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <GitCompare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">Reconciliação Dashboard ↔ DRE</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mostra, no período, a ponte entre Dashboard, DRE Competência (cheio e somente realizado) e DRE Caixa.
            </p>
            <p className="text-[11px] text-warning mt-1">
              Sem extrato bancário importado: os valores são movimentação calculada a partir dos lançamentos,
              não saldo bancário conciliado.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={filters.unit_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, unit_id: v === '__all__' ? undefined : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar'}
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1"
              onClick={() => setFilters({ dateFrom: firstOfMonth, dateTo: lastOfMonth })}
            >
              Limpar filtros
            </Button>
            <ReportCustomizer<RecSecKey>
              groups={recGroups}
              sections={recSec.sections}
              onToggle={recSec.toggle}
              onReset={recSec.reset}
              inlineKeys={['showChecklist', 'showRules']}
              description="Mostre apenas os blocos que você quer ver na reconciliação. As correções inline continuam funcionando normalmente."
            />
          </div>
        </CardContent>
      </Card>

      {generated && data && recSec.isOn('showBridge') && (showRec || showDesp) && (
        <div className={sideClass}>
          {showRec && <Bridge title="Receitas" side={data.receitas} color="success" kind="receita" lookups={lookups} api={api} />}
          {showDesp && <Bridge title="Despesas" side={data.despesas} color="destructive" kind="despesa" lookups={lookups} api={api} />}
        </div>
      )}

      {generated && data && recSec.isOn('showSummary') && (
        <Card className="shadow-card rounded-2xl border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-heading">Resumo em uma frase</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-foreground/85 space-y-2">
            <p>
              Neste período seu <B>Dashboard</B> mostra <span className="text-success font-semibold">{fmt(data.receitas.dashboard)}</span> em receitas
              e <span className="text-destructive font-semibold">{fmt(data.despesas.dashboard)}</span> em despesas (já realizadas).
            </p>
            <p>
              O <B>DRE por Competência</B> adiciona o provisionado: <span className="text-success font-semibold">+{fmt(data.receitas.provisionado)}</span> em receitas
              e <span className="text-destructive font-semibold">+{fmt(data.despesas.provisionado)}</span> em despesas,
              chegando a <B>{fmt(data.receitas.dreCompetenciaFull)}</B> / <B>{fmt(data.despesas.dreCompetenciaFull)}</B>.
            </p>
            <p>
              O <B>DRE por Caixa</B> ajusta o Dashboard somando pagos de períodos anteriores
              (<B>+{fmt(data.receitas.pagoDePeriodoAnterior)}</B> / <B>+{fmt(data.despesas.pagoDePeriodoAnterior)}</B>) e tirando os pagos fora
              (<B>−{fmt(data.receitas.pagoForaDaCompetencia)}</B> / <B>−{fmt(data.despesas.pagoForaDaCompetencia)}</B>),
              resultando em <B>{fmt(data.receitas.dreCaixa)}</B> / <B>{fmt(data.despesas.dreCaixa)}</B>.
            </p>
          </CardContent>
        </Card>
      )}

      {generated && data && recSec.isOn('showChecklist') && (
        <Checklist items={data.checklist} data={data} lookups={lookups} api={api} />
      )}

      {generated && data && recSec.isOn('showRules') && (showRec || showDesp) && (
        <div className={sideClass}>
          {showRec && <RulesBreakdown title="Receitas" side={data.receitas} color="success" kind="receita" />}
          {showDesp && <RulesBreakdown title="Despesas" side={data.despesas} color="destructive" kind="despesa" />}
        </div>
      )}

      {generated && recSec.isOn('showAudit') && <AuditHistory refreshKey={auditRefresh} />}
    </div>
  );
}
