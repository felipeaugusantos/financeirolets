import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, LogOut, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('') || '?';
}

/** Topo: atalho "Novo lançamento", unidade(s) do usuário e avatar com menu. Só leitura. */
export function HeaderUserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [units, setUnits] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const [{ data: prof }, { data: uu }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('user_units').select('unit_id').eq('user_id', user.id),
      ]);
      const ids = (uu ?? []).map(r => r.unit_id).filter(Boolean) as string[];
      const { data: un } = ids.length
        ? await supabase.from('units').select('name').in('id', ids)
        : { data: [] as { name: string }[] };
      if (cancel) return;
      setName(prof?.full_name || user.email || '');
      setUnits((un ?? []).map(u => u.name));
    })();
    return () => { cancel = true; };
  }, [user]);

  if (!user) return null;
  const unitLabel = units.length === 0 ? 'Todas as unidades' : units.length === 1 ? units[0] : `${units.length} unidades`;

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" className="rounded-xl h-8 gap-1" onClick={() => navigate('/lancamentos?novo=1')} aria-label="Novo lançamento">
        <Plus className="h-4 w-4" /><span className="hidden sm:inline">Lançamento</span>
      </Button>
      <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground max-w-[180px]" title={units.join(', ')}>
        <Building2 className="h-3.5 w-3.5 shrink-0 text-secondary" /><span className="truncate">{unitLabel}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menu do usuário">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials(name)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="truncate text-sm">{name}</div>
            <div className="truncate text-[11px] font-normal text-muted-foreground">{user.email}</div>
            <div className="truncate text-[11px] font-normal text-muted-foreground">{unitLabel}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/manual')}><BookOpen className="mr-2 h-4 w-4" />Manual</DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
