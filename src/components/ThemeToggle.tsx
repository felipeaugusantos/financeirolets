import { Button } from '@/components/ui/button';
import { Sun, Sparkles } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isPink = theme === 'pink';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={isPink ? 'Modo claro' : 'Modo rosa'}
      aria-label="Alternar tema"
      className="h-9 w-9"
    >
      {isPink ? <Sun className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-primary" />}
    </Button>
  );
}
