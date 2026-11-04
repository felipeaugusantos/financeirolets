import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { openHelpdeskTicket, type HelpdeskPriority } from '@/lib/helpdesk';

export function HelpdeskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<HelpdeskPriority>('normal');
  const [sending, setSending] = useState(false);
  const valid = assunto.trim().length >= 3 && descricao.trim().length >= 3;

  const send = async () => {
    setSending(true);
    try {
      const numero = await openHelpdeskTicket({ assunto, descricao, prioridade, tela: pathname, origem: 'manual' });
      toast({ title: `Chamado ${numero} aberto`, description: 'A equipe de suporte vai responder pela central.' });
      setAssunto(''); setDescricao(''); setPrioridade('normal');
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
          <p className="text-xs text-muted-foreground">Seu nome, e-mail e a tela atual ({pathname}) vão junto.</p>
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={!valid || sending}>{sending ? 'Enviando…' : 'Enviar chamado'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
