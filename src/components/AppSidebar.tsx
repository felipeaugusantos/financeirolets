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
  Bike, ChefHat,
  Building2,
  Briefcase,
  ChevronsLeft,
  ChevronsRight,
  LifeBuoy,
  BookOpen,
  Star,
} from 'lucide-react';
import { useMenuFavorites } from '@/hooks/useMenuFavorites';
import { reportViews, reportUrl } from '@/lib/reportViews';
import { useState } from 'react';
import { HelpdeskDialog } from '@/components/HelpdeskDialog';
import { NavLink } from '@/components/NavLink';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { canAccessPath } from '@/lib/routeAccess';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuAction,
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
  { title: 'Depreciação e CSLL', url: '/lancamentos-contabeis', icon: Receipt },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
  { title: 'iFood', url: '/ifood', icon: Bike },
  { title: 'Fábrica & Operações', url: '/fabrica', icon: ChefHat },
  { title: 'CRM', url: '/crm/agenda', icon: Building2 },
  { title: 'Chamados', url: '/chamados', icon: LifeBuoy },
  { title: 'Manual', url: '/manual', icon: BookOpen },
];

const pick = (...urls: string[]) => navItems.filter((i) => urls.includes(i.url));
const overviewItems = pick('/');
const reportItems = reportViews.map((r) => ({ title: r.title, url: reportUrl(r.key) }));
const financeItems = pick('/lancamentos', '/lancamentos-contabeis');
const operationsItems = pick('/fabrica', '/crm/agenda', '/ifood');
const supportItems = pick('/manual', '/chamados');

