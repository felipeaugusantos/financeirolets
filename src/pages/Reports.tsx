import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, TrendingUp, Download } from 'lucide-react';

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">DRE, fluxo de caixa e análises</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow">
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

        <Card className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow">
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
      </div>
    </div>
  );
}
