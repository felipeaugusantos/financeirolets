import { useEffect, useState } from 'react';
import { useKaikin } from './KaikinProvider';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { X, Sparkles } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import kaikinAvatar from '@/assets/kaikin-avatar.png.asset.json';

const HIDDEN_ROUTES = ['/login', '/reset-password'];
const STORAGE_KEY = 'kaikin:hidden';

export function KaikinFab() {
  const { toggle, isOpen } = useKaikin();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0');
  }, [hidden]);

  if (HIDDEN_ROUTES.includes(pathname)) return null;

  // Above mobile bottom tabs (~64px) when on mobile
  const bottomClass = isMobile ? 'bottom-20' : 'bottom-5';

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        aria-label="Mostrar Kaikin"
        title="Mostrar Kaikin"
        className={cn(
          'fixed right-3 z-50 h-8 w-8 rounded-full',
          'flex items-center justify-center',
          'bg-card/80 backdrop-blur border border-border text-muted-foreground',
          'shadow-card hover:text-foreground hover:bg-card transition-colors',
          bottomClass
        )}
      >
        <Sparkles className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed right-5 z-50',
        bottomClass,
        isOpen && 'opacity-0 pointer-events-none'
      )}
    >
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Ocultar Kaikin"
        title="Ocultar"
        className={cn(
          'absolute -top-1 -left-1 z-10 h-6 w-6 rounded-full',
          'flex items-center justify-center',
          'bg-card border border-border text-muted-foreground',
          'shadow-card hover:text-foreground hover:bg-accent transition-colors'
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label="Abrir Kaikin"
        className={cn(
          'h-16 w-16 rounded-full overflow-hidden',
          'ring-2 ring-primary/40 bg-gradient-to-br from-primary/20 to-secondary/20',
          'shadow-elevated transition-transform hover:scale-105 active:scale-95'
        )}
      >
        <img
          src={kaikinAvatar.url}
          alt="Kaikin"
          className="h-full w-full object-cover scale-[1.6]"
          style={{ objectPosition: '55% 22%' }}
        />
      </button>
    </div>
  );
}
