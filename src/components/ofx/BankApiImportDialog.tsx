import { useRef, useState } from 'react';
import { Landmark, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/utils';
import { parseApiResponse } from '@/lib/bradescoApi';
import { commitApiImport, planApiImport, type ImportPlan } from '@/lib/bankApiImport';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');

export interface BankApiImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  /** Chamado depois de gravar linhas de extrato, com o primeiro e o último dia importados. */
  onImported?: (range: { from: string; to: string } | null) => void;
}

/**
 * Importa a resposta (JSON) da API de Saldo e Extrato do Bradesco. Mostra o que será gravado antes de gravar.
 * A coleta automática depende do acesso liberado pelo banco; até lá, a resposta do sandbox/Postman entra por aqui.
 */
export default function BankApiImportDialog({ open, onOpenChange, accountId, accountName, onImported }: BankApiImportDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setText(''); setPlan(null); setError(null); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const analyze = async () => {
    setBusy(true); setError(null); setPlan(null);
    try {
      setPlan(await planApiImport(parseApiResponse(text), accountId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setPlan(null); setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const confirm = async () => {
    if (!plan) return;
    setBusy(true); setError(null);
    try {
      const r = await commitApiImport(plan, user?.id ?? null);
      const dates = plan.kind === 'extrato' ? plan.toInsert.map(e => e.posted_at).sort() : [];
      toast({
        title: plan.kind === 'extrato' ? `${r.inserted} linha(s) de extrato importada(s)` : 'Saldo registrado',
        description: [r.skipped ? `${r.skipped} já existiam e foram ignoradas.` : '', ...r.notes].filter(Boolean).join(' ') || undefined,
      });
      onImported?.(dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null);
      close(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const extrato = plan?.kind === 'extrato' ? plan : null;
  const saldo = plan?.kind === 'saldo' ? plan : null;
  const warnings = plan?.parsed.warnings ?? [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Importar da API do Bradesco</DialogTitle>
          <DialogDescription>
            Conta do sistema: <strong>{accountName || '—'}</strong>. Cole a resposta (JSON) da API de Extrato ou de Saldo.
            Só entram lançamentos fechados (D-1 e histórico); nada vira lançamento sozinho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={e => { setText(e.target.value); setPlan(null); setError(null); }}
            placeholder='{"extratoPorPeriodo": { ... }}  ou  {"saldoCC": { ... }}'
            className="min-h-[140px] font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={e => void readFile(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Abrir arquivo .json
            </Button>
            <Button type="button" size="sm" className="rounded-xl" disabled={busy || !text.trim() || !accountId} onClick={() => void analyze()}>
              {busy && !plan ? 'Analisando...' : 'Analisar'}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>
        )}

        {extrato && (
          <div className="space-y-2 text-sm">
            <Alert>
              <AlertDescription className="text-xs space-y-0.5">
                <p>
                  Conta da resposta: <strong>{extrato.parsed.account ? `${extrato.parsed.account.numero}-${extrato.parsed.account.digito}` : 'não informada'}</strong>
                  {' · '}{extrato.parsed.entries.length} lançamento(s) fechado(s) na resposta.
                </p>
                <p>
                  <strong>{extrato.toInsert.length} novo(s)</strong> · {extrato.alreadyImported.length} já importado(s) da API ·{' '}
                  {extrato.alreadyFromOfx.length} já existente(s) vindo(s) do OFX (mesmo dia e valor).
                </p>
                {extrato.parsed.opening && (
                  <p>Saldo anterior{extrato.parsed.opening.date ? ` (${br(extrato.parsed.opening.date)})` : ''}: {brl(extrato.parsed.opening.balance)}.</p>
                )}
                {extrato.parsed.closing && <p>Saldo após o último lançamento ({br(extrato.parsed.closing.date)}): {brl(extrato.parsed.closing.balance)}.</p>}
              </AlertDescription>
            </Alert>
            {extrato.toInsert.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2 text-right">Valor</th></tr></thead>
                  <tbody>
                    {extrato.toInsert.slice(0, 50).map(e => (
                      <tr key={e.fitid} className="border-t">
                        <td className="p-2 whitespace-nowrap">{br(e.posted_at)}</td>
                        <td className="p-2">{e.memo}</td>
                        <td className={`p-2 text-right whitespace-nowrap ${e.amount < 0 ? 'text-destructive' : ''}`}>{brl(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {extrato.toInsert.length > 50 && <p className="p-2 text-xs text-muted-foreground">Mostrando 50 de {extrato.toInsert.length}.</p>}
              </div>
            )}
          </div>
        )}

        {saldo && (
          <div className="space-y-2 text-sm">
            <Alert>
              <AlertDescription className="text-xs">
                Saldo da conta {saldo.parsed.account ? `${saldo.parsed.account.numero}-${saldo.parsed.account.digito}` : ''} consultado em {br(saldo.refDate)}.
                Será registrado como o saldo do dia (substitui o de hoje, se já houver).
              </AlertDescription>
            </Alert>
            <div className="max-h-56 overflow-auto rounded-xl border">
              <table className="w-full text-xs">
                <tbody>
                  {saldo.parsed.lines.filter(l => l.value !== null).map((l, i) => (
                    <tr key={`${l.code}-${i}`} className="border-t first:border-t-0">
                      <td className="p-2">{l.name}</td>
                      <td className="p-2 text-right whitespace-nowrap">{brl(l.value as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => close(false)}>Cancelar</Button>
          <Button
            className="rounded-xl"
            disabled={busy || !plan || (extrato !== null && extrato.toInsert.length === 0)}
            onClick={() => void confirm()}
          >
            {busy && plan ? 'Gravando...' : extrato ? `Importar ${extrato.toInsert.length} linha(s)` : 'Registrar saldo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
