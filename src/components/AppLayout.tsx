import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { BottomTabs } from '@/components/BottomTabs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useIsMobile } from '@/hooks/use-mobile';

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
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>

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
