import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/lib/utils';

export interface ReconciliationFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
}

export type BucketKey = 'provisionado' | 'pagoDePeriodoAnterior' | 'pagoForaDaCompetencia';

export interface BridgeRow {
  key?: BucketKey;
  label: string;
  value: number;
  hint?: string;
  emphasis?: 'total' | 'delta' | 'normal';
}

export interface TxDetail {
  id: string;
  description: string;
  amount: number;
  competence_date: string | null;
  payment_date: string | null;
  due_date: string | null;
  status: string;
  category_name: string;
  front_name: string;
  unit_id: string | null;
  category_id: string | null;
  front_id: string | null;
}

export interface GroupTotal { name: string; value: number; count: number }

export interface BucketDetail {
  total: number;
  count: number;
  items: TxDetail[];
  byCategory: GroupTotal[];
  byFront: GroupTotal[];
}

export interface SideData {
  dashboard: number;
  dreCompetenciaRealizado: number;
  dreCompetenciaFull: number;
  dreCaixa: number;
  provisionado: number;
  pagoForaDaCompetencia: number;
  pagoDePeriodoAnterior: number;
  rows: BridgeRow[];
  details: Record<BucketKey, BucketDetail>;
  flags: {
    missingCategory: BucketDetail;
    missingUnit: BucketDetail;
    missingFront: BucketDetail;
    provisionadoVencido: BucketDetail;
    negativeOrZero: BucketDetail;
    pagoSemData: BucketDetail;
  };
}

export type FlagKey = keyof SideData['flags'];
export type Severity = 'ok' | 'info' | 'warn' | 'error';

export interface ChecklistItem {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  count?: number;
  amount?: number;
  side?: 'receita' | 'despesa';
  bucketKey?: BucketKey;
  flagKey?: FlagKey;
}

export interface ReconciliationData {
  receitas: SideData;
  despesas: SideData;
  checklist: ChecklistItem[];
}

function inRange(date: string | null, from: string, to: string) {
  if (!date) return false;
  return date >= from && date <= to;
}

function makeBridge(b: SideData): BridgeRow[] {
  return [
    { label: 'Dashboard (realizado no período)', value: b.dashboard, emphasis: 'total', hint: 'Pago/recebido cuja competência cai no período.' },
    { key: 'provisionado', label: '+ Provisionado (pendente/agendado)', value: b.provisionado, emphasis: 'delta', hint: 'Lançamentos do período por competência ainda não pagos.' },
    { label: '= DRE Competência (cheio)', value: b.dreCompetenciaFull, emphasis: 'total', hint: 'Todas as transações do período por competence_date.' },
    { label: '− Provisionado', value: -b.provisionado, emphasis: 'delta' },
    { label: '= DRE Competência (somente realizado)', value: b.dreCompetenciaRealizado, emphasis: 'total', hint: 'Igual ao Dashboard quando todos os pagos têm competência no período.' },
    { key: 'pagoDePeriodoAnterior', label: '+ Pagos no período mas de competência anterior', value: b.pagoDePeriodoAnterior, emphasis: 'delta', hint: 'Saem do período pela competência mas entram pelo caixa.' },
    { key: 'pagoForaDaCompetencia', label: '− Pagos fora do período (competência no período)', value: -b.pagoForaDaCompetencia, emphasis: 'delta', hint: 'Têm competência no período mas foram pagos antes/depois.' },
    { label: '= DRE Caixa', value: b.dreCaixa, emphasis: 'total', hint: 'Pago/recebido por payment_date dentro do período.' },
  ];
}

function emptyDetail(): BucketDetail {
  return { total: 0, count: 0, items: [], byCategory: [], byFront: [] };
}

const todayISO = () => todayLocalISO();

function pushDetail(d: BucketDetail, item: TxDetail) {
  d.items.push(item);
  d.total += item.amount;
  d.count++;
}

