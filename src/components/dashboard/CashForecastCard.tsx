import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, toLocalISODate } from '@/lib/utils';
import { buildCashForecast, type CashForecast } from '@/lib/cashForecast';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Previsão de caixa consolidada: contas pendentes/agendadas que afetam o caixa. */
export function CashForecastCard() {
  const navigate = useNavigate();
  const [data, setData] = useState<CashForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const today = toLocalISODate(new Date());
      const limit = new Date(); limit.setDate(limit.getDate() + 30);
      const rows: { type: string; net_amount: number; due_date: string | null }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error: e } = await supabase
          .from('transactions')
          .select('type, net_amount, due_date')
          .in('status', ['pendente', 'agendado'])
          .eq('affects_cashflow', true)
          .not('due_date', 'is', null)
          .lte('due_date', toLocalISODate(limit))
          .range(from, from + 999);
        if (!alive) return;
        if (e) { setError(e.message); return; }
        rows.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
      setError(null);
      setData(buildCashForecast(rows, today));
    };
    load();
    // Pagar/receber uma conta (aqui ou em outra aba) tira ela da previsão sem recarregar a página.
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          Previsão de caixa (contas em aberto)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-destructive">Não foi possível calcular a previsão ({error}).</p>
        ) : !data ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Vencidos', entradas: data.atrasadoEntradas, saidas: data.atrasadoSaidas, saldo: data.atrasadoEntradas - data.atrasadoSaidas },
              ...data.buckets.map((b) => ({ label: `Próximos ${b.days} dias`, ...b })),
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => navigate('/contas')}
                className="text-left rounded-xl border border-border p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="text-[11px] text-muted-foreground mb-1">{b.label}</div>
                <div className={cn('text-base font-bold font-heading tabular-nums', b.saldo >= 0 ? 'text-success' : 'text-destructive')}>
                  {fmt(b.saldo)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  <span className="text-success">+{fmt(b.entradas)}</span> · <span className="text-destructive">−{fmt(b.saidas)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">Visão do grupo todo, sem filtro de unidade. Cada período inclui os anteriores.</p>
      </CardContent>
    </Card>
  );
}
