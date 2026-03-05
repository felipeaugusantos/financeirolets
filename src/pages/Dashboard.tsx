import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/useDashboard';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PIE_COLORS = [
  'hsl(340, 82%, 52%)',  // primary pink
  'hsl(184, 100%, 39%)', // teal
  'hsl(40, 70%, 50%)',   // honey
  'hsl(122, 52%, 33%)',  // green
  'hsl(0, 69%, 50%)',    // red
  'hsl(260, 60%, 55%)',  // purple
  'hsl(200, 70%, 50%)',  // blue
  'hsl(30, 80%, 55%)',   // orange
];

const chartConfig = {
  receitas: { label: 'Receitas', color: 'hsl(122, 52%, 33%)' },
  despesas: { label: 'Despesas', color: 'hsl(0, 69%, 50%)' },
};

export default function Dashboard() {
  const { saldoTotal, receitasMes, despesasMes, contasAtrasadas, monthlyData, categoryData, loading } = useDashboard();

  const cards = [
    { title: 'Saldo Total', value: fmt(saldoTotal), icon: DollarSign, color: 'text-secondary' },
    { title: 'Receitas do Mês', value: fmt(receitasMes), icon: TrendingUp, color: 'text-success' },
    { title: 'Despesas do Mês', value: fmt(despesasMes), icon: TrendingDown, color: 'text-destructive' },
    { title: 'Contas em Atraso', value: String(contasAtrasadas), icon: AlertTriangle, color: contasAtrasadas > 0 ? 'text-warning' : 'text-muted-foreground' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral financeira do grupo</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="shadow-card rounded-2xl border-border">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral financeira do grupo</p>
      </div>

      {/* KPI Cards */}
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

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Bar Chart - Receitas vs Despesas */}
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Receitas vs Despesas (últimos 6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.every(m => m.receitas === 0 && m.despesas === 0) ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma transação paga no período
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-56 w-full">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => fmt(Number(value))} />} />
                  <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Despesas por Categoria */}
        <Card className="shadow-card rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Despesas por Categoria (mês atual)</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma despesa paga neste mês
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
