import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CreditCard, Upload, PlusCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAYMENT_METHOD_LABELS, suggestPaymentMethod } from '@/lib/paymentMethod';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/utils';

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const NONE = '__none__';

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

/** Data em ISO a partir de célula do Excel (serial, Date ou texto dd/mm/aaaa). */
function toISODate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  const brMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return isoMatch ? isoMatch[0] : null;
}

/** Converte "1.234,56" ou "1234.56" em número. */
function toAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const text = String(value).replace(/[^\d,.-]/g, '');
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function pickColumn(headers: string[], candidates: string[]) {
  return headers.find(h => candidates.some(c => norm(h).includes(c)));
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

  const handleFile = async (file: File) => {
    if (!accountId) {
      toast({ title: 'Escolha a conta antes de importar', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (rows.length === 0) throw new Error('A planilha está vazia.');

      const headers = Object.keys(rows[0]);
      const colDate = pickColumn(headers, ['data', 'date', 'venda']);
      const colDesc = pickColumn(headers, ['descricao', 'historico', 'estabelecimento', 'description']);
      const colAmount = pickColumn(headers, ['valor', 'amount', 'total']);
      const colCard = pickColumn(headers, ['final', 'cartao', 'card', 'ultimos']);
      if (!colDate || !colDesc || !colAmount) {
        throw new Error('A planilha precisa ter as colunas Data, Descrição e Valor.');
      }

      const payload: TablesInsert<'card_statement_entries'>[] = [];
      let ignored = 0;
      for (const r of rows) {
        const posted_at = toISODate(r[colDate]);
        const amount = toAmount(r[colAmount]);
        const description = String(r[colDesc] ?? '').trim();
        if (!posted_at || amount == null || !description) { ignored++; continue; }
        const card_last4 = colCard ? String(r[colCard] ?? '').replace(/\D/g, '').slice(-4) || null : null;
        payload.push({
          account_id: accountId,
          card_last4,
          posted_at,
          description,
          amount,
          row_hash: await sha1(`${accountId}|${posted_at}|${description}|${amount}|${card_last4 ?? ''}`),
          source_file: file.name,
          status: 'pendente',
          payment_method: suggestPaymentMethod(description) ?? 'cartao_credito',
          imported_by: user?.id ?? null,
        });
      }
      if (payload.length === 0) throw new Error('Nenhuma linha válida encontrada na planilha.');

      const { error } = await supabase
        .from('card_statement_entries')
        .upsert(payload, { onConflict: 'row_hash', ignoreDuplicates: true });
      if (error) throw error;

      toast({
        title: 'Planilha importada',
        description: `${payload.length} linha(s) processada(s)${ignored ? ` · ${ignored} ignorada(s) por dados incompletos` : ''}. Linhas repetidas não são duplicadas.`,
      });
      await load(accountId);
    } catch (err: unknown) {
      toast({ title: 'Erro ao importar planilha', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
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
    const { error } = await supabase.rpc('create_transaction_from_card_entry', { p_entry_id: entry.id });
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
            A planilha (.xlsx ou .csv) precisa ter as colunas <strong>Data</strong>, <strong>Descrição</strong> e{' '}
            <strong>Valor</strong>. Se houver uma coluna com o final do cartão, as linhas ficam separadas por cartão.
            Nada vira lançamento sozinho: você informa unidade e categoria e confirma.
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
                  {cards.map(c => <SelectItem key={c} value={c}>•••• {c}</SelectItem>)}
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
                          {e.card_last4 && <span className="text-[10px] text-muted-foreground">•••• {e.card_last4}</span>}
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
    </div>
  );
}
