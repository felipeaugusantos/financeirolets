import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn, parseDateUTC } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import SelectWithAdd from '@/components/ui/select-with-add';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import type { TransactionInput, AllocationInput } from '@/hooks/useTransactions';
import {
  isLegacyCategory,
  isSalaryCategory,
  isPartnerRequired,
  CATEGORY_HELP,
  validateCategoryRules,
} from '@/lib/categoryRules';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: TransactionInput) => Promise<boolean>;
  initialData?: Partial<TransactionInput> & { id?: string };
}

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'recebido', label: 'Recebido' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'agendado', label: 'Agendado' },
];

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'outro', label: 'Outro' },
];

function DatePickerField({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={cn('w-full justify-start text-left font-normal rounded-xl bg-card border-border', !value && 'text-muted-foreground')}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, 'dd/MM/yyyy') : 'Selecionar'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={(d) => onChange(d || undefined)} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function TransactionFormDialog({ open, onOpenChange, onSave, initialData }: Props) {
  const { data: categories, create: createCategory, fetch: refetchCategories } = useSupabaseCrud<any>('categories', 'name');
  const { data: accounts, create: createAccount, fetch: refetchAccounts } = useSupabaseCrud<any>('accounts', 'name');
  const { data: partners, create: createPartner, fetch: refetchPartners } = useSupabaseCrud<any>('partners', 'name');
  const { data: units, create: createUnit, fetch: refetchUnits } = useSupabaseCrud<any>('units', 'name');
  const { data: fronts, create: createFront, fetch: refetchFronts } = useSupabaseCrud<any>('business_fronts', 'name');

  const [type, setType] = useState<'receita' | 'despesa'>('despesa');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [competenceDate, setCompetenceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [status, setStatus] = useState('pendente');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [frontId, setFrontId] = useState('');
  const [notes, setNotes] = useState('');
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState('2');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'semanal' | 'mensal' | 'anual'>('mensal');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>();
  const [allocations, setAllocations] = useState<AllocationInput[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [affectsDre, setAffectsDre] = useState(true);
  const [affectsCashflow, setAffectsCashflow] = useState(true);

  const isEditing = !!initialData?.id;

  useEffect(() => {
    // Hidrata o formulário apenas quando o diálogo abre (ou muda o registro editado).
    // Depender do objeto `initialData` inteiro fazia o efeito rodar de novo a cada
    // render do pai, sobrescrevendo datas já escolhidas pelo usuário.
    if (!open) return;
    if (initialData) {
      setType(initialData.type || 'despesa');
      setDescription(initialData.description || '');
      setAmount(String(initialData.amount || ''));
      setTaxAmount(String(initialData.tax_amount || '0'));
      setCompetenceDate(initialData.competence_date ? parseDateUTC(initialData.competence_date) : new Date());
      setDueDate(initialData.due_date ? parseDateUTC(initialData.due_date) : undefined);
      setPaymentDate(initialData.payment_date ? parseDateUTC(initialData.payment_date) : undefined);
      setStatus(initialData.status || 'pendente');
      setPaymentMethod(initialData.payment_method || '');
      setCategoryId(initialData.category_id || '');
      setAccountId(initialData.account_id || '');
      setPartnerId(initialData.partner_id || '');
      setUnitId(initialData.unit_id || '');
      setFrontId(initialData.front_id || '');
      setNotes(initialData.notes || '');
      setAffectsDre(initialData.affects_dre ?? true);
      setAffectsCashflow(initialData.affects_cashflow ?? true);
      // Load existing allocations for editing
      if (initialData.id) {
        supabase.from('transaction_allocations')
          .select('unit_id, front_id, allocation_type, percentage, amount')
          .eq('transaction_id', initialData.id)
          .then(({ data: allocs }) => {
            if (allocs && allocs.length > 0) {
              setAllocations(allocs.map((a: any) => ({
                unit_id: a.unit_id || undefined,
                front_id: a.front_id || undefined,
                allocation_type: a.allocation_type || 'percentual',
                percentage: a.percentage ?? undefined,
                amount: a.amount ?? undefined,
              })));
              setAllocOpen(true);
            } else {
              setAllocations([]);
            }
          });
      }
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?.id]);

  const resetForm = () => {
    setType('despesa');
    setDescription('');
    setAmount('');
    setTaxAmount('0');
    setCompetenceDate(new Date());
    setDueDate(undefined);
    setPaymentDate(undefined);
    setStatus('pendente');
    setPaymentMethod('');
    setCategoryId('');
    setAccountId('');
    setPartnerId('');
    setUnitId('');
    setFrontId('');
    setNotes('');
    setIsInstallment(false);
    setInstallmentCount('2');
    setIsRecurring(false);
    setRecurrenceFrequency('mensal');
    setRecurrenceEndDate(undefined);
    setAllocations([]);
    setFiles([]);
    setAllocOpen(false);
    setAffectsDre(true);
    setAffectsCashflow(true);
  };

  const netAmount = (parseFloat(amount) || 0) - (parseFloat(taxAmount) || 0);
  // Categorias legadas somem do seletor de lançamentos novos, mas continuam visíveis
  // quando o lançamento em edição já usa uma delas (para não alterar o histórico).
  const filteredCategories = categories.filter(
    (c: any) =>
      c.active &&
      c.type === type &&
      (!isLegacyCategory(c.id) || c.id === initialData?.category_id)
  );
  const activeAccounts = accounts.filter((a: any) => a.active);
  const activePartners = partners.filter((p: any) => p.active);
  const activeUnits = units.filter((u: any) => u.active);
  const activeFronts = fronts.filter((f: any) => f.active);

  const unitCodeById = new Map<string, string | null>(
    units.map((u: any) => [u.id, u.code ?? null])
  );
  const { errors: ruleErrors, warnings: ruleWarnings } = validateCategoryRules({
    categoryId: categoryId || undefined,
    unitId: unitId || undefined,
    partnerId: partnerId || undefined,
    unitCodeById,
  });
  const categoryHelp = categoryId ? CATEGORY_HELP[categoryId] : undefined;

  const addAllocation = () => {
    setAllocations(prev => [...prev, { allocation_type: 'percentual', percentage: 0 }]);
  };

  const removeAllocation = (idx: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAllocation = (idx: number, field: string, value: any) => {
    setAllocations(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    if (ruleErrors.length > 0) return;
    setSaving(true);
    const input: TransactionInput = {
      type,
      description: description.trim(),
      amount: parseFloat(amount),
      tax_amount: parseFloat(taxAmount) || 0,
      competence_date: format(competenceDate, 'yyyy-MM-dd'),
      due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
      payment_date: paymentDate ? format(paymentDate, 'yyyy-MM-dd') : undefined,
      status,
      payment_method: paymentMethod || undefined,
      category_id: categoryId || undefined,
      account_id: accountId || undefined,
      partner_id: partnerId || undefined,
      unit_id: unitId || undefined,
      front_id: frontId || undefined,
      notes: notes || undefined,
      is_installment: isInstallment,
      installment_count: isInstallment ? parseInt(installmentCount) : undefined,
      allocations: allocations.length > 0 ? allocations : undefined,
      files: files.length > 0 ? files : undefined,
      is_recurring: isRecurring && !isInstallment,
      recurrence_frequency: isRecurring && !isInstallment ? recurrenceFrequency : undefined,
      recurrence_end_date: isRecurring && !isInstallment && recurrenceEndDate ? format(recurrenceEndDate, 'yyyy-MM-dd') : undefined,
      affects_dre: affectsDre,
      affects_cashflow: affectsCashflow,
    };
    const ok = await onSave(input);
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-heading">{isEditing ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] px-6">
          <div className="space-y-5 pb-4">
            {/* Type toggle */}
            <div className="flex gap-2">
              <Button type="button" variant={type === 'receita' ? 'default' : 'outline'} className={cn('flex-1 rounded-xl', type === 'receita' && 'bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]')} onClick={() => setType('receita')}>
                Receita
              </Button>
              <Button type="button" variant={type === 'despesa' ? 'default' : 'outline'} className={cn('flex-1 rounded-xl', type === 'despesa' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')} onClick={() => setType('despesa')}>
                Despesa
              </Button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Descrição *</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Compra de insumos" className="rounded-xl bg-card border-border" />
            </div>

            {/* Amount row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor Bruto *</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="rounded-xl bg-card border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Impostos</Label>
                <Input type="number" step="0.01" min="0" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} placeholder="0,00" className="rounded-xl bg-card border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor Líquido</Label>
                <Input value={netAmount.toFixed(2)} readOnly className="rounded-xl bg-muted border-border font-semibold" />
              </div>
            </div>

            {/* Visibilidade DRE x Caixa */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold text-card-foreground">Onde este lançamento aparece?</Label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant={affectsDre && affectsCashflow ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7 rounded-lg"
                  onClick={() => { setAffectsDre(true); setAffectsCashflow(true); }}
                >
                  Normal
                </Button>
                <Button
                  type="button"
                  variant={affectsDre && !affectsCashflow ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7 rounded-lg"
                  onClick={() => { setAffectsDre(true); setAffectsCashflow(false); }}
                >
                  Taxa / Ajuste (só DRE)
                </Button>
                <Button
                  type="button"
                  variant={!affectsDre && affectsCashflow ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7 rounded-lg"
                  onClick={() => { setAffectsDre(false); setAffectsCashflow(true); }}
                >
                  Transferência (só Caixa)
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2">
                  <Label htmlFor="aff-dre" className="text-xs cursor-pointer">📊 Aparece no DRE</Label>
                  <Switch id="aff-dre" checked={affectsDre} onCheckedChange={setAffectsDre} />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2">
                  <Label htmlFor="aff-cash" className="text-xs cursor-pointer">🏦 Aparece no Caixa</Label>
                  <Switch id="aff-cash" checked={affectsCashflow} onCheckedChange={setAffectsCashflow} />
                </div>
              </div>
              <p className={cn(
                'text-xs px-2',
                !affectsDre && !affectsCashflow ? 'text-destructive font-medium' : 'text-muted-foreground'
              )}>
                {affectsDre && affectsCashflow && 'Lançamento normal: entra no resultado e movimenta o saldo.'}
                {affectsDre && !affectsCashflow && 'Ex.: taxa de cartão, depreciação. Entra no resultado, não mexe no saldo.'}
                {!affectsDre && affectsCashflow && 'Ex.: transferência, empréstimo, recebimento líquido de cartão. Movimenta o saldo, não entra no resultado.'}
                {!affectsDre && !affectsCashflow && '⚠️ Esse lançamento não aparece em lugar nenhum. Tem certeza?'}
              </p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-3">
              <DatePickerField label="Competência *" value={competenceDate} onChange={(d) => d && setCompetenceDate(d)} />
              <DatePickerField label="Vencimento" value={dueDate} onChange={setDueDate} />
              <DatePickerField label="Pagamento" value={paymentDate} onChange={setPaymentDate} />
            </div>

            {/* Status + Payment method */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Forma de Pagamento</Label>
                <Select value={paymentMethod || '__none__'} onValueChange={v => setPaymentMethod(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {PAYMENT_METHODS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Selects row */}
            <div className="grid grid-cols-2 gap-3">
             <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Categoria</Label>
                <SelectWithAdd
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={filteredCategories.map((c: any) => ({ id: c.id, name: c.name }))}
                  noneLabel="Nenhuma"
                  addLabel="+ Nova Categoria"
                  dialogTitle="Nova Categoria"
                  onAdd={async (d) => {
                    const id = await createCategory({ name: d.name, type, active: true });
                    if (id) await refetchCategories();
                    return id || null;
                  }}
                />
                {categoryHelp && (
                  <p className="text-[11px] text-muted-foreground leading-snug">{categoryHelp}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Conta</Label>
                <SelectWithAdd
                  value={accountId}
                  onValueChange={setAccountId}
                  options={activeAccounts.map((a: any) => ({ id: a.id, name: a.name }))}
                  noneLabel="Nenhuma"
                  addLabel="+ Nova Conta"
                  dialogTitle="Nova Conta"
                  extraFields={[{ key: 'type', label: 'Tipo', type: 'select', options: [
                    { value: 'banco', label: 'Banco' }, { value: 'caixa', label: 'Caixa' }, { value: 'carteira', label: 'Carteira Digital' },
                  ]}]}
                  onAdd={async (d) => {
                    const id = await createAccount({ name: d.name, type: d.type || 'banco', active: true });
                    if (id) await refetchAccounts();
                    return id || null;
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Parceiro / Fornecedor{isPartnerRequired(categoryId) ? ' *' : ''}
                </Label>
                <SelectWithAdd
                  value={partnerId}
                  onValueChange={setPartnerId}
                  options={activePartners.map((p: any) => ({ id: p.id, name: p.name }))}
                  noneLabel="Nenhum"
                  addLabel="+ Novo Parceiro"
                  dialogTitle="Novo Parceiro"
                  extraFields={[{ key: 'partner_type', label: 'Tipo', type: 'select', options: [
                    { value: 'fornecedor', label: 'Fornecedor' }, { value: 'cliente', label: 'Cliente' }, { value: 'ambos', label: 'Ambos' },
                  ]}]}
                  onAdd={async (d) => {
                    const id = await createPartner({ name: d.name, type: d.partner_type || 'fornecedor', active: true });
                    if (id) await refetchPartners();
                    return id || null;
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Unidade{isSalaryCategory(categoryId) ? ' *' : ''}
                </Label>
                <SelectWithAdd
                  value={unitId}
                  onValueChange={setUnitId}
                  options={activeUnits.map((u: any) => ({ id: u.id, name: u.name }))}
                  noneLabel="Nenhuma"
                  addLabel="+ Nova Unidade"
                  dialogTitle="Nova Unidade"
                  onAdd={async (d) => {
                    const id = await createUnit({ name: d.name, active: true });
                    if (id) await refetchUnits();
                    return id || null;
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Frente</Label>
                <SelectWithAdd
                  value={frontId}
                  onValueChange={setFrontId}
                  options={activeFronts.map((f: any) => ({ id: f.id, name: f.name }))}
                  noneLabel="Nenhuma"
                  addLabel="+ Nova Frente"
                  dialogTitle="Nova Frente"
                  onAdd={async (d) => {
                    const id = await createFront({ name: d.name, active: true });
                    if (id) await refetchFronts();
                    return id || null;
                  }}
                />
              </div>
            </div>

            {(ruleErrors.length > 0 || ruleWarnings.length > 0) && (
              <div className="space-y-2">
                {ruleErrors.map((m, i) => (
                  <p key={`e${i}`} className="text-xs rounded-xl border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">
                    {m}
                  </p>
                ))}
                {ruleWarnings.map((m, i) => (
                  <p key={`w${i}`} className="text-xs rounded-xl border border-warning/40 bg-warning/10 text-warning px-3 py-2">
                    ⚠️ {m}
                  </p>
                ))}
              </div>
            )}

            <Separator />

            {/* Installments */}
            {!isEditing && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="installment" checked={isInstallment} onCheckedChange={(c) => setIsInstallment(!!c)} />
                  <Label htmlFor="installment" className="text-sm">Parcelado?</Label>
                </div>
                {isInstallment && (
                  <div className="space-y-1.5 max-w-[200px]">
                    <Label className="text-xs text-muted-foreground">Número de parcelas</Label>
                    <Input type="number" min="2" max="60" value={installmentCount} onChange={e => setInstallmentCount(e.target.value)} className="rounded-xl bg-card border-border" />
                    {parseFloat(amount) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {parseInt(installmentCount)}x de R$ {(parseFloat(amount) / parseInt(installmentCount || '1')).toFixed(2)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Recurrence (only for new, non-installment) */}
            {!isEditing && !isInstallment && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="recurring" checked={isRecurring} onCheckedChange={(c) => setIsRecurring(!!c)} />
                  <Label htmlFor="recurring" className="text-sm">Lançamento recorrente?</Label>
                </div>
                {isRecurring && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Frequência</Label>
                      <Select value={recurrenceFrequency} onValueChange={(v) => setRecurrenceFrequency(v as any)}>
                        <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DatePickerField label="Termina em (opcional)" value={recurrenceEndDate} onChange={setRecurrenceEndDate} />
                    <p className="col-span-2 text-xs text-muted-foreground">
                      Próximas ocorrências serão geradas automaticamente em "Contas a Pagar/Receber".
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Allocations */}
            <Collapsible open={allocOpen} onOpenChange={setAllocOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    Rateio por Unidade/Frente
                    {allocations.length > 0 && (
                      <Badge variant="secondary" className="text-xs rounded-full">{allocations.length}</Badge>
                    )}
                  </span>
                  <Plus className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-2">
                {/* Allocation type selector */}
                {allocations.length > 0 && (
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Tipo:</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={allocations[0]?.allocation_type === 'percentual' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7 rounded-lg"
                        onClick={() => setAllocations(prev => prev.map(a => ({ ...a, allocation_type: 'percentual', amount: undefined })))}
                      >
                        % Percentual
                      </Button>
                      <Button
                        type="button"
                        variant={allocations[0]?.allocation_type === 'valor' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7 rounded-lg"
                        onClick={() => setAllocations(prev => prev.map(a => ({ ...a, allocation_type: 'valor', percentage: undefined })))}
                      >
                        R$ Valor Fixo
                      </Button>
                    </div>
                  </div>
                )}

                {allocations.map((alloc, idx) => {
                  const isPercent = alloc.allocation_type === 'percentual';
                  const computedAmount = isPercent && alloc.percentage
                    ? ((parseFloat(amount) || 0) * alloc.percentage / 100)
                    : (alloc.amount || 0);
                  return (
                    <div key={idx} className="flex gap-2 items-end rounded-xl border border-border p-2 bg-muted/30">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Unidade</Label>
                        <Select value={alloc.unit_id || '__none__'} onValueChange={v => updateAllocation(idx, 'unit_id', v === '__none__' ? undefined : v)}>
                          <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {units.filter((u: any) => u.active).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Frente</Label>
                        <Select value={alloc.front_id || '__none__'} onValueChange={v => updateAllocation(idx, 'front_id', v === '__none__' ? undefined : v)}>
                          <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {fronts.filter((f: any) => f.active).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {isPercent ? (
                        <div className="w-20 space-y-1">
                          <Label className="text-xs">%</Label>
                          <Input type="number" min="0" max="100" step="0.01" value={alloc.percentage ?? ''} onChange={e => updateAllocation(idx, 'percentage', parseFloat(e.target.value) || 0)} className="rounded-xl bg-card border-border text-xs h-8" />
                        </div>
                      ) : (
                        <div className="w-24 space-y-1">
                          <Label className="text-xs">Valor R$</Label>
                          <Input type="number" min="0" step="0.01" value={alloc.amount ?? ''} onChange={e => updateAllocation(idx, 'amount', parseFloat(e.target.value) || 0)} className="rounded-xl bg-card border-border text-xs h-8" />
                        </div>
                      )}
                      {isPercent && computedAmount > 0 && (
                        <div className="w-20 text-xs text-muted-foreground text-right pb-1 self-end">
                          = R$ {computedAmount.toFixed(2)}
                        </div>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeAllocation(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}

                <Button variant="outline" size="sm" className="rounded-xl" onClick={addAllocation}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar linha
                </Button>

                {/* Validation summary */}
                {allocations.length > 0 && (() => {
                  const isPercent = allocations[0]?.allocation_type === 'percentual';
                  const total = isPercent
                    ? allocations.reduce((s, a) => s + (a.percentage || 0), 0)
                    : allocations.reduce((s, a) => s + (a.amount || 0), 0);
                  const expected = isPercent ? 100 : (parseFloat(amount) || 0);
                  const diff = Math.abs(total - expected);
                  const isValid = diff < 0.01;
                  return (
                    <div className={cn(
                      'text-xs px-3 py-2 rounded-lg',
                      isValid ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                    )}>
                      {isPercent
                        ? `Total: ${total.toFixed(1)}% de 100% ${isValid ? '✓' : `(faltam ${(100 - total).toFixed(1)}%)`}`
                        : `Total: R$ ${total.toFixed(2)} de R$ ${expected.toFixed(2)} ${isValid ? '✓' : `(diferença: R$ ${(expected - total).toFixed(2)})`}`
                      }
                    </div>
                  );
                })()}
              </CollapsibleContent>
            </Collapsible>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Observações</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionais..." className="rounded-xl bg-card border-border min-h-[60px]" />
            </div>

            {/* File upload */}
            {!isEditing && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Comprovantes</Label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-secondary hover:text-secondary/80 transition-colors">
                  <Upload className="h-4 w-4" />
                  Anexar arquivo
                  <input type="file" multiple className="hidden" onChange={handleFileChange} />
                </label>
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {f.name}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFile(i)} />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="p-6 pt-0">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" onClick={handleSubmit} disabled={saving || !description.trim() || !amount}>
            {saving ? 'Salvando...' : isEditing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
