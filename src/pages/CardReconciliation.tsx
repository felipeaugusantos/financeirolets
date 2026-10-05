import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CreditCard, Upload, PlusCircle, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PAYMENT_METHOD_LABELS, suggestPaymentMethod } from '@/lib/paymentMethod';
import {
  parseCardSheets, prepareCardRows, checkBlockTotal, matchByName,
  type AmountSign, type CardSheetInput,
} from '@/lib/cardSheet';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/utils';

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const NONE = '__none__';
/** Final de 4 dígitos aparece como •••• 1234; rótulo de bloco ("VISA INFINITY") aparece como está. */
const cardText = (c: string) => (/^\d{4}$/.test(c) ? `•••• ${c}` : c);

interface CardEntry {
  id: string;
  account_id: string;
  card_last4: string | null;
  posted_at: string;
  description: string;
  amount: number;
  status: string;
  transaction_id: string | null;
  unit_id: string | null;
  front_id: string | null;
  category_id: string | null;
  payment_method: string | null;
  source_file: string | null;
}

async function sha1(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Conciliação de Cartão: importa a planilha da operadora e vira lançamento. */
export default function CardReconciliation() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [fronts, setFronts] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; type: string }[]>([]);
  const [accountId, setAccountId] = useState('');
  const [entries, setEntries] = useState<CardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cardFilter, setCardFilter] = useState<string>(NONE);
  const [pendingImport, setPendingImport] = useState<{ fileName: string; sheets: CardSheetInput[] } | null>(null);
  const [amountSign, setAmountSign] = useState<AmountSign>('compras-positivas');

  useEffect(() => {
    (async () => {
      const [a, u, f, c] = await Promise.all([
        supabase.from('accounts').select('id, name').eq('active', true).order('name'),
        supabase.from('units').select('id, name').eq('active', true).order('name'),
        supabase.from('business_fronts').select('id, name').eq('active', true).order('name'),
        supabase.from('categories').select('id, name, type').eq('active', true).order('name'),
      ]);
      setAccounts((a.data ?? []));
      setUnits((u.data ?? []));
      setFronts((f.data ?? []));
      setCategories((c.data ?? []));
      if ((a.data ?? []).length > 0) setAccountId(a.data![0].id);
    })();
  }, []);

  const load = useCallback(async (accId: string) => {
    if (!accId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('card_statement_entries')
      .select('*')
      .eq('account_id', accId)
      .order('posted_at', { ascending: false })
      .limit(1000);
    setLoading(false);
    if (error) {
      toast({ title: 'Erro ao carregar lançamentos do cartão', description: error.message, variant: 'destructive' });
      return;
    }
    setEntries((data ?? []) as CardEntry[]);
  }, [toast]);

  useEffect(() => { load(accountId); }, [accountId, load]);

  /** Lê a planilha e abre a conferência; nada é gravado antes de o usuário confirmar. */
  const handleFile = async (file: File) => {
    if (!accountId) {
      toast({ title: 'Escolha a conta antes de importar', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheets: CardSheetInput[] = wb.SheetNames.map(name => ({
        name,
        matrix: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '', raw: true }),
      }));
      const parsed = parseCardSheets(sheets, new Date());
      if (parsed.blocks.length === 0) {
        throw new Error(
          'Não encontrei a tabela de lançamentos. A planilha precisa de uma linha de cabeçalho com ' +
          'Data (ou Dia), Descrição (ou Lançamento / O que é) e Valor, seguida das compras.',
        );
      }
      setPendingImport({ fileName: file.name, sheets });
    } catch (err: unknown) {
      toast({ title: 'Não foi possível ler a planilha', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = useMemo(() => {
    if (!pendingImport) return null;
    const parsed = parseCardSheets(pendingImport.sheets, new Date());
    return {
      ...parsed,
      rows: prepareCardRows(parsed.blocks, accountId, amountSign),
      checks: parsed.blocks.map(checkBlockTotal),
    };
  }, [pendingImport, accountId, amountSign]);

  /** Grava as linhas conferidas. Linhas repetidas de uma importação anterior são ignoradas pelo hash. */
  const confirmImport = async () => {
    if (!pendingImport || !preview) return;
    setBusy(true);
    try {
      const payload: TablesInsert<'card_statement_entries'>[] = [];
      for (const row of preview.rows) {
        const despesa = row.amount < 0;
        const unit = matchByName(units, row.unitHint);
        const category = matchByName(categories.filter(c => c.type === (despesa ? 'despesa' : 'receita')), row.categoryHint);
        payload.push({
          account_id: accountId,
          card_last4: row.card,
          posted_at: row.posted_at,
          description: row.description,
          amount: row.amount,
          row_hash: await sha1(row.hashKey),
          source_file: pendingImport.fileName,
          status: 'pendente',
          unit_id: unit?.id ?? null,
          category_id: category?.id ?? null,
          note: row.note,
          payment_method: suggestPaymentMethod(row.description) ?? 'cartao_credito',
          imported_by: user?.id ?? null,
        });
      }

      let inserted = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const { data, error } = await supabase
          .from('card_statement_entries')
          .upsert(payload.slice(i, i + 500), { onConflict: 'row_hash', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        inserted += data?.length ?? 0;
      }
      const jaExistiam = payload.length - inserted;
      toast({
        title: `${inserted} linha(s) importada(s)`,
        description: jaExistiam > 0
          ? `${jaExistiam} já existiam (importação anterior) e foram mantidas como estavam.`
          : 'Nada vira lançamento sozinho: confira unidade e categoria e crie os lançamentos.',
      });
      setPendingImport(null);
      await load(accountId);
    } catch (err: unknown) {
      toast({ title: 'Erro ao importar planilha', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const patchEntry = async (id: string, patch: Partial<CardEntry>) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } as CardEntry : e)));
    const { error } = await supabase.from('card_statement_entries').update(patch as TablesUpdate<'card_statement_entries'>).eq('id', id);
    if (error) toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
  };

  /**
   * Cria o lançamento financeiro da linha e a marca como conciliada, NUMA ÚNICA transação do
   * banco (função create_transaction_from_card_entry). Se a ligação falhar, nada é gravado, e
   * uma linha já conciliada não gera um segundo lançamento numa nova tentativa.
   */
  const createFor = async (entry: CardEntry) => {
    if (!entry.unit_id || !entry.category_id) {
      toast({ title: 'Informe unidade e categoria', description: entry.description, variant: 'destructive' });
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('create_transaction_from_card_entry', { p_entry_id: entry.id });
    if (error) {
      const msg = error.message ?? '';
      const description =
        error.code === 'PGRST202'
          ? 'A função create_transaction_from_card_entry não existe neste banco. Aplique a migração 20261003230000 antes de usar.'
          : msg.startsWith('entry_not_pending')
            ? 'Esta linha já foi conciliada (ou você não tem permissão). Atualize a tela.'
            : msg.startsWith('missing_fields')
              ? 'Informe unidade e categoria da linha.'
              : msg;
      toast({ title: 'Erro ao criar lançamento', description, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const createSelected = async () => {
    const list = entries.filter(e => selected.has(e.id) && e.status === 'pendente');
    if (list.length === 0) {
      toast({ title: 'Selecione ao menos uma linha pendente', variant: 'destructive' });
      return;
    }
    setBusy(true);
    let ok = 0;
    for (const e of list) if (await createFor(e)) ok++;
    setBusy(false);
    setSelected(new Set());
    await load(accountId);
    toast({ title: `${ok} lançamento(s) criado(s)`, description: ok < list.length ? `${list.length - ok} linha(s) não criadas (sem unidade/categoria, já conciliadas ou com erro).` : undefined });
  };

  const cards = useMemo(
    () => Array.from(new Set(entries.map(e => e.card_last4).filter(Boolean))) as string[],
    [entries],
  );
  const visible = cardFilter === NONE ? entries : entries.filter(e => e.card_last4 === cardFilter);
  const pending = visible.filter(e => e.status === 'pendente');
  const totalPending = pending.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-heading font-semibold">Conciliação de Cartão</h1>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading">Importar planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A planilha (.xlsx ou .csv) precisa ter uma linha de cabeçalho com <strong>Data</strong> (ou Dia),{' '}
            <strong>Descrição</strong> (ou Lançamento / O que é) e <strong>Valor</strong>. O cabeçalho pode estar abaixo de
            títulos, e várias tabelas lado a lado são lidas como um cartão cada. Datas sem ano (13 AGO, 05/03) usam o
            ano atual. Antes de gravar, você confere o resumo. Nada vira lançamento sozinho: você informa unidade e
            categoria e confirma.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Final do cartão</Label>
              <Select value={cardFilter} onValueChange={setCardFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NONE}>Todos</SelectItem>
                  {cards.map(c => <SelectItem key={c} value={c}>{cardText(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button variant="outline" className="w-full gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Escolher planilha
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3 flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base font-heading">
            Linhas do cartão{' '}
            <Badge variant="outline" className="ml-1 text-[11px]">
              {pending.length} pendente(s) · {brl(totalPending)}
            </Badge>
          </CardTitle>
          <Button size="sm" className="gap-1.5" disabled={busy || selected.size === 0} onClick={createSelected}>
            <PlusCircle className="h-4 w-4" /> Criar lançamentos
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma linha importada para esta conta ainda.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 px-2 w-8"> </th>
                    <th className="py-2 px-2 font-medium">Data</th>
                    <th className="py-2 px-2 font-medium">Descrição</th>
                    <th className="py-2 px-2 font-medium text-right">Valor</th>
                    <th className="py-2 px-2 font-medium">Unidade</th>
                    <th className="py-2 px-2 font-medium">Frente</th>
                    <th className="py-2 px-2 font-medium">Categoria</th>
                    <th className="py-2 px-2 font-medium">Pagamento</th>
                    <th className="py-2 px-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(e => {
                    const done = e.status !== 'pendente';
                    const catList = categories.filter(c => (Number(e.amount) >= 0 ? c.type === 'receita' : c.type === 'despesa'));
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0 align-middle">
                        <td className="py-1.5 px-2">
                          <Checkbox
                            disabled={done}
                            checked={selected.has(e.id)}
                            onCheckedChange={() => setSelected(prev => {
                              const next = new Set(prev);
                              if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                              return next;
                            })}
                            aria-label={`Selecionar linha de ${br(e.posted_at)}`}
                          />
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{br(e.posted_at)}</td>
                        <td className="py-1.5 px-2">
                          <span className="block truncate max-w-[240px]">{e.description}</span>
                          {e.card_last4 && <span className="text-[10px] text-muted-foreground">{cardText(e.card_last4)}</span>}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-medium ${Number(e.amount) >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                          {brl(Number(e.amount))}
                        </td>
                        <td className="py-1.5 px-2">
                          <Select disabled={done} value={e.unit_id ?? NONE} onValueChange={v => patchEntry(e.id, { unit_id: v === NONE ? null : v })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Unidade" /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value={NONE}>Sem unidade</SelectItem>
                              {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 px-2">
                          <Select disabled={done} value={e.front_id ?? NONE} onValueChange={v => patchEntry(e.id, { front_id: v === NONE ? null : v })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Frente" /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value={NONE}>Sem frente</SelectItem>
                              {fronts.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 px-2">
                          <Select disabled={done} value={e.category_id ?? NONE} onValueChange={v => patchEntry(e.id, { category_id: v === NONE ? null : v })}>
                            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value={NONE}>Sem categoria</SelectItem>
                              {catList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 px-2">
                          <Select disabled={done} value={e.payment_method ?? NONE} onValueChange={v => patchEntry(e.id, { payment_method: v === NONE ? null : v })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Pagamento" /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              <SelectItem value={NONE}>Não informar</SelectItem>
                              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, label]) => (
                                <SelectItem key={v} value={v}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 px-2">
                          <Badge variant={done ? 'default' : 'outline'} className="text-[10px]">
                            {done ? 'Lançado' : 'Pendente'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pendingImport} onOpenChange={open => { if (!open && !busy) setPendingImport(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferir antes de importar</DialogTitle>
            <DialogDescription>{pendingImport?.fileName}</DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-4 text-sm">
              <div className="space-y-2">
                {preview.blocks.map((b, i) => {
                  const check = preview.checks[i];
                  const dates = b.rows.map(r => r.posted_at).sort();
                  const compras = b.rows.filter(r => (amountSign === 'compras-positivas' ? r.raw_amount > 0 : r.raw_amount < 0));
                  const creditos = b.rows.filter(r => (amountSign === 'compras-positivas' ? r.raw_amount < 0 : r.raw_amount > 0));
                  const sum = (list: typeof b.rows) => list.reduce((t, r) => t + Math.abs(r.raw_amount), 0);
                  return (
                    <div key={i} className="rounded-xl border border-border p-3 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{b.title ?? b.sheet}</span>
                        <Badge variant="outline" className="text-[11px]">{b.rows.length} linha(s)</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {br(dates[0])} a {br(dates[dates.length - 1])} · compras {brl(sum(compras))} ({compras.length})
                        {creditos.length > 0 && <> · estornos/créditos {brl(sum(creditos))} ({creditos.length})</>}
                      </p>
                      {check.status === 'ok' && (
                        <p className="text-xs flex items-center gap-1 text-secondary">
                          <CheckCircle2 className="h-3.5 w-3.5" /> A soma confere com o total da planilha ({brl(check.informed ?? 0)}).
                        </p>
                      )}
                      {check.status === 'diff' && (
                        <p className="text-xs flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> A soma das linhas ({brl(check.sum)}) difere do total da
                          planilha ({brl(check.informed ?? 0)}). Confira se alguma linha ficou de fora.
                        </p>
                      )}
                      {b.ignored > 0 && (
                        <p className="text-xs text-muted-foreground">{b.ignored} linha(s) sem data, descrição ou valor foram ignoradas.</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label>Na planilha, as compras aparecem como valores…</Label>
                <Select value={amountSign} onValueChange={v => setAmountSign(v as AmountSign)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compras-positivas">positivos (padrão de fatura; estornos negativos)</SelectItem>
                    <SelectItem value="compras-negativas">negativos (créditos positivos)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Compras viram despesa e estornos viram receita. Confira os totais acima: se "compras" e "estornos" estiverem
                  trocados, mude esta opção.
                </p>
              </div>

              {preview.rows.some(r => r.categoryHint || r.unitHint) && (
                <p className="text-xs text-muted-foreground">
                  A planilha traz categoria e unidade ao lado do valor: quando o nome bate com um cadastro, a linha já
                  entra preenchida (você ainda pode alterar antes de criar o lançamento).
                </p>
              )}
              {preview.warnings.map(w => <p key={w} className="text-xs text-muted-foreground">{w}</p>)}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPendingImport(null)}>Cancelar</Button>
            <Button disabled={busy || !preview || preview.rows.length === 0} onClick={confirmImport} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {preview?.rows.length ?? 0} linha(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
