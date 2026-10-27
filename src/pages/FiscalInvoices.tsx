import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileUp, AlertTriangle, FileText, Trash2 } from 'lucide-react';
import { parseNfeXml, isValidAccessKey, nfePayables, nfeKeyNote, type ParsedNfe } from '@/lib/nfeParser';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

interface Row { file: string; nfe?: ParsedNfe; error?: string; duplicate?: boolean; posted?: boolean }

function ImportPanel({ kind }: { kind: 'compras' | 'vendas' }) {
  const [rows, setRows] = useState<Row[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { roles } = useCurrentUserRoles();
  const { toast } = useToast();
  const canPost = kind === 'compras' && roles.some((r) => r === 'admin' || r === 'financeiro');
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [catId, setCatId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind !== 'compras') return;
    supabase.from('categories').select('id,name').eq('active', true).eq('type', 'despesa').order('name').then(({ data }) => setCats(data ?? []));
    supabase.from('units').select('id,name').eq('active', true).order('name').then(({ data }) => setUnits(data ?? []));
  }, [kind]);

  // Marca as notas que já viraram conta a pagar (pela chave gravada na observação)
  const markPosted = async (list: Row[]) => {
    const keys = list.map((r) => r.nfe?.accessKey).filter(Boolean) as string[];
    if (!keys.length || kind !== 'compras') return list;
    const found = new Set<string>();
    for (const k of keys) {
      const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).ilike('notes', `%${nfeKeyNote(k)}%`);
      if (count) found.add(k);
    }
    return list.map((r) => (r.nfe && found.has(r.nfe.accessKey) ? { ...r, posted: true } : r));
  };

  const generate = async () => {
    if (!user || !catId) { toast({ title: 'Escolha a categoria', variant: 'destructive' }); return; }
    const todo = rows.filter((r) => r.nfe && !r.duplicate && !r.posted);
    if (!todo.length) return;
    setBusy(true);
    let ok = 0; const fails: string[] = [];
    for (const r of todo) {
      const nfe = r.nfe!;
      try {
        let partnerId: string | null = null;
        const doc = nfe.issuerDocument.replace(/\D/g, '');
        if (doc) {
          const { data: ps } = await supabase.from('partners').select('id,document').eq('active', true);
          partnerId = (ps ?? []).find((p) => (p.document ?? '').replace(/\D/g, '') === doc)?.id ?? null;
          if (!partnerId) {
            const { data: np, error } = await supabase.from('partners').insert({ name: nfe.issuerName || doc, document: doc, type: 'fornecedor' }).select('id').single();
            if (error) throw error;
            partnerId = np.id;
          }
        }
        const parts = nfePayables(nfe);
        const group = parts.length > 1 ? crypto.randomUUID() : null;
        const comp = nfe.issueDate ?? parts[0].dueDate;
        const { error } = await supabase.from('transactions').insert(parts.map((p) => ({
          type: 'despesa' as const, status: 'pendente' as const,
          description: `NF ${nfe.number} - ${nfe.issuerName}${parts.length > 1 ? ` (${p.number}/${p.total})` : ''}`,
          amount: p.amount, tax_amount: 0, net_amount: p.amount,
          competence_date: comp, due_date: p.dueDate,
          category_id: catId, unit_id: unitId || null, partner_id: partnerId,
          installment_number: parts.length > 1 ? p.number : null, installment_total: parts.length > 1 ? p.total : null,
          installment_group_id: group, payment_method: 'boleto' as const,
          notes: `${nfeKeyNote(nfe.accessKey)} · importado do XML`, created_by: user.id,
        })));
        if (error) throw error;
        ok++;
      } catch (e) { fails.push(`NF ${nfe.number}: ${(e as Error).message}`); }
    }
    setRows(await markPosted(rows));
    setBusy(false);
    toast({ title: `${ok} nota(s) enviada(s) para Contas a Pagar`, description: fails.length ? fails.join(' · ') : 'Contas pendentes criadas com os vencimentos das parcelas.', variant: fails.length ? 'destructive' : 'default' });
  };

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
    const checked = await markPosted(next);
    setRows((r) => [...r, ...checked]);
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
                      {r.posted && <Badge variant="secondary" className="mt-1">Já está em Contas a Pagar</Badge>}
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

          {kind === 'compras' && canPost ? (
            <Card><CardContent className="p-3 space-y-3">
              <p className="text-sm font-medium">Gerar Contas a Pagar</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Categoria</Label>
                  <Select value={catId} onValueChange={setCatId}><SelectTrigger><SelectValue placeholder="Ex.: Matéria-Prima" /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Unidade</Label>
                  <Select value={unitId} onValueChange={setUnitId}><SelectTrigger><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
                    <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <Button disabled={busy || !rows.some((r) => r.nfe && !r.duplicate && !r.posted)} onClick={generate} className="w-full">
                {busy ? 'Gerando...' : `Gerar contas a pagar (${rows.filter((r) => r.nfe && !r.duplicate && !r.posted).length} nota(s))`}
              </Button>
              <p className="text-xs text-muted-foreground">Cria uma conta pendente por parcela da nota, com o fornecedor pelo CNPJ (cadastrado se não existir). Notas já enviadas não são repetidas.</p>
            </CardContent></Card>
          ) : (
            <p className="text-xs text-muted-foreground">
              {kind === 'compras' ? 'Só Admin ou Financeiro podem gerar contas a pagar.' : 'Pré-visualização apenas: nada foi gravado. A geração em Contas a Receber fica para a próxima etapa.'}
            </p>
          )}
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
