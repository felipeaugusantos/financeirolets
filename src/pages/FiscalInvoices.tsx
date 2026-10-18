import { useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileUp, AlertTriangle, FileText, Trash2 } from 'lucide-react';
import { parseNfeXml, isValidAccessKey, type ParsedNfe } from '@/lib/nfeParser';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

interface Row { file: string; nfe?: ParsedNfe; error?: string; duplicate?: boolean }

function ImportPanel({ kind }: { kind: 'compras' | 'vendas' }) {
  const [rows, setRows] = useState<Row[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const seen = new Set(rows.map((r) => r.nfe?.accessKey).filter(Boolean));
    const next: Row[] = [];
    for (const f of Array.from(files)) {
      try {
        const nfe = parseNfeXml(await f.text());
        const duplicate = seen.has(nfe.accessKey);
        seen.add(nfe.accessKey);
        next.push({ file: f.name, nfe, duplicate });
      } catch (e) {
        next.push({ file: f.name, error: (e as Error).message });
      }
    }
    setRows((r) => [...r, ...next]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const valid = rows.filter((r) => r.nfe && !r.duplicate);
  const total = valid.reduce((s, r) => s + (r.nfe?.total ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent
          className="flex flex-col items-center gap-3 py-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <FileUp className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Arraste os arquivos XML {kind === 'compras' ? 'das notas de fornecedores' : 'das notas de venda'} ou
          </p>
          <Button onClick={() => inputRef.current?.click()}>Selecionar XML</Button>
          <input ref={inputRef} type="file" accept=".xml,text/xml" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Notas lidas</p><p className="text-lg font-bold">{valid.length}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Valor total</p><p className="text-lg font-bold">{fmt(total)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Com problema</p><p className="text-lg font-bold text-destructive">{rows.length - valid.length}</p></CardContent></Card>
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <Card key={i}>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      {r.nfe ? (
                        <>
                          <p className="font-medium truncate">
                            {kind === 'compras' ? r.nfe.issuerName : r.nfe.recipientName || 'Consumidor'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            NF {r.nfe.number}/{r.nfe.series} · modelo {r.nfe.model} · {fmtDate(r.nfe.issueDate)} · {r.nfe.itemCount} itens
                          </p>
                          <p className="text-[11px] text-muted-foreground break-all">Chave {r.nfe.accessKey}</p>
                          {r.nfe.duplicates.length > 0 && (
                            <p className="text-xs">
                              Parcelas: {r.nfe.duplicates.map((d) => `${fmtDate(d.dueDate)} ${fmt(d.amount)}`).join(' · ')}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="font-medium truncate">{r.file}</p>
                      )}
                      {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                      {r.duplicate && <Badge variant="destructive" className="mt-1">Nota repetida neste lote</Badge>}
                      {r.nfe && !isValidAccessKey(r.nfe.accessKey) && (
                        <p className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Chave de acesso fora do padrão de 44 dígitos</p>
                      )}
                    </div>
                    {r.nfe && <span className="font-semibold whitespace-nowrap">{fmt(r.nfe.total)}</span>}
                    <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Pré-visualização apenas: nada foi gravado. A geração automática em {kind === 'compras' ? 'Contas a Pagar' : 'Contas a Receber'} será liberada na próxima etapa.
          </p>
        </>
      )}
    </div>
  );
}

export default function FiscalInvoices() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Importação de Notas</h1>
        <p className="text-sm text-muted-foreground">Leia os XML de compras e vendas antes de lançar no financeiro</p>
      </div>
      <Tabs defaultValue="compras">
        <TabsList className="w-full grid grid-cols-2 rounded-xl bg-muted">
          <TabsTrigger value="compras" className="rounded-lg">Compras (NF-e)</TabsTrigger>
          <TabsTrigger value="vendas" className="rounded-lg">Vendas (NFC-e / NF-e)</TabsTrigger>
        </TabsList>
        <TabsContent value="compras" className="mt-4"><ImportPanel kind="compras" /></TabsContent>
        <TabsContent value="vendas" className="mt-4"><ImportPanel kind="vendas" /></TabsContent>
      </Tabs>
    </div>
  );
}
