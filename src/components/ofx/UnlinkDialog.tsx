import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { StatementEntry } from '@/hooks/useOfxImport';
import { createdFromStatement } from '@/lib/ofxUnlink';
import { br, brl } from './ofxFormat';

interface Props {
  target: StatementEntry | null;
  busy: boolean;
  onClose: () => void;
  onUnlinkOnly: () => void;
  onUnlinkAndDelete: () => void;
}

export default function UnlinkDialog({ target, busy, onClose, onUnlinkOnly, onUnlinkAndDelete }: Props) {
  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Desvincular conciliação</DialogTitle></DialogHeader>
        {target && (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              {br(target.posted_at)} · {brl(Number(target.amount))} · {target.memo}
            </p>
            <p>
              A linha voltará para <strong>pendente</strong>. Em mês fechado a exclusão é recusada e nada é alterado.
            </p>
            {createdFromStatement(target) ? (
              <p className="text-destructive">
                Este lançamento foi criado a partir da linha: "Desvincular e excluir" o exclui (com rateio e anexos).
                Se outras linhas do extrato estiverem ligadas a ele, ele é mantido até a última ser desvinculada.
              </p>
            ) : (
              <p>
                Este lançamento já existia antes da conciliação. "Desvincular e excluir" o exclui também;
                "Só desvincular" o mantém.
              </p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button variant="outline" disabled={busy} onClick={onUnlinkOnly}>Só desvincular</Button>
          <Button variant="destructive" disabled={busy} onClick={onUnlinkAndDelete}>
            Desvincular e excluir lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
