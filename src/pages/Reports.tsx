import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, TrendingUp, Columns3, GitCompare, BarChart3 } from 'lucide-react';
import DreReport from '@/components/reports/DreReport';
import CashFlowReport from '@/components/reports/CashFlowReport';
import DreComparativo from '@/components/reports/DreComparativo';
import ReconciliationReport from '@/components/reports/ReconciliationReport';
import DreGerencial from '@/components/reports/DreGerencial';
import CashFlowByUnit from '@/components/reports/CashFlowByUnit';

type View = 'menu' | 'dre' | 'dre-gerencial' | 'cashflow' | 'dre-comparativo' | 'reconciliacao' | 'cashflow-unidade';

export default function Reports() {
  const [view, setView] = useState<View>('menu');

  if (view === 'dre') return <DreReport onBack={() => setView('menu')} />;
  if (view === 'dre-gerencial') return <DreGerencial onBack={() => setView('menu')} />;
  if (view === 'dre-comparativo') return <DreComparativo onBack={() => setView('menu')} />;
  if (view === 'cashflow') return <CashFlowReport onBack={() => setView('menu')} />;
  if (view === 'cashflow-unidade') return <CashFlowByUnit onBack={() => setView('menu')} />;
  if (view === 'reconciliacao') return <ReconciliationReport onBack={() => setView('menu')} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">DRE, fluxo de caixa e análises</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
          onClick={() => setView('cashflow-unidade')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary/10">
              <TrendingUp className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">Fluxo de Caixa por Unidade</CardTitle>
              <p className="text-xs text-muted-foreground">Receitas e despesas por unidade</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unidades lado a lado e evolução mês a mês, realizado e previsto, com rateios aplicados.
            </p>
          </CardContent>
        </Card>

        <Card
          className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
          onClick={() => setView('dre')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">DRE</CardTitle>
              <p className="text-xs text-muted-foreground">Demonstrativo de Resultado</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gere DRE por unidade ou consolidado, por período, em regime de caixa ou competência.
            </p>
          </CardContent>
        </Card>

        <Card
          className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
          onClick={() => setView('dre-gerencial')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary/10">
              <BarChart3 className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">DRE Gerencial</CardTitle>
              <p className="text-xs text-muted-foreground">Margens e resultado contábil</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Receita Líquida, Lucro Bruto, EBITDA e Lucro Líquido com margens e comparação de períodos.
            </p>
          </CardContent>
        </Card>

        <Card
          className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
          onClick={() => setView('dre-comparativo')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Columns3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">DRE Comparativo</CardTitle>
              <p className="text-xs text-muted-foreground">Unidades lado a lado</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Compare o resultado de todas as unidades em colunas lado a lado.
            </p>
          </CardContent>
        </Card>

        <Card
          className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
          onClick={() => setView('cashflow')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary/10">
              <TrendingUp className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">Fluxo de Caixa</CardTitle>
              <p className="text-xs text-muted-foreground">Entradas, saídas e saldo</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Visualize entradas, saídas e saldo acumulado por período e unidade.
            </p>
          </CardContent>
        </Card>

        <Card
          className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
          onClick={() => setView('reconciliacao')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <GitCompare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-heading">Reconciliação</CardTitle>
              <p className="text-xs text-muted-foreground">Dashboard ↔ DRE</p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Veja por que o Dashboard, o DRE Competência e o DRE Caixa divergem (provisionados, deslocamento entre competência e pagamento).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
