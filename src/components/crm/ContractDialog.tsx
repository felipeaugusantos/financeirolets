import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ContractParty } from '@/lib/contractPdf';
import type { Tables } from '@/integrations/supabase/types';

function PartyFields({ title, value, onChange }: { title: string; value: ContractParty; onChange: (p: ContractParty) => void }) {
  const f = (k: keyof ContractParty, label: string) => <div className="space-y-1"><Label>{label}</Label><Input value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} /></div>;
  return <fieldset className="space-y-2 rounded-md border border-border p-3"><legend className="px-1 text-sm font-semibold">{title}</legend>
    <div className="grid gap-2 sm:grid-cols-2">{f('name', 'Nome / Razão social')}{f('document', 'CPF/CNPJ')}{f('address', 'Endereço')}{f('representative', 'Representante')}</div></fieldset>;
}

export function ContractDialog({ event, company, onClose }: { event: Tables<'crm_events'>; company?: Tables<'crm_companies'>; onClose: () => void }) {
  const [contratante, setContratante] = useState<ContractParty>({ name: company?.name ?? '', document: company?.document ?? '', address: company?.address ?? '', representative: company?.contact_name ?? '' });
  const [contratado, setContratado] = useState<ContractParty>({ name: "Let's Cookies", document: '', address: '', representative: '' });
  const [value, setValue] = useState(0);
  const [attendees, setAttendees] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [scope, setScope] = useState('');
  const [extra, setExtra] = useState(event.notes ?? '');
  const [city, setCity] = useState('');
  const ok = contratante.name.trim() && contratado.name.trim() && value > 0 && paymentTerms.trim() && city.trim();
  const download = async () => {
    const { buildContractPdf } = await import('@/lib/contractPdf');
    const issueDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    buildContractPdf({ contratante, contratado, eventTitle: event.title, eventDate: event.event_date, eventTime: event.event_time, location: event.location, attendees: attendees || undefined, value, paymentTerms, scope, extraClauses: extra, city, issueDate }).save(`Contrato - ${event.title}.pdf`);
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Contrato · {event.title}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">{event.event_date.split('-').reverse().join('/')} {event.event_time} · {event.location}</p>
    <div className="space-y-3">
      <PartyFields title="Contratante" value={contratante} onChange={setContratante} />
      <PartyFields title="Contratado" value={contratado} onChange={setContratado} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1"><Label>Valor total (R$)</Label><Input type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(Number(e.target.value))} /></div>
        <div className="space-y-1"><Label>Pessoas</Label><Input type="number" min={0} value={attendees} onChange={(e) => setAttendees(Number(e.target.value))} /></div>
        <div className="space-y-1"><Label>Cidade (foro)</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label>Condição de pagamento</Label><Input placeholder="Ex.: 50% na assinatura e 50% no evento via PIX" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></div>
      <div className="space-y-1"><Label>Escopo do serviço</Label><Textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Itens, montagem, entrega…" /></div>
      <div className="space-y-1"><Label>Condições específicas</Label><Textarea value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button disabled={!ok} onClick={download}>Baixar contrato</Button></DialogFooter>
  </DialogContent></Dialog>;
}
