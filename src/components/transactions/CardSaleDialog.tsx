import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Hipercard', 'American Express', 'Pix', 'Outra'];
const MODALIDADES = [
  { value: 'debito', label: 'Débito' },
  { value: 'credito_avista', label: 'Crédito à vista' },
  { value: 'credito_parcelado', label: 'Crédito parcelado' },
  { value: 'antecipacao', label: 'Antecipação' },
  { value: 'pix', label: 'PIX' },
];

export default function CardSaleDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: categories } = useSupabaseCrud<Tables<'categories'>>('categories', 'name');
  const { data: accounts } = useSupabaseCrud<Tables<'accounts'>>('accounts', 'name');
  const { data: units } = useSupabaseCrud<Tables<'units'>>('units', 'name');

  const [date, setDate] = useState<Date>(new Date());
  const [unitId, setUnitId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [bandeira, setBandeira] = useState('Visa');
  const [modalidade, setModalidade] = useState('credito_avista');
  const [gross, setGross] = useState('');
  const [feeMode, setFeeMode] = useState<'percent' | 'value'>('percent');
  const [feeInput, setFeeInput] = useState('');
  const [expectedFee, setExpectedFee] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDate(new Date()); setUnitId(''); setAccountId(''); setCategoryId('');
      setBandeira('Visa'); setModalidade('credito_avista');
      setGross(''); setFeeMode('percent'); setFeeInput(''); setExpectedFee('');
    }
  }, [open]);

  const grossNum = parseFloat(gross) || 0;
  const feeNum = parseFloat(feeInput) || 0;
  const feeValue = feeMode === 'percent' ? grossNum * (feeNum / 100) : feeNum;
  const feePercent = grossNum > 0 ? (feeValue / grossNum) * 100 : 0;
  const netValue = Math.max(grossNum - feeValue, 0);
  const expectedNum = parseFloat(expectedFee) || 0;
  const overExpected = expectedNum > 0 && feePercent > expectedNum + 0.01;

  const filteredReceitaCats = categories.filter((c) => c.active && c.type === 'receita');
  const activeAccounts = accounts.filter((a) => a.active);
  const activeUnits = units.filter((u) => u.active);

  const handleSubmit = async () => {
    if (!user) return;
    if (grossNum <= 0) { toast({ title: 'Informe o valor bruto', variant: 'destructive' }); return; }
    setSaving(true);
    const groupId = crypto.randomUUID();
    const dateStr = format(date, 'yyyy-MM-dd');
    const descBase = `${bandeira} ${MODALIDADES.find(m => m.value === modalidade)?.label || ''}`.trim();

    const rows = [
      // 1) Receita bruta: entra no DRE, NÃO afeta caixa
      {
        type: 'receita' as const,
        description: `${descBase} (bruto)`,
        amount: grossNum,
        tax_amount: 0,
        net_amount: grossNum,
        competence_date: dateStr,
        payment_date: dateStr,
        status: 'recebido' as const,
        payment_method: modalidade.includes('cred') ? 'cartao_credito' : modalidade === 'debito' ? 'cartao_debito' : 'outro',
        category_id: categoryId || null,
        account_id: accountId || null,
        unit_id: unitId || null,
        affects_dre: true,
        affects_cashflow: false,
        card_sale_group_id: groupId,
        created_by: user.id,
        notes: `Venda no cartão — ${bandeira}. Taxa: ${feePercent.toFixed(2)}%${expectedNum ? ` (esperada ${expectedNum.toFixed(2)}%)` : ''}.`,
      },
      // 2) Entrada líquida no banco: NÃO entra no DRE, afeta caixa
      {
        type: 'receita' as const,
        description: `${descBase} (líquido em conta)`,
        amount: netValue,
        tax_amount: 0,
        net_amount: netValue,
        competence_date: dateStr,
        payment_date: dateStr,
        status: 'recebido' as const,
        payment_method: 'transferencia',
        category_id: null,
        account_id: accountId || null,
        unit_id: unitId || null,
        affects_dre: false,
        affects_cashflow: true,
        card_sale_group_id: groupId,
        created_by: user.id,
        notes: `Recebimento líquido vinculado à venda bruta ${groupId.substring(0, 8)}.`,
      },
    ];

    const { error } = await supabase.from('transactions').insert(rows as any);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao registrar venda', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Venda registrada', description: `Bruto R$ ${grossNum.toFixed(2)} • Líquido R$ ${netValue.toFixed(2)}` });
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-heading flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Venda no cartão
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Lança o <b>valor bruto</b> no DRE e a <b>entrada líquida</b> no caixa, separadamente.
          </p>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] px-6">
          <div className="space-y-4 pb-4">
            {/* Data + Unidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl bg-card border-border">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(date, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Unidade</Label>
                <Select value={unitId || '__none__'} onValueChange={v => setUnitId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bandeira + Modalidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bandeira</Label>
                <Select value={bandeira} onValueChange={setBandeira}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANDEIRAS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Modalidade</Label>
                <Select value={modalidade} onValueChange={setModalidade}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODALIDADES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Categoria + Conta */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Categoria (DRE)</Label>
                <Select value={categoryId || '__none__'} onValueChange={v => setCategoryId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {filteredReceitaCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Conta (banco que recebe)</Label>
                <Select value={accountId || '__none__'} onValueChange={v => setAccountId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {activeAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bruto */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Valor bruto da venda *</Label>
              <Input type="number" step="0.01" min="0" value={gross} onChange={e => setGross(e.target.value)} placeholder="0,00" className="rounded-xl bg-card border-border text-lg font-semibold" />
            </div>

            {/* Taxa */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Taxa cobrada</Label>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant={feeMode === 'percent' ? 'default' : 'outline'} className="h-6 text-xs rounded-md" onClick={() => setFeeMode('percent')}>%</Button>
                  <Button type="button" size="sm" variant={feeMode === 'value' ? 'default' : 'outline'} className="h-6 text-xs rounded-md" onClick={() => setFeeMode('value')}>R$</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" step="0.01" min="0" value={feeInput} onChange={e => setFeeInput(e.target.value)} placeholder={feeMode === 'percent' ? '5,00' : '0,00'} className="rounded-xl bg-card border-border" />
                <Input type="number" step="0.01" min="0" value={expectedFee} onChange={e => setExpectedFee(e.target.value)} placeholder="Taxa esperada (%)" className="rounded-xl bg-card border-border" />
              </div>
              {overExpected && (
                <p className="text-xs text-destructive">⚠️ Taxa real ({feePercent.toFixed(2)}%) acima da esperada ({expectedNum.toFixed(2)}%).</p>
              )}
            </div>

            {/* Resumo */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Bruto</span><span className="font-medium">R$ {grossNum.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Taxa ({feePercent.toFixed(2)}%)</span><span className="text-destructive">- R$ {feeValue.toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Líquido no banco</span><span className="font-bold text-[hsl(var(--success))]">R$ {netValue.toFixed(2)}</span></div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="p-6 pt-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" onClick={handleSubmit} disabled={saving || grossNum <= 0}>
            {saving ? 'Salvando...' : 'Registrar venda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}