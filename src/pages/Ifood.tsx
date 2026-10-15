import { Bike } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STEPS = [
  { title: 'Lojas e acessos', detail: 'Cadastro das duas lojas no iFood e da unidade de cada uma.' },
  { title: 'Pedidos e itens', detail: 'Coleta dos pedidos de cada loja, com itens e valores.' },
  { title: 'Custo por pedido e produto', detail: 'Taxas, entrega e promoções do iFood somadas ao custo dos itens.' },
  { title: 'Conferência de repasses', detail: 'Repasse esperado do iFood contra o que entrou no extrato.' },
];

export default function Ifood() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">iFood</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos, custos e repasses das lojas que vendem pelo iFood.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bike className="h-4 w-4" /> Em implantação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            A integração com o iFood ainda não foi ativada. O que vem por aqui, em etapas:
          </p>
          <ol className="space-y-2 text-sm">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="font-medium text-primary">{i + 1}.</span>
                <span>
                  <span className="font-medium">{s.title}</span>
                  <span className="text-muted-foreground"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
