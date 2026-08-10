import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';

export interface BillFiltersState {
  dateFrom: string | null;
  dateTo: string | null;
  partnerId: string | null;
  unitId: string | null;
}

interface BillFiltersProps {
  filters: BillFiltersState;
  onChange: (filters: BillFiltersState) => void;
}

export const emptyFilters: BillFiltersState = {
  dateFrom: null,
  dateTo: null,
  partnerId: null,
  unitId: null,
};

export default function BillFilters({ filters, onChange }: BillFiltersProps) {
  const { data: partners } = useSupabaseCrud('partners');
  const { data: units } = useSupabaseCrud('units');
  const [open, setOpen] = useState(false);

  const activeCount = [filters.dateFrom, filters.dateTo, filters.partnerId, filters.unitId].filter(Boolean).length;

  const setField = (field: keyof BillFiltersState, value: string | null) => {
    onChange({ ...filters, [field]: value });
  };

  const clearAll = () => onChange(emptyFilters);

  const toDateStr = (d: Date) => toLocalISODate(d);
  const fromDateStr = (s: string | null) => s ? new Date(s + 'T12:00:00') : undefined;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activeCount > 0 && (
              <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 leading-none">
                {activeCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-4" align="start">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filtros</span>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAll}>
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {/* Date From */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Vencimento de</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !filters.dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                  {filters.dateFrom ? format(fromDateStr(filters.dateFrom)!, 'dd/MM/yyyy') : 'Selecione...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDateStr(filters.dateFrom)}
                  onSelect={(d) => setField('dateFrom', d ? toDateStr(d) : null)}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Vencimento até</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !filters.dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                  {filters.dateTo ? format(fromDateStr(filters.dateTo)!, 'dd/MM/yyyy') : 'Selecione...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDateStr(filters.dateTo)}
                  onSelect={(d) => setField('dateTo', d ? toDateStr(d) : null)}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Partner */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Parceiro</label>
            <Select value={filters.partnerId ?? '__all__'} onValueChange={(v) => setField('partnerId', v === '__all__' ? null : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {(partners as any[])?.filter((p: any) => p.active).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unit */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Unidade</label>
            <Select value={filters.unitId ?? '__all__'} onValueChange={(v) => setField('unitId', v === '__all__' ? null : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {(units as any[])?.filter((u: any) => u.active).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter chips */}
      {filters.dateFrom && (
        <span className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-1">
          De: {format(fromDateStr(filters.dateFrom)!, 'dd/MM/yy')}
          <X className="h-3 w-3 cursor-pointer" onClick={() => setField('dateFrom', null)} />
        </span>
      )}
      {filters.dateTo && (
        <span className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-1">
          Até: {format(fromDateStr(filters.dateTo)!, 'dd/MM/yy')}
          <X className="h-3 w-3 cursor-pointer" onClick={() => setField('dateTo', null)} />
        </span>
      )}
    </div>
  );
}
