import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Layers, Wallet, Tag, Users, UserCheck, FileDown } from 'lucide-react';

const sections = [
  { title: 'Unidades', desc: 'Let\'s Café, Boulevard, Fábrica...', icon: Building2 },
  { title: 'Frentes de Negócio', desc: 'Loja, Produção, Distribuição', icon: Layers },
  { title: 'Contas', desc: 'Caixa, Banco, Cartão', icon: Wallet },
  { title: 'Categorias', desc: 'Receitas, despesas e mapeamento DRE', icon: Tag },
  { title: 'Parceiros', desc: 'Fornecedores, clientes e contatos', icon: Users },
  { title: 'Usuários', desc: 'Permissões e acessos', icon: UserCheck },
  { title: 'Importar / Exportar', desc: 'CSV e backup de dados', icon: FileDown },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie a estrutura do sistema</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Card key={s.title} className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="p-2 rounded-xl bg-accent/10">
                <s.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="text-sm font-heading">{s.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
