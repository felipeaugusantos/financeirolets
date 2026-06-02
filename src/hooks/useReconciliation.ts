import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ReconciliationFilters {
  dateFrom: string;
  dateTo: string;
  unit_id?: string;
}

export interface BridgeRow {
  label: string;
  value: number;
  hint?: string;
  emphasis?: 'total' | 'delta' | 'normal';
}

export interface ReconciliationData {
  receitas: {
    dashboard: number;
    dreCompetenciaRealizado: number;
    dreCompetenciaFull: number;
    dreCaixa: number;
    provisionado: number;
    pagoForaDaCompetencia: number;
    pagoDePeriodoAnterior: number;
    rows: BridgeRow[];
  };
  despesas: {
    dashboard: number;
    dreCompetenciaRealizado: number;
    dreCompetenciaFull: number;
    dreCaixa: number;
    provisionado: number;
    pagoForaDaCompetencia: number;
    pagoDePeriodoAnterior: number;
    rows: BridgeRow[];
  };
}

function inRange(date: string | null, from: string, to: string) {
  if (!date) return false;
  return date >= from && date <= to;
}

function makeBridge(b: ReconciliationData['receitas'] | ReconciliationData['despesas']): BridgeRow[] {
  const rows: BridgeRow[] = [];
  rows.push({ label: 'Dashboard (realizado no período)', value: b.dashboard, emphasis: 'total', hint: 'Pago/recebido cuja competência cai no período.' });
  rows.push({ label: '+ Provisionado (pendente/agendado)', value: b.provisionado, emphasis: 'delta', hint: 'Lançamentos do período por competência ainda não pagos.' });
  rows.push({ label: '= DRE Competência (cheio)', value: b.dreCompetenciaFull, emphasis: 'total', hint: 'Todas as transações do período por competence_date.' });
  rows.push({ label: '− Provisionado', value: -b.provisionado, emphasis: 'delta' });
  rows.push({ label: '= DRE Competência (somente realizado)', value: b.dreCompetenciaRealizado, emphasis: 'total', hint: 'Igual ao Dashboard quando todos os pagos têm competência no período.' });
  rows.push({ label: '+ Pagos no período mas de competência anterior', value: b.pagoDePeriodoAnterior, emphasis: 'delta', hint: 'Saem do período pela competência mas entram pelo caixa.' });
  rows.push({ label: '− Pagos fora do período (competência no período)', value: -b.pagoForaDaCompetencia, emphasis: 'delta', hint: 'Têm competência no período mas foram pagos antes/depois.' });
  rows.push({ label: '= DRE Caixa', value: b.dreCaixa, emphasis: 'total', hint: 'Pago/recebido por payment_date dentro do período.' });
  return rows;
}

export function useReconciliation() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generate = useCallback(async (filters: ReconciliationFilters) => {
    setLoading(true);
    try {
      const { dateFrom, dateTo, unit_id } = filters;

      // Buscar transações que toquem o período seja por competência ou por pagamento
      // Fazemos 2 queries e juntamos por id
      let qComp = supabase
        .from('transactions')
        .select('id, type, status, net_amount, competence_date, payment_date, unit_id')
        .gte('competence_date', dateFrom)
        .lte('competence_date', dateTo);
      let qPay = supabase
        .from('transactions')
        .select('id, type, status, net_amount, competence_date, payment_date, unit_id')
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo);
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

      const init = () => ({
        dashboard: 0, dreCompetenciaRealizado: 0, dreCompetenciaFull: 0, dreCaixa: 0,
        provisionado: 0, pagoForaDaCompetencia: 0, pagoDePeriodoAnterior: 0, rows: [] as BridgeRow[],
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

        // DRE Competência cheio: competência no período
        if (compInRange) bucket.dreCompetenciaFull += val;
        // DRE Competência só realizado: competência no período + pago
        if (compInRange && isPaid) bucket.dreCompetenciaRealizado += val;
        // Dashboard: pago com competência no período (mesma regra que "só realizado")
        if (compInRange && isPaid) bucket.dashboard += val;
        // DRE Caixa: pago no período
        if (payInRange && isPaid) bucket.dreCaixa += val;
        // Provisionado: competência no período e não pago
        if (compInRange && isProvisioned) bucket.provisionado += val;
        // Pagos no período mas competência fora do período
        if (payInRange && isPaid && !compInRange) bucket.pagoDePeriodoAnterior += val;
        // Competência no período, pago, mas pagamento fora do período
        if (compInRange && isPaid && !payInRange) bucket.pagoForaDaCompetencia += val;
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