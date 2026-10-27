import { useEffect, useState } from 'react';
import { Plus, Trash2, FileDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PAYMENT_TERMS } from '@/lib/crmRules';
import { buildProposalPdf, proposalTotals } from '@/lib/proposalPdf';
import type { Tables } from '@/integrations/supabase/types';

type Product = { id: string; name: string; price: number; package: string };
type Line = { productId: string; packages: number; unitPrice: number };
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ProposalDialog({ opportunity, company, onClose }: { opportunity: Tables<'crm_opportunities'>; company?: Tables<'crm_companies'>; onClose: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [validDays, setValidDays] = useState(7);
  const [terms, setTerms] = useState(company?.payment_terms && PAYMENT_TERMS[company.payment_terms] ? company.payment_terms : 'boleto_7');
  const [notes, setNotes] = useState(opportunity.requirements ?? '');
  useEffect(() => { supabase.from('crm_products').select('id,name,price,package').eq('active', true).order('name').then(({ data }) => setProducts((data ?? []) as Product[])); }, []);

  const named = lines.filter((l) => l.productId).map((l) => ({ name: products.find((p) => p.id === l.productId)?.name ?? '', packages: l.packages, unitPrice: l.unitPrice }));
  const t = proposalTotals(named, discount);
  const termLabel = (k: string) => { const v = (PAYMENT_TERMS as Record<string, unknown>)[k]; return typeof v === 'object' && v && 'label' in v ? String((v as { label: string }).label) : k.replace('_', ' '); };

  const download = () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const doc = buildProposalPdf({ company: company?.name ?? 'Cliente', contact: company?.contact_name, title: opportunity.title, eventDate: opportunity.event_date, eventTime: opportunity.event_time, attendees: opportunity.attendees, address: opportunity.address, lines: named, discountPct: discount, paymentTerms: termLabel(terms), validDays, notes, issueDate: today });
    doc.save(`Proposta - ${company?.name ?? opportunity.title}.pdf`);
  };

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Proposta em PDF · {opportunity.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_100px_32px] items-end gap-2">
              <div className="space-y-1"><Label>Produto</Label>
                <Select value={l.productId} onValueChange={(v) => set(i, { productId: v, unitPrice: Number(products.find((p) => p.id === v)?.price ?? 0) })}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.package})</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Qtd.</Label><Input type="number" min={0} value={l.packages} onChange={(e) => set(i, { packages: Number(e.target.value) })} /></div>
              <div className="space-y-1"><Label>Preço</Label><Input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: Number(e.target.value) })} /></div>
              <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { productId: '', packages: 1, unitPrice: 0 }])}><Plus className="mr-1 h-4 w-4" />Adicionar produto</Button>
          {!products.length && <p className="text-xs text-muted-foreground">Cadastre os produtos em Fábrica › Produtos.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Desconto (%)</Label><Input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Validade (dias)</Label><Input type="number" min={1} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} /></div>
            <div className="space-y-1"><Label>Pagamento</Label>
              <Select value={terms} onValueChange={setTerms}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(PAYMENT_TERMS).map((k) => <SelectItem key={k} value={k}>{termLabel(k)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1"><Label>Observações</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: entrega inclusa, montagem da mesa..." /></div>
          <div className="rounded-lg bg-muted p-3 text-sm">
            Subtotal {money(t.subtotal)}{t.discount > 0 && ` · Desconto ${money(t.discount)}`} · <b>Total {money(t.total)}</b>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button disabled={!named.length} onClick={download}><FileDown className="mr-2 h-4 w-4" />Baixar PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
