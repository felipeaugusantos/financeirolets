import { useState } from 'react';
import { Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import SelectWithAdd from '@/components/ui/select-with-add';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  tab: 'pagar' | 'receber';
  onDone: () => void;
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'outro', label: 'Outro' },
];

export default function BatchPayDialog({ open, onOpenChange, ids, tab, onDone }: Props) {
  const { data: accounts, create: createAccount } = useSupabaseCrud<Tables<'accounts'>>('accounts');
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState('pix');
  const [date, setDate] = useState(todayLocalISO());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const status = tab === 'pagar' ? 'pago' : 'recebido';

  const handleSubmit = async () => {
    if (ids.length === 0) return;
    setSaving(true);
    const updateData: Record<string, unknown> = {
      status,
      payment_date: date,
      payment_method: method,
    };
    if (accountId) updateData.account_id = accountId;

    const { error } = await supabase.from('transactions').update(updateData).in('id', ids);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro na baixa em lote', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${ids.length} conta(s) baixada(s)`, description: `Marcadas como ${status}` });
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Baixa em Lote ({ids.length})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-3 text-sm">
            Marcar <strong>{ids.length}</strong> conta(s) como{' '}
            <strong>{status === 'pago' ? 'pagas' : 'recebidas'}</strong>.
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data</Label>
            <Input type="date" className="rounded-xl" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Forma de Pagamento</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Conta</Label>
            <SelectWithAdd
              value={accountId}
              onValueChange={setAccountId}
              options={(accounts as any[]).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
              placeholder="Selecione..."
              noneLabel="Selecione..."
              addLabel="+ Nova Conta"
              dialogTitle="Nova Conta"
              extraFields={[{
                key: 'type', label: 'Tipo', type: 'select', options: [
                  { value: 'banco', label: 'Banco' },
                  { value: 'caixa', label: 'Caixa' },
                  { value: 'carteira', label: 'Carteira Digital' },
                ],
              }]}
              onAdd={async (d) => {
                const id = await createAccount({ name: d.name, type: d.type || 'banco', active: true } as any);
                return id || null;
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" onClick={handleSubmit} disabled={saving}>
            <Banknote className="h-4 w-4 mr-1" />
            {saving ? 'Processando...' : 'Confirmar Baixa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
