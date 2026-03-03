import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const cards = [
  { title: 'Saldo Total', value: 'R$ 0,00', icon: DollarSign, color: 'text-secondary' },
  { title: 'Receitas do Mês', value: 'R$ 0,00', icon: TrendingUp, color: 'text-success' },
  { title: 'Despesas do Mês', value: 'R$ 0,00', icon: TrendingDown, color: 'text-destructive' },
  { title: 'Contas em Atraso', value: '0', icon: AlertTriangle, color: 'text-warning' },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral financeira do grupo</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="shadow-card rounded-2xl border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold font-heading text-card-foreground">
                {card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder for charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Fluxo de Caixa</CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Conecte dados para visualizar o gráfico
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Conecte dados para visualizar o gráfico
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
