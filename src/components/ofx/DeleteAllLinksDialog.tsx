import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedCount: number;
  busy: boolean;
  onConfirm: () => void;
}

export default function DeleteAllLinksDialog({ open, onOpenChange, linkedCount, busy, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Excluir todas as conciliações do período</DialogTitle></DialogHeader>
        <p className="text-xs">
          {linkedCount} linha(s) vinculada(s) voltarão para pendente.
          Nenhum lançamento é excluído.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>Excluir conciliações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
