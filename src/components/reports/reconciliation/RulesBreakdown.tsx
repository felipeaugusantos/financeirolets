import { ReactNode } from 'react';
import { BucketKey, SideData } from '@/hooks/useReconciliation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmt } from './format';

export const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

export interface RuleSpec {
  key: BucketKey | 'dashboard' | 'dreCompetenciaFull' | 'dreCompetenciaRealizado' | 'dreCaixa';
  label: string;
  rule: string;
  formula: string;
  getValue: (s: SideData) => number;
  getCount?: (s: SideData) => number | undefined;
  plain: (s: SideData, kind: 'receita' | 'despesa') => ReactNode;
}

const RULES: RuleSpec[] = [
  {
    key: 'dashboard',
    label: 'Dashboard (realizado no período)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pago, recebido}',
    formula: 'Σ net_amount onde competência cai no período e já foi liquidado',
    getValue: (s) => s.dashboard,
    plain: (s, kind) => (
      <>
        Tudo que de fato {kind === 'receita' ? 'entrou' : 'saiu'} neste período <em>e</em> cuja data de competência também cai aqui.
        São <B>{fmt(s.dashboard)}</B> — é exatamente o número que aparece no <B>Dashboard</B> para {kind === 'receita' ? 'receitas' : 'despesas'}.
      </>
    ),
  },
  {
    key: 'provisionado',
    label: 'Provisionado (delta Dashboard → DRE Competência cheio)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pendente, agendado}',
    formula: 'DRE Competência (cheio) − Dashboard',
    getValue: (s) => s.provisionado,
    getCount: (s) => s.details.provisionado.count,
    plain: (s, kind) => (
      <>
        São <B>{s.details.provisionado.count}</B> {kind === 'receita' ? 'recebimentos' : 'pagamentos'} previstos para este período
        somando <B>{fmt(s.provisionado)}</B> que ainda <em>não</em> foram {kind === 'receita' ? 'recebidos' : 'pagos'}.
        O <B>Dashboard ignora</B> (só conta o realizado); o <B>DRE Competência cheio</B> inclui.
      </>
    ),
  },
  {
    key: 'dreCompetenciaFull',
    label: 'DRE Competência (cheio)',
    rule: 'competence_date ∈ [início, fim]  (qualquer status ≠ cancelado)',
    formula: 'Dashboard + Provisionado',
    getValue: (s) => s.dreCompetenciaFull,
    plain: (s) => (
      <>
        Soma tudo que <em>pertence</em> ao período pela data de competência, esteja pago ou não.
        Dá <B>{fmt(s.dreCompetenciaFull)}</B> = Dashboard (<B>{fmt(s.dashboard)}</B>) + Provisionado (<B>{fmt(s.provisionado)}</B>).
      </>
    ),
  },
  {
    key: 'dreCompetenciaRealizado',
    label: 'DRE Competência (somente realizado)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pago, recebido}',
    formula: 'Idêntico ao Dashboard',
    getValue: (s) => s.dreCompetenciaRealizado,
    plain: (s) => (
      <>
        Mesma lógica do Dashboard: ignora o provisionado e só conta o que já entrou/saiu.
        Por isso bate exatamente: <B>{fmt(s.dreCompetenciaRealizado)}</B>.
      </>
    ),
  },
  {
    key: 'pagoDePeriodoAnterior',
    label: 'Pagos no período de competência anterior (entram no caixa)',
    rule: 'payment_date ∈ [início, fim]  E  status ∈ {pago, recebido}  E  competence_date ∉ [início, fim]',
    formula: '+ no DRE Caixa',
    getValue: (s) => s.pagoDePeriodoAnterior,
    getCount: (s) => s.details.pagoDePeriodoAnterior.count,
    plain: (s, kind) => (
      <>
        <B>{s.details.pagoDePeriodoAnterior.count}</B> {kind === 'receita' ? 'recebimentos' : 'pagamentos'} de <B>{fmt(s.pagoDePeriodoAnterior)}</B>{' '}
        feitos agora, mas referentes a meses <em>anteriores</em>.
        <B> Entram</B> no DRE Caixa deste período, mas <B>não</B> aparecem no DRE por competência.
      </>
    ),
  },
  {
    key: 'pagoForaDaCompetencia',
    label: 'Competência no período mas pagos fora (saem do caixa)',
    rule: 'competence_date ∈ [início, fim]  E  status ∈ {pago, recebido}  E  payment_date ∉ [início, fim]',
    formula: '− no DRE Caixa',
    getValue: (s) => s.pagoForaDaCompetencia,
    getCount: (s) => s.details.pagoForaDaCompetencia.count,
    plain: (s) => (
      <>
        <B>{s.details.pagoForaDaCompetencia.count}</B> lançamentos de <B>{fmt(s.pagoForaDaCompetencia)}</B>{' '}
        cuja competência é deste período, mas o pagamento caiu <em>antes ou depois</em>.
        Aparecem no <B>DRE Competência</B>, mas <B>saem</B> do DRE Caixa deste período.
      </>
    ),
  },
  {
    key: 'dreCaixa',
    label: 'DRE Caixa',
    rule: 'payment_date ∈ [início, fim]  E  status ∈ {pago, recebido}',
    formula: 'Dashboard + Pagos de período anterior − Pagos fora da competência',
    getValue: (s) => s.dreCaixa,
    plain: (s) => (
      <>
        Só olha a data de pagamento — quem movimentou conta dentro do período.
        <B> {fmt(s.dreCaixa)}</B> = Dashboard (<B>{fmt(s.dashboard)}</B>) + pagos de antes (<B>{fmt(s.pagoDePeriodoAnterior)}</B>) − pagos fora (<B>{fmt(s.pagoForaDaCompetencia)}</B>).
      </>
    ),
  },
];

