import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface ChangePreviewRow {
  id: string;
  description: string;
  value: string;
  date: string;
  before: string;
  after: string;
}

export interface ConfirmChangePayload {
  title: string;
  /** Frase curta explicando o que será feito. */
  summary: string;
  /** O que muda em cada relatório. */
  impact: string;
  rows: ChangePreviewRow[];
  destructive?: boolean;
  /** Exige digitar EXCLUIR para liberar o botão. */
  requireTyped?: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
}

export default function ConfirmChangeDialog({
  payload,
  onClose,
  busy,
}: {
  payload: ConfirmChangePayload | null;
  onClose: () => void;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    setTyped('');
  }, [payload]);

  if (!payload) return null;
  const blocked = !!payload.requireTyped && typed.trim().toUpperCase() !== payload.requireTyped;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">{payload.title}</DialogTitle>
          <DialogDescription>{payload.summary}</DialogDescription>
        </DialogHeader>

        <Alert variant={payload.destructive ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Impacto esperado:</strong> {payload.impact}
          </AlertDescription>
        </Alert>

        <div className="rounded-xl border border-border">
          <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
            {payload.rows.length} lançamento(s) serão alterados
          </div>
          <ScrollArea className="max-h-[280px]">
            <div className="divide-y divide-border">
              {payload.rows.map((r) => (
                <div key={r.id} className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium truncate">{r.description}</p>
                    <p className="text-sm whitespace-nowrap">{r.value}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {r.date} • ID {r.id.slice(0, 8)}
                  </p>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-muted">Antes: {r.before}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                      Depois: {r.after}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {payload.requireTyped && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              Digite <strong>{payload.requireTyped}</strong> para liberar a ação
            </Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={payload.requireTyped} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={payload.destructive ? 'destructive' : 'default'}
            disabled={blocked || busy}
            onClick={async () => {
              await payload.onConfirm();
              onClose();
            }}
          >
            {busy ? 'Aplicando...' : payload.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
