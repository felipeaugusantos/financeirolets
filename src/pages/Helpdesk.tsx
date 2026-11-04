import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpdeskDialog } from '@/components/HelpdeskDialog';
import { listHelpdeskTickets, isHelpdeskOpen, type HelpdeskListItem } from '@/lib/helpdesk';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const priorityVariant = (p: string) => (p === 'critica' || p === 'alta' ? 'destructive' : 'secondary') as 'destructive' | 'secondary';

export default function Helpdesk() {
  const [items, setItems] = useState<HelpdeskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'abertos' | 'todos'>('abertos');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listHelpdeskTickets()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (filter === 'abertos' ? items.filter(i => isHelpdeskOpen(i.status)) : items), [items, filter]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Chamados</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button>
          <Button onClick={() => setOpen(true)}><LifeBuoy className="h-4 w-4 mr-1" />Abrir chamado</Button>
        </div>
      </div>
      <HelpdeskDialog open={open} onOpenChange={v => { setOpen(v); if (!v) void load(); }} />
      <Tabs value={filter} onValueChange={v => setFilter(v as 'abertos' | 'todos')}>
        <TabsList>
          <TabsTrigger value="abertos">Em aberto ({items.filter(i => isHelpdeskOpen(i.status)).length})</TabsTrigger>
          <TabsTrigger value="todos">Todos ({items.length})</TabsTrigger>
        </TabsList>
      </Tabs>
      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && <p className="text-sm text-muted-foreground">Carregando chamados…</p>}
      {!loading && !error && shown.length === 0 && <p className="text-sm text-muted-foreground">Nenhum chamado {filter === 'abertos' ? 'em aberto' : ''}.</p>}
      <div className="space-y-2">
        {shown.map(t => (
          <Card key={t.numero}>
            <CardContent className="p-4 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{t.numero}</span>
                <span className="font-medium">{t.assunto}</span>
                <Badge variant="outline" className="capitalize">{t.status.replace(/_/g, ' ')}</Badge>
                <Badge variant={priorityVariant(t.prioridade)} className="capitalize">{t.prioridade}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Aberto em {fmt(t.criado_em)}{t.solicitante ? ` por ${t.solicitante}` : ''} · Atualizado {fmt(t.atualizado_em)}
                {t.responsavel ? ` · Responsável: ${t.responsavel}` : ''}
              </p>
              {t.ultima_resposta && <p className="text-sm border-l-2 border-border pl-2">{t.ultima_resposta}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
