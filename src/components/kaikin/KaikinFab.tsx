import { useKaikin } from './KaikinProvider';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import kaikinAvatar from '@/assets/kaikin-avatar.png.asset.json';

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
        'fixed bottom-5 right-5 z-50 h-16 w-16 rounded-full overflow-hidden',
        'ring-2 ring-primary/40 bg-gradient-to-br from-primary/20 to-secondary/20',
        'shadow-elevated transition-transform hover:scale-105 active:scale-95',
        isOpen && 'opacity-0 pointer-events-none'
      )}
    >
      <img
        src={kaikinAvatar.url}
        alt="Kaikin"
        className="h-full w-full object-cover scale-[1.6]"
        style={{ objectPosition: '55% 22%' }}
      />
    </button>
  );
}