function buildChecklist(rec: SideData, des: SideData): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const sides: Array<{ key: 'receita' | 'despesa'; label: string; data: SideData }> = [
    { key: 'receita', label: 'Receitas', data: rec },
    { key: 'despesa', label: 'Despesas', data: des },
  ];

  // 1 & 2 — identidades
  sides.forEach(({ key, label, data }) => {
    const idComp = data.dashboard + data.provisionado;
    const okComp = Math.abs(idComp - data.dreCompetenciaFull) < 0.01;
    out.push({
      id: `identity-comp-${key}`,
      severity: okComp ? 'ok' : 'error',
      title: `Identidade Competência (${label})`,
      message: okComp
        ? 'Dashboard + Provisionado bate com o DRE Competência cheio.'
        : `Diferença de ${(idComp - data.dreCompetenciaFull).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} entre Dashboard+Provisionado e DRE Competência.`,
      side: key,
    });
    const idCaixa = data.dashboard + data.pagoDePeriodoAnterior - data.pagoForaDaCompetencia;
    const okCaixa = Math.abs(idCaixa - data.dreCaixa) < 0.01;
    out.push({
      id: `identity-caixa-${key}`,
      severity: okCaixa ? 'ok' : 'error',
      title: `Identidade Caixa (${label})`,
      message: okCaixa
        ? 'Dashboard + pagos de antes − pagos fora bate com o DRE Caixa.'
        : `Diferença de ${(idCaixa - data.dreCaixa).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no DRE Caixa.`,
      side: key,
    });
  });

  // 3-10 — checks por lado
  sides.forEach(({ key, label, data }) => {
    const f = data.flags;

    if (f.provisionadoVencido.count > 0) out.push({
      id: `vencido-${key}`,
      severity: 'warn',
      title: `Provisionado vencido em ${label}`,
      message: 'Lançamentos com data de vencimento já passada e ainda em aberto.',
      count: f.provisionadoVencido.count,
      amount: f.provisionadoVencido.total,
      side: key,
      flagKey: 'provisionadoVencido',
    });

    if (data.details.pagoForaDaCompetencia.count > 0) out.push({
      id: `fora-${key}`,
      severity: 'warn',
      title: `Pagos fora da competência (${label})`,
      message: 'Têm competência no período mas o pagamento caiu fora — somem do DRE Caixa.',
      count: data.details.pagoForaDaCompetencia.count,
      amount: data.details.pagoForaDaCompetencia.total,
      side: key,
      bucketKey: 'pagoForaDaCompetencia',
    });

    if (data.details.pagoDePeriodoAnterior.count > 0) out.push({
      id: `anterior-${key}`,
      severity: 'info',
      title: `Pagos no período de competência anterior (${label})`,
      message: 'Entram no DRE Caixa deste período mesmo sendo de meses anteriores.',
      count: data.details.pagoDePeriodoAnterior.count,
      amount: data.details.pagoDePeriodoAnterior.total,
      side: key,
      bucketKey: 'pagoDePeriodoAnterior',
    });

    if (f.missingCategory.count > 0) out.push({
      id: `nocat-${key}`,
      severity: 'warn',
      title: `${label} sem categoria`,
      message: 'Sem categoria ficam fora da estrutura do DRE — classifique antes de fechar o mês.',
      count: f.missingCategory.count,
      amount: f.missingCategory.total,
      side: key,
      flagKey: 'missingCategory',
    });

    if (f.missingUnit.count > 0) out.push({
      id: `nounit-${key}`,
      severity: 'warn',
      title: `${label} sem unidade`,
      message: 'Sem unidade aparecem em "Sem unidade" no DRE Comparativo.',
      count: f.missingUnit.count,
      amount: f.missingUnit.total,
      side: key,
      flagKey: 'missingUnit',
    });

    if (f.missingFront.count > 0) out.push({
      id: `nofront-${key}`,
      severity: 'info',
      title: `${label} sem frente de negócio`,
      message: 'Atribua uma frente para conseguir analisar margem por linha de negócio.',
      count: f.missingFront.count,
      amount: f.missingFront.total,
      side: key,
      flagKey: 'missingFront',
    });

    if (f.negativeOrZero.count > 0) out.push({
      id: `neg-${key}`,
      severity: 'warn',
      title: `${label} com valor líquido ≤ 0`,
      message: 'Pode indicar lançamento incompleto ou imposto maior que o bruto.',
      count: f.negativeOrZero.count,
      amount: f.negativeOrZero.total,
      side: key,
      flagKey: 'negativeOrZero',
    });

    if (f.pagoSemData.count > 0) out.push({
      id: `semdata-${key}`,
      severity: 'warn',
      title: `${label} marcadas como pagas sem data de pagamento`,
      message: 'Esses lançamentos não entram no DRE Caixa e quebram a identidade. Preencha o payment_date.',
      count: f.pagoSemData.count,
      amount: f.pagoSemData.total,
      side: key,
      flagKey: 'pagoSemData',
    });

    if (data.provisionado > data.dashboard && data.provisionado > 0) out.push({
      id: `provdom-${key}`,
      severity: 'info',
      title: `Provisionado maior que realizado em ${label}`,
      message: 'Mais da metade do mês ainda depende de baixa — Dashboard ficará bem menor que DRE Competência.',
      amount: data.provisionado,
      side: key,
    });
  });

  return out;
}