const managementItems = [
  { title: 'Contas a Pagar', url: '/contas?tab=pagar', match: (p: string, s: string) => p === '/contas' && !s.includes('tab=receber') },
  { title: 'Contas a Receber', url: '/contas?tab=receber', match: (p: string, s: string) => p === '/contas' && s.includes('tab=receber') },
  { title: 'Importação de Notas', url: '/gestao/notas', match: (p: string) => p === '/gestao/notas' },
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
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const { isAdmin, roles } = useCurrentUserRoles();
  const canReconcile = canAccessPath('/conciliacao', roles);
  const items = isAdmin ? [...navItems] : [...navItems];
  const tailItems = isAdmin
    ? [settingsItem, releasesItem, ...adminNavItems]
    : [settingsItem, releasesItem];
  const reconciliationActive = location.pathname.startsWith('/conciliacao');
  const managementActive = location.pathname === '/contas' || location.pathname.startsWith('/gestao');
  const { favorites, toggle, isFavorite } = useMenuFavorites(user?.id);
  const allEntries = [
    ...items.map((i) => ({ title: i.title, url: i.url, icon: i.icon })),
    ...reportItems.map((i) => ({ title: i.title, url: i.url, icon: BarChart3 })),
    ...managementItems.map((i) => ({ title: i.title, url: i.url, icon: Briefcase })),
    ...(canReconcile ? reconciliationItems.map((i) => ({ title: i.title, url: i.url, icon: Landmark })) : []),
    ...tailItems.map((i) => ({ title: i.title, url: i.url, icon: i.icon })),
  ];
  const favoriteEntries = favorites
    .map((url) => allEntries.find((e) => e.url === url))
    .filter((e): e is (typeof allEntries)[number] => Boolean(e));
  const isUrlActive = (url: string) => {
    const [path, query] = url.split('?');
    if (query) {
      const want = new URLSearchParams(query);
      const have = new URLSearchParams(location.search);
      return location.pathname === path && [...want.entries()].every(([k, v]) => have.get(k) === v);
    }
    return location.pathname === path;
  };
  const starButton = (url: string, title: string) => (
    <SidebarMenuAction
      showOnHover={!isFavorite(url)}
      onClick={() => toggle(url)}
      aria-label={isFavorite(url) ? `Remover ${title} dos favoritos` : `Favoritar ${title}`}
      title={isFavorite(url) ? 'Remover dos favoritos' : 'Favoritar'}
    >
      <Star className={isFavorite(url) ? 'fill-accent text-accent' : 'text-muted-foreground'} />
    </SidebarMenuAction>
  );
  const subStar = (url: string, title: string) => (
    <button
      type="button"
      onClick={() => toggle(url)}
      aria-label={isFavorite(url) ? `Remover ${title} dos favoritos` : `Favoritar ${title}`}
      title={isFavorite(url) ? 'Remover dos favoritos' : 'Favoritar'}
      className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-sidebar-accent ${isFavorite(url) ? '' : 'opacity-0 group-hover/sub:opacity-100 focus:opacity-100'}`}
    >
      <Star className={`h-3.5 w-3.5 ${isFavorite(url) ? 'fill-accent text-accent' : 'text-muted-foreground'}`} />
    </button>
  );


  const renderNav = (list: typeof navItems) => list.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url || (item.url !== '/' && location.pathname.startsWith(item.url.split('/').slice(0, 2).join('/') + '/'))}>
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
                  {!collapsed && starButton(item.url, item.title)}
                </SidebarMenuItem>
              ));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-2">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <img src="/logo-circle.jpg" alt="Let's Cookies" className="h-8 w-8 shrink-0 rounded-full object-contain" />
            <span className="font-heading text-sm font-bold text-card-foreground">Let's Finance</span>
            <button
              type="button"
              onClick={toggleSidebar}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-primary"
              aria-label="Recolher menu"
              title="Recolher menu"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <img src="/logo-circle.jpg" alt="Let's Cookies" className="h-8 w-8 shrink-0 rounded-full object-contain" />
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-primary"
              aria-label="Expandir menu"
              title="Expandir menu"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="gap-1"><Star className="h-3 w-3" /> Favoritos</SidebarGroupLabel>
          <SidebarGroupContent>
            {favoriteEntries.length === 0 ? (
              !collapsed && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Toque na estrela ao lado de um item do menu para fixá-lo aqui.
                </p>
              )
            ) : (
              <SidebarMenu>
                {favoriteEntries.map((item) => (
                  <SidebarMenuItem key={`fav-${item.url}`}>
                    <SidebarMenuButton asChild isActive={isUrlActive(item.url)} tooltip={item.title}>
                      <Link
                        to={item.url}
                        className={isUrlActive(item.url) ? 'bg-sidebar-accent text-primary font-medium' : 'hover:bg-sidebar-accent/50'}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                    {!collapsed && starButton(item.url, item.title)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <Collapsible defaultOpen className="group/section">
        <SidebarGroup>
          {!collapsed && (
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center hover:text-primary">
              Visão Geral
              <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/section:rotate-180" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          )}
          <CollapsibleContent forceMount={collapsed ? true : undefined} className={collapsed ? '' : 'data-[state=closed]:hidden'}>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNav(overviewItems)}
              <Collapsible defaultOpen={location.pathname === '/relatorios'} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={location.pathname === '/relatorios'} className="hover:bg-sidebar-accent/50" tooltip="Relatórios">
                      <BarChart3 className="h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span>Relatórios</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </>
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!collapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem className="group/sub relative">
                          <SidebarMenuSubButton asChild isActive={location.pathname === '/relatorios' && !location.search.includes('r=')}>
                            <Link to="/relatorios" className="hover:bg-sidebar-accent/50"><span>Todos os relatórios</span></Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        {reportItems.map((sub) => (
                          <SidebarMenuSubItem key={sub.url} className="group/sub relative">
                            <SidebarMenuSubButton asChild isActive={isUrlActive(sub.url)}>
                              <Link
                                to={sub.url}
                                className={isUrlActive(sub.url) ? 'bg-sidebar-accent text-primary font-medium pr-7' : 'hover:bg-sidebar-accent/50 pr-7'}
                              >
                                <span>{sub.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                            {subStar(sub.url, sub.title)}
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
        </Collapsible>

        <Collapsible defaultOpen className="group/section">
        <SidebarGroup>
          {!collapsed && (
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center hover:text-primary">
              Financeiro & Caixa
              <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/section:rotate-180" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          )}
          <CollapsibleContent forceMount={collapsed ? true : undefined} className={collapsed ? '' : 'data-[state=closed]:hidden'}>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNav(financeItems)}

              <Collapsible defaultOpen={managementActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={managementActive} className="hover:bg-sidebar-accent/50">
                      <Briefcase className="h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span>Gestão Empresarial</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </>
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!collapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {managementItems.map((sub) => {
                          const active = sub.match(location.pathname, location.search);
                          return (
                            <SidebarMenuSubItem key={sub.url} className="group/sub relative">
                              <SidebarMenuSubButton asChild isActive={active}>
                                <Link
                                  to={sub.url}
                                  className={active ? 'bg-sidebar-accent text-primary font-medium' : 'hover:bg-sidebar-accent/50'}
                                >
                                  <span>{sub.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                              {subStar(sub.url, sub.title)}
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>

              {canReconcile && (
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
                          <SidebarMenuSubItem key={sub.url} className="group/sub relative">
                            <SidebarMenuSubButton asChild isActive={location.pathname === sub.url}>
                              <NavLink
                                to={sub.url}
                                className="hover:bg-sidebar-accent/50"
                                activeClassName="bg-sidebar-accent text-primary font-medium"
                              >
                                <span>{sub.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                            {subStar(sub.url, sub.title)}
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
        </Collapsible>

        <Collapsible defaultOpen className="group/section">
        <SidebarGroup>
          {!collapsed && (
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center hover:text-primary">
              Operações & Vendas
              <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/section:rotate-180" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          )}
          <CollapsibleContent forceMount={collapsed ? true : undefined} className={collapsed ? '' : 'data-[state=closed]:hidden'}>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNav(operationsItems)}
            </SidebarMenu>
          </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
        </Collapsible>

        <Collapsible defaultOpen className="group/section">
        <SidebarGroup>
          {!collapsed && (
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="flex w-full items-center hover:text-primary">
              Apoio
              <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/section:rotate-180" />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          )}
          <CollapsibleContent forceMount={collapsed ? true : undefined} className={collapsed ? '' : 'data-[state=closed]:hidden'}>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNav([...supportItems, ...tailItems])}
            </SidebarMenu>
          </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
        </Collapsible>

      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground truncate mb-1 px-2">
            {user.email}
          </p>
        )}
        <HelpdeskDialog open={helpOpen} onOpenChange={setHelpOpen} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setHelpOpen(true)}>
              <LifeBuoy className="h-4 w-4" />
              {!collapsed && <span>Abrir chamado</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
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
