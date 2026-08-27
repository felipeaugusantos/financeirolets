import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { BottomTabs } from '@/components/BottomTabs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useIsMobile } from '@/hooks/use-mobile';
import { APP_VERSION, IS_HOMOLOG } from '@/lib/appEnv';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full overflow-x-hidden">
        {!isMobile && <AppSidebar />}

        <div className="flex-1 flex flex-col min-w-0 w-0">
          {/* Header */}
          <header className="h-14 flex items-center gap-3 border-b border-border px-4 bg-background sticky top-0 z-40">
            {!isMobile && <SidebarTrigger />}
            {isMobile && (
              <img src="/logo-circle.jpg" alt="Let's Cookies" className="h-8 w-8 rounded-full" />
            )}
            <h2 className="font-heading text-base font-semibold text-card-foreground">Let's Finance</h2>
            {IS_HOMOLOG && (
              <span className="rounded-full bg-warning/15 text-warning px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                Homologação
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:inline text-[10px] text-muted-foreground">v{APP_VERSION}</span>
              <ThemeToggle />
            </div>
          </header>

          {IS_HOMOLOG && (
            <div className="bg-warning/10 border-b border-warning/40 px-4 py-1.5 text-center text-[11px] text-warning">
              Ambiente de homologação com dados fictícios — nada aqui afeta o financeiro real do cliente.
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto min-w-0">
            <div className="min-w-0 max-w-full">{children}</div>
          </main>

          {/* Mobile bottom tabs */}
          {isMobile && <BottomTabs />}
        </div>
      </div>
    </SidebarProvider>
  );
}
