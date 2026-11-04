import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, LifeBuoy, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpdeskDialog } from '@/components/HelpdeskDialog';
import { replyHelpdeskTicket, listHelpdeskTickets, isHelpdeskOpen, validateHelpdeskImages, type HelpdeskListItem } from '@/lib/helpdesk';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const priorityVariant = (p: string) => (p === 'critica' || p === 'alta' ? 'destructive' : 'secondary') as 'destructive' | 'secondary';

export default function Helpdesk() {
  const [items, setItems] = useState<HelpdeskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'abertos' | 'todos'>('abertos');
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const imageInput = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => images.map(file => ({ file, url: URL.createObjectURL(file) })), [images]);
  useEffect(() => () => previews.forEach(p => URL.revokeObjectURL(p.url)), [previews]);
  const addImages = (files: FileList | null) => {
    if (!files) return;
    const next = [...images, ...Array.from(files)];
    const validation = validateHelpdeskImages(next);
    if (validation) { toast.error(validation); return; }
    setImages(next);
  };
  const send = async (numero: string) => {
    setSending(true);
    try {
      const r = await replyHelpdeskTicket(numero, text, images);
      if (r.aviso) toast.error(r.aviso);
      else { toast.success('Resposta enviada ao suporte'); setReplying(null); setText(''); setImages([]); void load(); }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); }
    finally { setSending(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await listHelpdeskTickets(); setItems(r.chamados); if (r.aviso) setError(r.aviso); }
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
              {replying === t.numero ? (
                <div className="space-y-2 pt-2">
                  <Textarea value={text} disabled={sending} onChange={e => setText(e.target.value)} placeholder="Escreva sua resposta ao suporte" rows={3} maxLength={15000} />
                  <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" aria-label="Imagens da resposta"
                    disabled={sending} onChange={e => { addImages(e.target.files); e.target.value = ''; }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={sending || images.length >= 3} onClick={() => imageInput.current?.click()}>
                      <ImagePlus className="h-4 w-4 mr-1" />Anexar imagem
                    </Button>
                    <span className="text-xs text-muted-foreground">Até 3 imagens, 5 MB cada · acesso por 7 dias</span>
                  </div>
                  {previews.length > 0 && <div className="flex flex-wrap gap-3 py-2">
                    {previews.map(({ file, url }, i) => <div key={url} className="relative">
                      <img src={url} alt={file.name} className="h-20 w-20 rounded-md object-cover border border-border" />
                      <Button type="button" size="icon" variant="destructive" title={`Remover ${file.name}`} aria-label={`Remover ${file.name}`}
                        disabled={sending} className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setImages(current => current.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>)}
                  </div>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => send(t.numero)} disabled={sending || text.trim().length < 2}>{sending ? 'Enviando…' : 'Enviar resposta'}</Button>
                    <Button size="sm" variant="ghost" disabled={sending} onClick={() => { setReplying(null); setText(''); setImages([]); }}>Cancelar</Button>
                  </div>
                </div>
              ) : isHelpdeskOpen(t.status) && (
                <Button size="sm" variant="outline" className="mt-1" disabled={sending} onClick={() => { setReplying(t.numero); setText(''); setImages([]); }}>Responder</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
