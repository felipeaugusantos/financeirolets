import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EnrichedEntry } from '@/hooks/useOfxImport';
import { br, brl } from './ofxFormat';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: EnrichedEntry[];
  reason: string;
  onReasonChange: (reason: string) => void;
  busy: boolean;
  onConfirm: () => void;
}

export default function IgnoreEntriesDialog({ open, onOpenChange, items, reason, onReasonChange, busy, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Ignorar {items.length} linha(s)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1 max-h-40 overflow-auto">
            {items.slice(0, 8).map(v => (
              <p key={v.entry.id} className="truncate">
                {br(v.entry.posted_at)} · {brl(v.entry.amount)} · {v.entry.memo}
              </p>
            ))}
            {items.length > 8 && <p>... e mais {items.length - 8}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Justificativa (obrigatória)</Label>
            <Textarea
              value={reason}
              onChange={ev => onReasonChange(ev.target.value)}
              placeholder="Ex.: transferência entre contas próprias, já registrada na conta de destino."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              A mesma justificativa é gravada em cada linha, junto com seu usuário e a data/hora.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['Transferência entre contas próprias', 'Estorno/duplicidade do banco', 'Movimento não financeiro'].map(s => (
              <Button key={s} size="sm" variant="outline" className="rounded-xl h-7 text-xs" onClick={() => onReasonChange(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={!reason.trim() || busy}>
            Ignorar com justificativa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
