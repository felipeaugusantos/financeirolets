import { Sparkles } from 'lucide-react';
import { useKaikin } from './KaikinProvider';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const HIDDEN_ROUTES = ['/login', '/reset-password'];

export function KaikinFab() {
  const { toggle, isOpen } = useKaikin();
  const { pathname } = useLocation();
  if (HIDDEN_ROUTES.includes(pathname)) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Abrir Kaikin"
      className={cn(
        'fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full',
        'flex items-center justify-center text-primary-foreground',
        'shadow-elevated transition-transform hover:scale-105 active:scale-95',
        'bg-gradient-to-br from-primary to-secondary',
        isOpen && 'opacity-0 pointer-events-none'
      )}
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}
