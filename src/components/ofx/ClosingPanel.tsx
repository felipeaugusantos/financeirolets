import { useEffect, useState } from 'react';
import { CheckCircle2, Scale, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { accountBalanceAt } from '@/lib/finance';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

interface Props {
  accountId: string;
  accountName: string;
  to: string;
  /** Saldo final informado pelo banco no último arquivo importado (LEDGERBAL). */
  ledgerBalance: number | null;
  ledgerBalanceDate: string | null;
  /** Linhas do extrato ainda sem decisão no período. */
  pendentes: number;
  pendenteValor: number;
}

/**
 * Fechamento da conta: compara o saldo declarado pelo banco no OFX com o saldo
 * calculado pelo sistema (saldo inicial + lançamentos pagos/recebidos depois da
 * data-base e até a data). É o que diz se a conta está realmente conciliada.
 */
export default function ClosingPanel({
  accountId, accountName, to, ledgerBalance, ledgerBalanceDate, pendentes, pendenteValor,
}: Props) {
  const [systemBalance, setSystemBalance] = useState<number | null>(null);
  const refDate = ledgerBalanceDate || to;

  useEffect(() => {
    if (!accountId) { setSystemBalance(null); return; }
    (async () => {
      const [{ data: acc }, { data: tx }] = await Promise.all([
        supabase.from('accounts').select('initial_balance, initial_balance_date').eq('id', accountId).maybeSingle(),
        supabase
          .from('transactions')
          .select('type, amount, net_amount, payment_date, status')
          .eq('account_id', accountId)
          .in('status', ['pago', 'recebido'])
          .eq('affects_cashflow', true)
          .lte('payment_date', refDate)
          .limit(10000),
      ]);
      // Mesma regra do Dashboard: movimento até a data-base já está no saldo inicial.
      setSystemBalance(accountBalanceAt(acc, tx ?? [], refDate));
    })();
  }, [accountId, refDate]);

  if (systemBalance === null) return null;

  const diff = ledgerBalance !== null ? ledgerBalance - systemBalance : null;
  const closed = pendentes === 0 && diff !== null && Math.abs(diff) < 0.01;

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex flex-wrap items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          Fechamento — {accountName}
          {closed ? (
            <Badge className="text-[11px] gap-1"><CheckCircle2 className="h-3 w-3" /> Conta conciliada</Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] gap-1">
              <AlertTriangle className="h-3 w-3" /> Em aberto
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4 text-xs">
        <div>
          <p className="text-muted-foreground">Saldo do banco (OFX){ledgerBalanceDate ? ` em ${br(ledgerBalanceDate)}` : ''}</p>
          <p className="font-heading text-base font-bold">
            {ledgerBalance !== null ? brl(ledgerBalance) : 'importe um arquivo'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Saldo no sistema em {br(refDate)}</p>
          <p className="font-heading text-base font-bold">{brl(systemBalance)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Diferença</p>
          <p className={`font-heading text-base font-bold ${diff !== null && Math.abs(diff) >= 0.01 ? 'text-destructive' : 'text-secondary'}`}>
            {diff !== null ? brl(diff) : '—'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Pendências do extrato</p>
          <p className="font-heading text-base font-bold">{pendentes} · {brl(pendenteValor)}</p>
        </div>
        {diff !== null && Math.abs(diff) >= 0.01 && (
          <p className="sm:col-span-4 text-muted-foreground">
            A diferença costuma ser exatamente o valor das linhas do extrato ainda sem lançamento.
            Conclua as pendências e o saldo tende a fechar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
