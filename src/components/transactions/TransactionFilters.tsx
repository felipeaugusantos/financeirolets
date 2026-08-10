import { format } from 'date-fns';
import { CalendarIcon, Filter } from 'lucide-react';
import { cn, parseDateUTC } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import type { TransactionFilters as TFilters } from '@/hooks/useTransactions';

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

interface Props {
  filters: TFilters;
  onChange: (f: TFilters) => void;
}

export default function TransactionFilters({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { data: categories } = useSupabaseCrud<any>('categories', 'name');
  const { data: accounts } = useSupabaseCrud<any>('accounts', 'name');
  const { data: units } = useSupabaseCrud<any>('units', 'name');
  const { data: fronts } = useSupabaseCrud<any>('business_fronts', 'name');
  const { data: partners } = useSupabaseCrud<any>('partners', 'name');

  const set = (key: keyof TFilters, value: string | undefined) => {
    onChange({ ...filters, [key]: value });
  };

  const activeCount = [filters.type, filters.status, filters.category_id, filters.account_id, filters.unit_id, filters.front_id, filters.partner_id, filters.payment_method, filters.dateFrom, filters.dateTo].filter(Boolean).length;

  const DateFilter = ({ label, value, filterKey }: { label: string; value?: string; filterKey: keyof TFilters }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('w-full justify-start text-left font-normal rounded-xl text-xs bg-card border-border', !value && 'text-muted-foreground')}>
            <CalendarIcon className="mr-1 h-3 w-3" />
            {value ? format(parseDateUTC(value), 'dd/MM/yy') : '—'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value ? parseDateUTC(value) : undefined} onSelect={(d) => set(filterKey, d ? format(d, 'yyyy-MM-dd') : undefined)} initialFocus className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-xl border-secondary text-secondary relative">
          <Filter className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{activeCount}</span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 p-4 bg-card rounded-2xl border border-border space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <DateFilter label="De" value={filters.dateFrom} filterKey="dateFrom" />
          <DateFilter label="Até" value={filters.dateTo} filterKey="dateTo" />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={filters.type || '__none__'} onValueChange={v => set('type', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todos</SelectItem>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={filters.status || '__none__'} onValueChange={v => set('status', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="recebido">Recebido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={filters.category_id || '__none__'} onValueChange={v => set('category_id', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todas</SelectItem>
                <SelectItem value="__null__">Sem categoria</SelectItem>
                {categories.filter((c: any) => c.active).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Conta</Label>
            <Select value={filters.account_id || '__none__'} onValueChange={v => set('account_id', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todas</SelectItem>
                <SelectItem value="__null__">Sem conta</SelectItem>
                {accounts.filter((a: any) => a.active).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Unidade</Label>
            <Select value={filters.unit_id || '__none__'} onValueChange={v => set('unit_id', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todas</SelectItem>
                <SelectItem value="__null__">Sem unidade</SelectItem>
                {units.filter((u: any) => u.active).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Frente</Label>
            <Select value={filters.front_id || '__none__'} onValueChange={v => set('front_id', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todas</SelectItem>
                <SelectItem value="__null__">Sem frente</SelectItem>
                {fronts.filter((f: any) => f.active).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Parceiro</Label>
            <Select value={filters.partner_id || '__none__'} onValueChange={v => set('partner_id', v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todos</SelectItem>
                <SelectItem value="__null__">Sem parceiro</SelectItem>
                {partners.filter((p: any) => p.active).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
            <Select value={filters.payment_method || '__none__'} onValueChange={v => set('payment_method' as any, v === '__none__' ? undefined : v)}>
              <SelectTrigger className="rounded-xl bg-card border-border text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Todas</SelectItem>
                <SelectItem value="__null__">Sem forma</SelectItem>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => onChange({})}>Limpar filtros</Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
