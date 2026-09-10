import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useInternalTransfers } from '@/hooks/useInternalTransfers';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * Mostra pares espelhados entre contas próprias (saiu de uma, entrou na outra)
 * e permite registrar UMA transferência, que não entra no DRE.
 */
export default function InternalTransfersPanel({ from, to }: { from: string; to: string }) {
  const { pairs, loading, saving, registerTransfer } = useInternalTransfers(from, to);

  if (loading || pairs.length === 0) return null;

  const total = pairs.reduce((s, p) => s + p.amount, 0);

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex flex-wrap items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-accent" />
          Transferências entre contas próprias
          <Badge variant="outline" className="text-[11px]">{pairs.length} par(es) · {brl(total)}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          O mesmo valor saiu de uma conta e entrou em outra. Registrando como transferência,
          as duas linhas são conciliadas e o valor fica fora do DRE — só no fluxo de caixa.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Saída</th>
                <th className="p-2 text-left font-medium">Entrada</th>
                <th className="p-2 text-right font-medium">Valor</th>
                <th className="w-32 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(p => (
                <tr key={`${p.out.id}-${p.in.id}`} className="border-t border-border">
                  <td className="p-2">
                    <span className="font-medium">{p.out.account_name}</span>
                    <span className="block text-muted-foreground">{br(p.out.posted_at)} · {p.out.memo}</span>
                  </td>
                  <td className="p-2">
                    <span className="font-medium">{p.in.account_name}</span>
                    <span className="block text-muted-foreground">{br(p.in.posted_at)} · {p.in.memo}</span>
                    {p.dayGap > 0 && (
                      <Badge variant="outline" className="mt-0.5 text-[10px]">{p.dayGap} dia(s) de diferença</Badge>
                    )}
                  </td>
                  <td className="p-2 text-right font-medium tabular-nums whitespace-nowrap">{brl(p.amount)}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-xl gap-1 text-[11px]"
                      disabled={saving}
                      onClick={() => registerTransfer(p)}
                    >
                      <ArrowLeftRight className="h-3 w-3" /> Registrar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
