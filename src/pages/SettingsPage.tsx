
import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Layers, Wallet, Tag, Users, BarChart3, FileDown } from 'lucide-react';
import UnitsSettings from './settings/UnitsSettings';
import FrontsSettings from './settings/FrontsSettings';
import AccountsSettings from './settings/AccountsSettings';
import CategoriesSettings from './settings/CategoriesSettings';
import PartnersSettings from './settings/PartnersSettings';
import DreSettings from './settings/DreSettings';
import ImportExportSettings from './settings/ImportExportSettings';

const sections = [
  { key: 'units', title: 'Unidades', desc: 'Let\'s Café, Boulevard, Fábrica...', icon: Building2 },
  { key: 'fronts', title: 'Frentes de Negócio', desc: 'Loja, Produção, Distribuição', icon: Layers },
  { key: 'accounts', title: 'Contas', desc: 'Caixa, Banco, Cartão', icon: Wallet },
  { key: 'categories', title: 'Categorias', desc: 'Receitas, despesas e mapeamento DRE', icon: Tag },
  { key: 'dre', title: 'Linhas do DRE', desc: 'Estrutura customizável do DRE', icon: BarChart3 },
  { key: 'partners', title: 'Parceiros', desc: 'Fornecedores, clientes e contatos', icon: Users },
  { key: 'export', title: 'Importar / Exportar', desc: 'CSV e backup de dados', icon: FileDown },
];

export default function SettingsPage() {
  const [active, setActive] = useState<string | null>(null);

  if (active === 'units') return <UnitsSettings onBack={() => setActive(null)} />;
  if (active === 'fronts') return <FrontsSettings onBack={() => setActive(null)} />;
  if (active === 'accounts') return <AccountsSettings onBack={() => setActive(null)} />;
  if (active === 'categories') return <CategoriesSettings onBack={() => setActive(null)} />;
  if (active === 'dre') return <DreSettings onBack={() => setActive(null)} />;
  if (active === 'partners') return <PartnersSettings onBack={() => setActive(null)} />;
  if (active === 'export') return <ImportExportSettings onBack={() => setActive(null)} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie a estrutura do sistema</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Card
            key={s.key}
            className="shadow-card rounded-2xl border-border cursor-pointer hover:shadow-elevated transition-shadow"
            onClick={() => setActive(s.key)}
          >
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
