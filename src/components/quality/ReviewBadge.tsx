import { REVIEW_LABEL } from './qualityFormat';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReviewStatus } from '@/hooks/useReviewActions';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export function ReviewBadge({
  id, value, note, onChange,
}: {
  id: string; value: ReviewStatus; note?: string | null;
  onChange: (id: string, s: ReviewStatus, note?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<ReviewStatus>(value);

  const openNote = (status: ReviewStatus) => {
    setPending(status);
    setDraft(note ?? '');
    setOpen(true);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Select
        value={value}
        onValueChange={(v: ReviewStatus) => (v === 'ignorado' ? openNote(v) : onChange(id, v))}
      >
        <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{REVIEW_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openNote(value)}>
        {note ? 'Nota ✓' : 'Nota'}
      </Button>
      {note && <span className="text-[11px] text-muted-foreground truncate max-w-[220px]" title={note}>{note}</span>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Nota da conferência</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {pending === 'ignorado'
              ? 'Explique por que este alerta será ignorado (recomendado).'
              : 'Registro opcional, ex.: "Conferido com extrato em 14/08/2026".'}
          </p>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                onChange(id, pending, draft.trim() || null);
                setOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