function summarize(detail: BucketDetail) {
  const cat = new Map<string, GroupTotal>();
  const fr = new Map<string, GroupTotal>();
  detail.items.forEach((it) => {
    const c = cat.get(it.category_name) || { name: it.category_name, value: 0, count: 0 };
    c.value += it.amount; c.count++;
    cat.set(it.category_name, c);
    const f = fr.get(it.front_name) || { name: it.front_name, value: 0, count: 0 };
    f.value += it.amount; f.count++;
    fr.set(it.front_name, f);
  });
  detail.byCategory = Array.from(cat.values()).sort((a, b) => b.value - a.value);
  detail.byFront = Array.from(fr.values()).sort((a, b) => b.value - a.value);
  detail.items.sort((a, b) => b.amount - a.amount);
}

export function useReconciliation() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const lastFiltersRef = useRef<ReconciliationFilters | null>(null);
  const { toast } = useToast();

  const generate = useCallback(async (filters: ReconciliationFilters) => {
    setLoading(true);
    lastFiltersRef.current = filters;
    try {
      const { dateFrom, dateTo, unit_id } = filters;
      const cols = 'id, type, status, description, net_amount, competence_date, payment_date, due_date, unit_id, category_id, front_id';

      let qComp = supabase.from('transactions').select(cols)
        .gte('competence_date', dateFrom).lte('competence_date', dateTo)
        .not('status', 'eq', 'cancelado')
        .limit(10000);
      let qPay = supabase.from('transactions').select(cols)
        .gte('payment_date', dateFrom).lte('payment_date', dateTo)
        .not('status', 'eq', 'cancelado')
        .limit(10000);
      if (unit_id) {
        qComp = qComp.eq('unit_id', unit_id);
        qPay = qPay.eq('unit_id', unit_id);
      }

      const [{ data: byComp, error: e1 }, { data: byPay, error: e2 }] = await Promise.all([qComp, qPay]);
      if (e1) throw e1;
      if (e2) throw e2;
      if ((byComp && byComp.length >= 10000) || (byPay && byPay.length >= 10000)) {
        console.warn('[useReconciliation] Possível truncamento: 10.000 transações retornadas — números podem estar incompletos.');
      }

      const mapTx = new Map<string, any>();
      (byComp ?? []).forEach((t) => mapTx.set(t.id, t));
      (byPay ?? []).forEach((t) => mapTx.set(t.id, t));

      const catIds = new Set<string>();
      const frontIds = new Set<string>();
      mapTx.forEach((tx) => {
        if (tx.category_id) catIds.add(tx.category_id);
        if (tx.front_id) frontIds.add(tx.front_id);
      });
      const [cRes, fRes] = await Promise.all([
        catIds.size > 0
          ? supabase.from('categories').select('id, name').in('id', Array.from(catIds))
          : Promise.resolve({ data: [] as any[] }),
        frontIds.size > 0
          ? supabase.from('business_fronts').select('id, name').in('id', Array.from(frontIds))
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const catName = new Map<string, string>(((cRes.data ?? []) as any[]).map((c) => [c.id, c.name]));
      const frontName = new Map<string, string>(((fRes.data ?? []) as any[]).map((f) => [f.id, f.name]));

      const init = (): SideData => ({
        dashboard: 0, dreCompetenciaRealizado: 0, dreCompetenciaFull: 0, dreCaixa: 0,
        provisionado: 0, pagoForaDaCompetencia: 0, pagoDePeriodoAnterior: 0,
        rows: [],
        details: {
          provisionado: emptyDetail(),
          pagoDePeriodoAnterior: emptyDetail(),
          pagoForaDaCompetencia: emptyDetail(),
        },
        flags: {
          missingCategory: emptyDetail(),
          missingUnit: emptyDetail(),
          missingFront: emptyDetail(),
          provisionadoVencido: emptyDetail(),
          negativeOrZero: emptyDetail(),
          pagoSemData: emptyDetail(),
        },
      });
      const rec = init();
      const des = init();
      const today = todayISO();

      mapTx.forEach((tx) => {
        if (tx.status === 'cancelado') return;
        const val = Number(tx.net_amount) || 0;
        const isPaid = tx.status === 'pago' || tx.status === 'recebido';
        const isProvisioned = tx.status === 'pendente' || tx.status === 'agendado';
        const compInRange = inRange(tx.competence_date, dateFrom, dateTo);
        const payInRange = inRange(tx.payment_date, dateFrom, dateTo);
        const bucket = tx.type === 'receita' ? rec : des;
        const detailItem: TxDetail = {
          id: tx.id,
          description: tx.description,
          amount: val,
          competence_date: tx.competence_date,
          payment_date: tx.payment_date,
          due_date: tx.due_date ?? null,
          status: tx.status,
          category_name: tx.category_id ? (catName.get(tx.category_id) || '—') : 'Sem categoria',
          front_name: tx.front_id ? (frontName.get(tx.front_id) || '—') : 'Sem frente',
          unit_id: tx.unit_id ?? null,
          category_id: tx.category_id ?? null,
          front_id: tx.front_id ?? null,
        };

        if (compInRange) bucket.dreCompetenciaFull += val;
        if (compInRange && isPaid) {
          bucket.dreCompetenciaRealizado += val;
          bucket.dashboard += val;
        }
        if (payInRange && isPaid) bucket.dreCaixa += val;
        if (compInRange && isProvisioned) {
          bucket.provisionado += val;
          pushDetail(bucket.details.provisionado, detailItem);
          if (detailItem.due_date && detailItem.due_date < today) {
            pushDetail(bucket.flags.provisionadoVencido, detailItem);
          }
        }
        if (payInRange && isPaid && !compInRange) {
          bucket.pagoDePeriodoAnterior += val;
          pushDetail(bucket.details.pagoDePeriodoAnterior, detailItem);
        }
        if (compInRange && isPaid && tx.payment_date && !payInRange) {
          bucket.pagoForaDaCompetencia += val;
          pushDetail(bucket.details.pagoForaDaCompetencia, detailItem);
        }
        // Lançamento marcado como pago mas sem payment_date → não cai em nenhum bucket de caixa
        if (compInRange && isPaid && !tx.payment_date) {
          pushDetail(bucket.flags.pagoSemData, detailItem);
        }

        // Flags considerando apenas transações que tocam o período
        if (compInRange || payInRange) {
          if (!detailItem.category_id) pushDetail(bucket.flags.missingCategory, detailItem);
          if (!detailItem.unit_id) pushDetail(bucket.flags.missingUnit, detailItem);
          if (!detailItem.front_id) pushDetail(bucket.flags.missingFront, detailItem);
          if (val <= 0) pushDetail(bucket.flags.negativeOrZero, detailItem);
        }
      });

      [rec, des].forEach((side) => {
        (Object.keys(side.details) as BucketKey[]).forEach((k) => summarize(side.details[k]));
        (Object.keys(side.flags) as FlagKey[]).forEach((k) => summarize(side.flags[k]));
      });

      rec.rows = makeBridge(rec);
      des.rows = makeBridge(des);

      const checklist = buildChecklist(rec, des);
      setData({ receitas: rec, despesas: des, checklist });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar reconciliação', description: err.message, variant: 'destructive' });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fixTransaction = useCallback(async (
    id: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    setFixing(id);
    // Capture "before" snapshot for audit
    const { data: before } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const { data: after, error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      toast({ title: 'Não foi possível corrigir', description: error.message, variant: 'destructive' });
      setFixing(null);
      return false;
    }

    // Write audit log entry (non-blocking on failure)
    try {
      await supabase.rpc('log_reconciliation_fix' as any, {
        _record_id: id,
        _old_data: before ?? {},
        _new_data: after ?? patch,
      });
    } catch (e) {
      console.warn('[useReconciliation] audit log failed', e);
    }

    if (lastFiltersRef.current) {
      await generate(lastFiltersRef.current);
    }
    setFixing(null);
    return true;
  }, [generate, toast]);

  return { data, loading, generate, fixTransaction, fixing };
}