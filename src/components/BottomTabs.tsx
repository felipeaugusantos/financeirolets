import { LayoutDashboard, Receipt, CreditCard, BarChart3, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const tabs = [
  { label: 'Início', url: '/', icon: LayoutDashboard },
  { label: 'Lançar', url: '/lancamentos', icon: Receipt },
  { label: 'Contas', url: '/contas', icon: CreditCard },
  { label: 'DRE', url: '/relatorios', icon: BarChart3 },
  { label: 'Config', url: '/configuracoes', icon: Settings },
];

export function BottomTabs() {
  const location = useLocation();

  return (
    <nav className="bottom-tabs md:hidden border-border shadow-elevated">
      {tabs.map((tab) => {
        const active = location.pathname === tab.url;
        return (
          <Link
            key={tab.url}
            to={tab.url}
            className={`bottom-tab ${active ? 'active' : ''}`}
          >
            <tab.icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
