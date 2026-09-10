import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  History,
  Landmark,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Lançamentos', url: '/lancamentos', icon: Receipt },
  { title: 'Pagar / Receber', url: '/contas', icon: CreditCard },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
];

const reconciliationItems = [
  { title: 'Cadastro de banco', url: '/conciliacao/bancos' },
  { title: 'Conciliação', url: '/conciliacao/conciliar' },
  { title: 'Regras de Conciliação', url: '/conciliacao/regras' },
  { title: 'Conciliação de Cartão', url: '/conciliacao/cartao' },

];

const settingsItem = { title: 'Configurações', url: '/configuracoes', icon: Settings };
const releasesItem = { title: 'Novidades', url: '/novidades', icon: Sparkles };


const adminNavItems = [
  { title: 'Auditoria', url: '/auditoria', icon: History },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin } = useCurrentUserRoles();
  const items = isAdmin ? [...navItems] : [...navItems];
  const tailItems = isAdmin
    ? [settingsItem, releasesItem, ...adminNavItems]
    : [settingsItem, releasesItem];
  const reconciliationActive = location.pathname.startsWith('/conciliacao');


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <img src="/logo-circle.jpg" alt="Let's Cookies" className="h-8 w-8 rounded-full" />
            <span className="font-heading text-sm font-bold text-card-foreground">Let's Finance</span>
          </div>
        ) : (
          <img src="/logo-circle.jpg" alt="Let's Cookies" className="h-8 w-8 rounded-full mx-auto" />
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}



              <Collapsible defaultOpen={reconciliationActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={reconciliationActive} className="hover:bg-sidebar-accent/50">
                      <Landmark className="h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span>Conciliação Bancária</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </>
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!collapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {reconciliationItems.map((sub) => (
                          <SidebarMenuSubItem key={sub.url}>
                            <SidebarMenuSubButton asChild isActive={location.pathname === sub.url}>
                              <NavLink
                                to={sub.url}
                                className="hover:bg-sidebar-accent/50"
                                activeClassName="bg-sidebar-accent text-primary font-medium"
                              >
                                <span>{sub.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>

              {tailItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground truncate mb-1 px-2">
            {user.email}
          </p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
