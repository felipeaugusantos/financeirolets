import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { openHelpdeskTicket, uploadHelpdeskImages, validateHelpdeskImages, type HelpdeskPriority } from '@/lib/helpdesk';
import { useAuth } from '@/contexts/AuthContext';
import { ImagePlus, X } from 'lucide-react';

export function HelpdeskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<HelpdeskPriority>('normal');
  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const { user } = useAuth();
  const valid = assunto.trim().length >= 3 && descricao.trim().length >= 3;

  const addImages = (list: FileList | null) => {
    if (!list) return;
    const next = [...images, ...Array.from(list)];
    const err = validateHelpdeskImages(next);
    if (err) { toast({ title: err, variant: 'destructive' }); return; }
    setImages(next);
  };

  const send = async () => {
    setSending(true);
    try {
      const links = images.length && user ? await uploadHelpdeskImages(user.id, images) : [];
      const desc = links.length ? `${descricao}\n\nImagens anexadas:\n${links.join('\n')}` : descricao;
      const numero = await openHelpdeskTicket({ assunto, descricao: desc, prioridade, tela: pathname, origem: 'manual' });
      toast({ title: `Chamado ${numero} aberto`, description: 'A equipe de suporte vai responder pela central.' });
      setAssunto(''); setDescricao(''); setPrioridade('normal'); setImages([]);
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Chamado não enviado', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Abrir chamado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="hd-assunto">Assunto</Label>
            <Input id="hd-assunto" maxLength={200} value={assunto} onChange={e => setAssunto(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hd-desc">Descrição</Label>
            <Textarea id="hd-desc" rows={5} maxLength={15000} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="O que aconteceu e o que você esperava" />
          </div>
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={v => setPrioridade(v as HelpdeskPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hd-img" className="inline-flex items-center gap-2 cursor-pointer text-primary">
              <ImagePlus className="h-4 w-4" /> Anexar imagem (até 3, 5 MB cada)
            </Label>
            <input id="hd-img" type="file" accept="image/*" multiple className="hidden"
              onChange={e => { addImages(e.target.files); e.target.value = ''; }} />
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-16 rounded-md object-cover border border-border" />
                    <button type="button" aria-label={`Remover ${f.name}`}
                      onClick={() => setImages(images.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Seu nome, e-mail e a tela atual ({pathname}) vão junto.</p>
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={!valid || sending}>{sending ? 'Enviando…' : 'Enviar chamado'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