export function RulesBreakdown({ title, side, color, kind }: { title: string; side: SideData; color: 'success' | 'destructive'; kind: 'receita' | 'despesa' }) {
  const identityCompetencia = side.dashboard + side.provisionado;
  const identityCaixa = side.dashboard + side.pagoDePeriodoAnterior - side.pagoForaDaCompetencia;
  const okComp = Math.abs(identityCompetencia - side.dreCompetenciaFull) < 0.01;
  const okCaixa = Math.abs(identityCaixa - side.dreCaixa) < 0.01;

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader>
        <CardTitle className={cn('text-base font-heading', color === 'success' ? 'text-success' : 'text-destructive')}>
          {title} — regras aplicadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {RULES.map((r) => {
            const value = r.getValue(side);
            const count = r.getCount?.(side);
            const isTotal = r.key === 'dashboard' || r.key === 'dreCompetenciaFull'
              || r.key === 'dreCompetenciaRealizado' || r.key === 'dreCaixa';
            return (
              <div
                key={r.key}
                className={cn(
                  'rounded-xl border border-border p-3',
                  isTotal ? 'bg-muted/40' : 'bg-card',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-sm', isTotal && 'font-semibold')}>{r.label}</span>
                      {typeof count === 'number' && (
                        <Badge variant="secondary" className="text-[10px]">{count} lanç.</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground/70">Regra: </span>
                        <span className="font-mono">{r.rule}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground/70">Fórmula: </span>
                        {r.formula}
                      </div>
                    </div>
                    <div className="mt-2 rounded-lg bg-primary/5 border border-primary/15 p-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary mb-1">
                        <MessageCircle className="h-3 w-3" /> Em palavras
                      </div>
                      <div className="text-xs leading-relaxed text-foreground/80">
                        {r.plain(side, kind)}
                      </div>
                    </div>
                  </div>
                  <div className={cn('tabular-nums text-sm shrink-0', isTotal && 'font-semibold')}>
                    {fmt(value)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          <div className={cn(
            'rounded-xl border p-2.5 text-xs',
            okComp ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5',
          )}>
            <div className="font-semibold mb-1">Identidade Competência</div>
            <div className="font-mono">
              Dashboard ({fmt(side.dashboard)}) + Provisionado ({fmt(side.provisionado)}) = {fmt(identityCompetencia)}
            </div>
            <div className="font-mono">DRE Competência (cheio) = {fmt(side.dreCompetenciaFull)} {okComp ? '✓' : '✗'}</div>
          </div>
          <div className={cn(
            'rounded-xl border p-2.5 text-xs',
            okCaixa ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5',
          )}>
            <div className="font-semibold mb-1">Identidade Caixa</div>
            <div className="font-mono">
              Dashboard ({fmt(side.dashboard)}) + Pagos ant. ({fmt(side.pagoDePeriodoAnterior)}) − Pagos fora ({fmt(side.pagoForaDaCompetencia)}) = {fmt(identityCaixa)}
            </div>
            <div className="font-mono">DRE Caixa = {fmt(side.dreCaixa)} {okCaixa ? '✓' : '✗'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
