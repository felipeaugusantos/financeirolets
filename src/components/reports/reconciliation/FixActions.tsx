import { ReactNode, useState } from 'react';
import { BucketKey, FlagKey, TxDetail } from '@/hooks/useReconciliation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CalendarCheck, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { todayLocalISO } from '@/lib/utils';
import { fmtDate } from './format';

export type FixKind = BucketKey | FlagKey;

export interface Lookups {
  categoriesByType: { receita: Array<{ id: string; name: string }>; despesa: Array<{ id: string; name: string }> };
  units: Array<{ id: string; name: string }>;
  fronts: Array<{ id: string; name: string }>;
}

export interface FixApi {
  fixing: string | null;
  apply: (item: TxDetail, patch: Record<string, unknown>, message: string) => Promise<void>;
}

const todayISO = () => todayLocalISO();

export function FixActions({
  item, kind, side, lookups, api,
}: {
  item: TxDetail;
  kind: FixKind;
  side: 'receita' | 'despesa';
  lookups: Lookups;
  api: FixApi;
}) {
  const isBusy = api.fixing === item.id;
  const paidStatus = side === 'receita' ? 'recebido' : 'pago';

  const onMarkPaid = () => {
    const today = todayISO();
    api.apply(item, { status: paidStatus, payment_date: today }, `marcado como ${paidStatus} em ${fmtDate(today)}`);
  };

  const onUseCompetenceAsPayment = () => {
    if (!item.competence_date) return;
    api.apply(item, { payment_date: item.competence_date }, `pagamento definido em ${fmtDate(item.competence_date)}`);
  };

  const onUseTodayAsPayment = () => {
    const today = todayISO();
    api.apply(item, { payment_date: today }, `pagamento definido em ${fmtDate(today)}`);
  };

  const onAlignCompetenceToPayment = () => {
    if (!item.payment_date) return;
    api.apply(item, { competence_date: item.payment_date }, `competência alinhada ao pagamento (${fmtDate(item.payment_date)})`);
  };

  const RescheduleButton = () => {
    const [val, setVal] = useState(item.due_date || todayISO());
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={isBusy}>
            <CalendarCheck className="h-3 w-3 mr-1" /> Reagendar
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 space-y-2">
          <Label className="text-xs">Novo vencimento</Label>
          <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 text-xs" />
          <Button
            size="sm"
            className="w-full h-7 text-[11px]"
            onClick={() => api.apply(item, { due_date: val }, `vencimento reagendado para ${fmtDate(val)}`)}
          >
            Aplicar
          </Button>
        </PopoverContent>
      </Popover>
    );
  };

  const InlineSelect = ({
    options, field, label,
  }: { options: Array<{ id: string; name: string }>; field: 'category_id' | 'unit_id' | 'front_id'; label: string }) => (
    <Select
      disabled={isBusy}
      onValueChange={(v) => {
        const name = options.find((o) => o.id === v)?.name || '';
        api.apply(item, { [field]: v }, `${label}: ${name}`);
      }}
    >
      <SelectTrigger className="h-7 text-[11px] w-[160px]">
        <SelectValue placeholder={`Definir ${label}`} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  let content: ReactNode = null;
  switch (kind) {
    case 'provisionado':
      content = (
        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={isBusy} onClick={onMarkPaid}>
          <CheckCheck className="h-3 w-3 mr-1" /> Marcar como {paidStatus}
        </Button>
      );
      break;
    case 'provisionadoVencido':
      content = (
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={isBusy} onClick={onMarkPaid}>
            <CheckCheck className="h-3 w-3 mr-1" /> {paidStatus}
          </Button>
          <RescheduleButton />
        </div>
      );
      break;
    case 'pagoSemData':
      content = (
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {item.competence_date && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={isBusy} onClick={onUseCompetenceAsPayment}>
              Usar competência
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={isBusy} onClick={onUseTodayAsPayment}>
            Usar hoje
          </Button>
        </div>
      );
      break;
    case 'pagoForaDaCompetencia':
    case 'pagoDePeriodoAnterior':
      content = (
        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" disabled={isBusy || !item.payment_date} onClick={onAlignCompetenceToPayment}>
          Alinhar competência
        </Button>
      );
      break;
    case 'missingCategory':
      content = <InlineSelect options={lookups.categoriesByType[side]} field="category_id" label="categoria" />;
      break;
    case 'missingUnit':
      content = <InlineSelect options={lookups.units} field="unit_id" label="unidade" />;
      break;
    case 'missingFront':
      content = <InlineSelect options={lookups.fronts} field="front_id" label="frente" />;
      break;
    case 'negativeOrZero':
      content = <span className="text-[10px] text-muted-foreground italic">Edite em Lançamentos</span>;
      break;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {isBusy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      {content}
    </div>
  );
}
