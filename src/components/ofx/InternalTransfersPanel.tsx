import { useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useInternalTransfers } from '@/hooks/useInternalTransfers';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import type { TransferPair } from '@/lib/internalTransfers';
import { br, brl } from './ofxFormat';

export default function InternalTransfersPanel({ from, to, accountId, revision, onRegistered }: {
  from: string; to: string; accountId: string; revision: unknown; onRegistered: () => void;
}) {
  const { pairs, loading, saving, error, registerTransfer, reload } = useInternalTransfers(from, to, accountId, revision);
  const { isAdmin, isFinanceiro } = useCurrentUserRoles();
  const [review, setReview] = useState<TransferPair | null>(null);
  if (!isAdmin && !isFinanceiro) return null;
  return (
    <section className="space-y-3 border-y border-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-heading font-semibold">
          <ArrowLeftRight className="h-4 w-4 text-accent" />Transferências entre contas próprias
          <Badge variant="outline">{pairs.length}</Badge>
        </h3>
        <Button size="icon" variant="ghost" aria-label="Atualizar transferências" title="Atualizar transferências" disabled={loading || saving} onClick={() => void reload()}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : loading ? <p className="text-sm text-muted-foreground">Consultando extratos…</p> : pairs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma transferência com correspondência única neste período.</p> : (
        <div className="grid gap-3">
          {pairs.map(p => (
            <div key={`${p.out.id}-${p.in.id}`} className="grid gap-3 border border-border rounded-lg p-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="min-w-0 text-xs"><span className="text-muted-foreground">Saída</span><p className="font-semibold text-sm break-words">{p.out.account_name}</p><p className="break-words text-muted-foreground">{br(p.out.posted_at)} · {p.out.memo}</p></div>
              <div className="min-w-0 text-xs"><span className="text-muted-foreground">Entrada</span><p className="font-semibold text-sm break-words">{p.in.account_name}</p><p className="break-words text-muted-foreground">{br(p.in.posted_at)} · {p.in.memo}</p></div>
              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end"><span className="font-semibold tabular-nums text-sm">{brl(p.amount)}</span><Button size="sm" variant="outline" disabled={saving} onClick={() => setReview(p)}><ArrowLeftRight className="mr-2 h-4 w-4" />Revisar transferência</Button></div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!review} onOpenChange={open => { if (!open && !saving) setReview(null); }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Confirmar transferência interna</DialogTitle></DialogHeader>
          {review && <div className="space-y-3 text-sm"><p className="break-words">{review.out.account_name} → {review.in.account_name}</p><p className="text-lg font-semibold">{brl(review.amount)}</p><p>Saída: {br(review.out.posted_at)} · Entrada: {br(review.in.posted_at)}</p><p className="text-muted-foreground">As duas linhas serão conciliadas juntas, cada uma na unidade padrão de sua conta. O valor movimenta o caixa, mas não compõe receitas ou despesas do DRE.</p></div>}
          <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setReview(null)}>Cancelar</Button><Button disabled={saving || !review} onClick={async () => { if (review && await registerTransfer(review)) { setReview(null); onRegistered(); } }}>{saving ? 'Confirmando…' : 'Confirmar transferência'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
