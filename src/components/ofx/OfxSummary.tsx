import type { useOfxImport } from '@/hooks/useOfxImport';
import { AlertTriangle, FileText, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { br, brl } from './ofxFormat';

type OfxState = ReturnType<typeof useOfxImport>;

/** Resumo do último arquivo importado (nome, linhas novas/repetidas, período e saldo do banco). */
export function LastImportAlert({ lastImport }: { lastImport: OfxState['lastImport'] }) {
  return (
    <>
    {lastImport && (
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription className="text-xs space-y-0.5">
          <p><strong>{lastImport.fileName}</strong> — {lastImport.inserted} linha(s) novas, {lastImport.duplicated} já existentes (não reimportadas).</p>
          {lastImport.period.start && lastImport.period.end && (
            <p>Período do arquivo: {br(lastImport.period.start)} a {br(lastImport.period.end)}.</p>
          )}
          {lastImport.ledgerBalance !== null && (
            <p>
              Saldo final informado pelo banco
              {lastImport.ledgerBalanceDate ? ` em ${br(lastImport.ledgerBalanceDate)}` : ''}: <strong>{brl(lastImport.ledgerBalance)}</strong>.
            </p>
          )}
        </AlertDescription>
      </Alert>
    )}
    </>
  );
}

/** Quatro indicadores do período: linhas, pendentes, entradas e saídas do extrato. */
export function StatsCards({ stats }: { stats: OfxState['stats'] }) {
  return (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {[
      { label: 'Linhas no período', value: String(stats.total) },
      { label: 'Pendentes', value: String(stats.pendentes) },
      { label: 'Entradas do extrato', value: brl(stats.entradas) },
      { label: 'Saídas do extrato', value: brl(Math.abs(stats.saidas)) },
    ].map(k => (
      <Card key={k.label} className="shadow-card rounded-2xl border-border">
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">{k.label}</p>
          <p className="font-heading text-lg font-bold">{k.value}</p>
        </CardContent>
      </Card>
    ))}
  </div>
  );
}

/** Aviso enquanto houver linhas do extrato sem decisão. */
export function PendingAlert({ stats }: { stats: OfxState['stats'] }) {
  return (
    <>
    {stats.pendentes > 0 && (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          {stats.pendentes} linha(s) do extrato ainda sem decisão, somando {brl(stats.pendenteValor)}.
          Enquanto houver pendências, a conciliação bancária do período não pode ser considerada fechada.
        </AlertDescription>
      </Alert>
    )}
    </>
  );
}

/** Linhas com descrição idêntica a um lançamento existente: vínculo automático por descrição. */
export function DescriptionLinkAlert({ autoLinkableCount, divergenceCount, busy, onAutoLink }: {
  autoLinkableCount: number; divergenceCount: number; busy: boolean; onAutoLink: () => void;
}) {
  return (
    <>
    {(autoLinkableCount > 0 || divergenceCount > 0) && (
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertDescription className="text-xs space-y-2">
          <p>
            {autoLinkableCount} linha(s) do extrato têm descrição idêntica a um lançamento existente
            e batem com a regra de conciliação (categoria, unidade, frente e parceiro) — podem ser
            <strong> vinculadas automaticamente</strong>, sem conciliar nem alterar o lançamento.
            {divergenceCount > 0 && ` ${divergenceCount} linha(s) têm descrição igual, mas divergem da regra e ficam para decisão manual.`}
          </p>
          <Button
            size="sm"
            className="gap-1.5 rounded-xl h-8"
            disabled={autoLinkableCount === 0 || busy}
            onClick={onAutoLink}
          >
            <Zap className="h-3.5 w-3.5" /> Vincular automático por descrição ({autoLinkableCount})
          </Button>
        </AlertDescription>
      </Alert>
    )}
    </>
  );
}
