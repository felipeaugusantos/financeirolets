import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  status: string;
  category_name: string;
  front_name: string;
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
}

export interface ReconciliationData {
  receitas: SideData;
  despesas: SideData;
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
    { key: 'provisionado', label: '− Provisionado', value: -b.provisionado, emphasis: 'delta' },
    { label: '= DRE Competência (somente realizado)', value: b.dreCompetenciaRealizado, emphasis: 'total', hint: 'Igual ao Dashboard quando todos os pagos têm competência no período.' },
    { key: 'pagoDePeriodoAnterior', label: '+ Pagos no período mas de competência anterior', value: b.pagoDePeriodoAnterior, emphasis: 'delta', hint: 'Saem do período pela competência mas entram pelo caixa.' },
    { key: 'pagoForaDaCompetencia', label: '− Pagos fora do período (competência no período)', value: -b.pagoForaDaCompetencia, emphasis: 'delta', hint: 'Têm competência no período mas foram pagos antes/depois.' },
    { label: '= DRE Caixa', value: b.dreCaixa, emphasis: 'total', hint: 'Pago/recebido por payment_date dentro do período.' },
  ];
}

function emptyDetail(): BucketDetail {
  return { total: 0, count: 0, items: [], byCategory: [], byFront: [] };
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
  const { toast } = useToast();

  const generate = useCallback(async (filters: ReconciliationFilters) => {
    setLoading(true);
    try {
      const { dateFrom, dateTo, unit_id } = filters;
      const cols = 'id, type, status, description, net_amount, competence_date, payment_date, unit_id, category_id, front_id';

      let qComp = supabase.from('transactions').select(cols)
        .gte('competence_date', dateFrom).lte('competence_date', dateTo);
      let qPay = supabase.from('transactions').select(cols)
        .gte('payment_date', dateFrom).lte('payment_date', dateTo);
      if (unit_id) {
        qComp = qComp.eq('unit_id', unit_id);
        qPay = qPay.eq('unit_id', unit_id);
      }

      const [{ data: byComp, error: e1 }, { data: byPay, error: e2 }] = await Promise.all([qComp, qPay]);
      if (e1) throw e1;
      if (e2) throw e2;

      const mapTx = new Map<string, any>();
      (byComp ?? []).forEach((t: any) => mapTx.set(t.id, t));
      (byPay ?? []).forEach((t: any) => mapTx.set(t.id, t));

      const catIds = new Set<string>();
      const frontIds = new Set<string>();
      mapTx.forEach((tx: any) => {
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
      const catName = new Map<string, string>(((cRes.data ?? []) as any[]).map((c: any) => [c.id, c.name]));
      const frontName = new Map<string, string>(((fRes.data ?? []) as any[]).map((f: any) => [f.id, f.name]));

      const init = (): SideData => ({
        dashboard: 0, dreCompetenciaRealizado: 0, dreCompetenciaFull: 0, dreCaixa: 0,
        provisionado: 0, pagoForaDaCompetencia: 0, pagoDePeriodoAnterior: 0,
        rows: [],
        details: {
          provisionado: emptyDetail(),
          pagoDePeriodoAnterior: emptyDetail(),
          pagoForaDaCompetencia: emptyDetail(),
        },
      });
      const rec = init();
      const des = init();

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
          status: tx.status,
          category_name: tx.category_id ? (catName.get(tx.category_id) || '—') : 'Sem categoria',
          front_name: tx.front_id ? (frontName.get(tx.front_id) || '—') : 'Sem frente',
        };

        if (compInRange) bucket.dreCompetenciaFull += val;
        if (compInRange && isPaid) {
          bucket.dreCompetenciaRealizado += val;
          bucket.dashboard += val;
        }
        if (payInRange && isPaid) bucket.dreCaixa += val;
        if (compInRange && isProvisioned) {
          bucket.provisionado += val;
          const d = bucket.details.provisionado;
          d.items.push(detailItem); d.total += val; d.count++;
        }
        if (payInRange && isPaid && !compInRange) {
          bucket.pagoDePeriodoAnterior += val;
          const d = bucket.details.pagoDePeriodoAnterior;
          d.items.push(detailItem); d.total += val; d.count++;
        }
        if (compInRange && isPaid && !payInRange) {
          bucket.pagoForaDaCompetencia += val;
          const d = bucket.details.pagoForaDaCompetencia;
          d.items.push(detailItem); d.total += val; d.count++;
        }
      });

      [rec, des].forEach((side) => {
        (Object.keys(side.details) as BucketKey[]).forEach((k) => summarize(side.details[k]));
      });

      rec.rows = makeBridge(rec);
      des.rows = makeBridge(des);

      setData({ receitas: rec, despesas: des });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar reconciliação', description: err.message, variant: 'destructive' });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { data, loading, generate };
}