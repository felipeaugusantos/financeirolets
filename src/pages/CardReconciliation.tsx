import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CreditCard, Upload, PlusCircle, Loader2, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
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
import { errorMessage, todayLocalISO } from '@/lib/utils';

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const NONE = '__none__';
const SELECT_CLASS = 'h-8 w-full min-w-[9rem] rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50';
/** Final de 4 dígitos aparece como •••• 1234; rótulo de bloco ("VISA INFINITY") aparece como está. */
/** "2026-09" -> "2026-09-30" (último dia do mês); vazio -> null. */
function monthToDate(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}
const cardText = (c: string) => (/^\d{4}$/.test(c) ? `•••• ${c}` : c);

interface CardEntry {
  id: string;
  account_id: string;
  card_last4: string | null;
  posted_at: string;
  launch_date: string | null;
  competence_date: string | null;
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

/** Ajustes do usuário sobre uma linha do pré-lançamento (o que não está aqui vem da planilha). */
interface DraftEdit {
  include?: boolean;
  unit_id?: string | null;
  front_id?: string | null;
  category_id?: string | null;
  payment_method?: TablesInsert<'card_statement_entries'>['payment_method'];
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
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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

  // Hash de cada linha (chave estável da importação) e quais já existem no banco.
  useEffect(() => {
    let cancelled = false;
    setExistingHashes(new Set());
    setHashes({});
    setChecked(false);
    if (!preview) return;
    (async () => {
      const map: Record<string, string> = {};
      for (const row of preview.rows) map[row.hashKey] = await sha1(row.hashKey);
      if (cancelled) return;
      setHashes(map);
      const all = Object.values(map);
      const found = new Set<string>();
      for (let i = 0; i < all.length; i += 200) {
        const { data } = await supabase
          .from('card_statement_entries')
          .select('row_hash')
          .in('row_hash', all.slice(i, i + 200));
        for (const r of data ?? []) found.add((r as { row_hash: string }).row_hash);
      }
      if (!cancelled) { setExistingHashes(found); setChecked(true); }
    })();
    return () => { cancelled = true; };
  }, [preview]);

  /** Linhas do pré-lançamento: planilha + dicas de categoria/unidade + ajustes do usuário. */
  const drafts = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map(row => {
      const despesa = row.amount < 0;
      const cats = categories.filter(c => c.type === (despesa ? 'despesa' : 'receita'));
      const edit = edits[row.hashKey] ?? {};
      const hash = hashes[row.hashKey];
      const exists = !!hash && existingHashes.has(hash);
      return {
        row,
        hash,
        exists,
        cats,
        include: !exists && edit.include !== false,
        unit_id: edit.unit_id !== undefined ? edit.unit_id : (matchByName(units, row.unitHint)?.id ?? null),
        front_id: edit.front_id ?? null,
        category_id: edit.category_id !== undefined ? edit.category_id : (matchByName(cats, row.categoryHint)?.id ?? null),
        payment_method: edit.payment_method !== undefined
          ? edit.payment_method
          : (suggestPaymentMethod(row.description) ?? 'cartao_credito'),
      };
    });
  }, [preview, categories, units, edits, hashes, existingHashes]);

  const setEdit = (key: string, patch: DraftEdit) => setEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const applyAll = (patch: (d: (typeof drafts)[number]) => DraftEdit | null) =>
    setEdits(prev => {
      const next = { ...prev };
      for (const d of drafts) {
        if (!d.include) continue;
        const p = patch(d);
        if (p) next[d.row.hashKey] = { ...next[d.row.hashKey], ...p };
      }
      return next;
    });

  const included = drafts.filter(d => d.include);
  const readyToLaunch = included.filter(d => d.unit_id && d.category_id);

  /** Data do pagamento da fatura: vira competência e pagamento dos lançamentos criados. */
  const [launchDate, setLaunchDate] = useState(todayLocalISO());
  /** Competência (AAAA-MM): mês em que vale no DRE. Vazio = usa a data do lançamento. */
  const [competenceMonth, setCompetenceMonth] = useState('');
  const closeImport = () => { setPendingImport(null); setEdits({}); setProgress(null); };

  /**
   * Grava as linhas marcadas como pendentes (o hash ignora as já importadas) e, se `launch`,
   * cria o lançamento de cada uma que tem unidade e categoria. Sem unidade/categoria a linha
   * fica pendente na lista para ser completada depois.
   */
  const confirmImport = async (launch: boolean) => {
    if (!pendingImport || !preview) return;
    setBusy(true);
    try {
      const payload: TablesInsert<'card_statement_entries'>[] = included.map(d => ({
        account_id: accountId,
        card_last4: d.row.card,
        posted_at: d.row.posted_at,
        launch_date: launchDate || null,
        competence_date: monthToDate(competenceMonth),
        description: d.row.description,
        amount: d.row.amount,
        row_hash: d.hash,
        source_file: pendingImport.fileName,
        status: 'pendente',
        unit_id: d.unit_id,
        front_id: d.front_id,
        category_id: d.category_id,
        note: d.row.note,
        payment_method: d.payment_method,
        imported_by: user?.id ?? null,
      }));

      const idByHash = new Map<string, string>();
      for (let i = 0; i < payload.length; i += 500) {
        const { data, error } = await supabase
          .from('card_statement_entries')
          .upsert(payload.slice(i, i + 500), { onConflict: 'row_hash', ignoreDuplicates: true })
          .select('id, row_hash');
        if (error) throw error;
        for (const r of (data ?? []) as { id: string; row_hash: string }[]) idByHash.set(r.row_hash, r.id);
      }
      const jaExistiam = payload.length - idByHash.size;

      let lancados = 0;
      let semDados = 0;
      let comErro = 0;
      let primeiroErro = '';
      if (launch) {
        const alvo = included.filter(d => d.hash && idByHash.has(d.hash));
        setProgress({ done: 0, total: alvo.length });
        for (const [i, d] of alvo.entries()) {
          if (!d.unit_id || !d.category_id) { semDados++; }
          else {
            const err = await launchEntry(idByHash.get(d.hash)!);
            if (err) { comErro++; primeiroErro ||= err; } else lancados++;
          }
          setProgress({ done: i + 1, total: alvo.length });
        }
      }

      const guardadas = idByHash.size - lancados;
      toast({
        title: launch ? `${lancados} lançamento(s) criado(s)` : `${idByHash.size} linha(s) salva(s) como pendentes`,
        description: [
          launch && guardadas > 0 ? `${guardadas} ficaram pendentes na lista` : '',
          semDados > 0 ? `${semDados} sem unidade/categoria` : '',
          comErro > 0 ? `${comErro} com erro: ${primeiroErro}` : '',
          jaExistiam > 0 ? `${jaExistiam} já existiam (importação anterior) e foram mantidas` : '',
        ].filter(Boolean).join(' · ') || undefined,
        variant: comErro > 0 ? 'destructive' : undefined,
      });
      closeImport();
      await load(accountId);
    } catch (err: unknown) {
      toast({ title: 'Erro ao importar planilha', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
      setProgress(null);
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
  /** Devolve a mensagem de erro (em português) ou null quando o lançamento foi criado. */
  const launchEntry = async (entryId: string): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('create_transaction_from_card_entry', { p_entry_id: entryId });
    if (!error) return null;
    const msg: string = error.message ?? '';
    if (error.code === 'PGRST202') {
      return 'A função create_transaction_from_card_entry não existe neste banco. Aplique a migração 20261003230000 antes de usar.';
    }
    if (msg.startsWith('entry_not_pending')) return 'Esta linha já foi conciliada (ou você não tem permissão). Atualize a tela.';
    if (msg.startsWith('missing_fields')) return 'Informe unidade e categoria da linha.';
    return msg;
  };

  const createFor = async (entry: CardEntry) => {
    if (!entry.unit_id || !entry.category_id) {
      toast({ title: 'Informe unidade e categoria', description: entry.description, variant: 'destructive' });
      return false;
    }
    const description = await launchEntry(entry.id);
    if (description) {
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
            ano atual. Antes de gravar, você confere o pré-lançamento na tela: ajusta unidade e categoria e clica em
            Lançar. Nada é gravado antes disso.
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
                    <th className="py-2 px-2 font-medium">Compra</th>
                    <th className="py-2 px-2 font-medium">Lançamento</th>
                    <th className="py-2 px-2 font-medium">Competência</th>
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
                          <input
                            type="date"
                            disabled={done}
                            value={e.launch_date ?? ''}
                            onChange={ev => patchEntry(e.id, { launch_date: ev.target.value || null })}
                            title="Data do lançamento no sistema (pagamento da fatura). Vazio = data da compra."
                            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="month"
                            disabled={done}
                            value={e.competence_date ? e.competence_date.slice(0, 7) : ''}
                            onChange={ev => patchEntry(e.id, { competence_date: monthToDate(ev.target.value) })}
                            title="Mês em que o valor entra no DRE. Vazio = mês da data do lançamento."
                            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
                          />
                        </td>
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

      <Dialog open={!!pendingImport} onOpenChange={open => { if (!open && !busy) closeImport(); }}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          {/* Cabeçalho fixo: título, resumo por cartão e ajustes em massa. */}
          <div className="max-h-[50%] shrink-0 space-y-3 overflow-y-auto border-b border-border p-6 pb-4 pr-12 text-sm">
          <DialogHeader>
            <DialogTitle>Pré-lançamento da fatura</DialogTitle>
            <DialogDescription>
              {pendingImport?.fileName} — nada foi gravado ainda. Confira, ajuste unidade e categoria e clique em Lançar.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">Data do lançamento (pagamento da fatura):</span>
            <input type="date" value={launchDate} onChange={ev => setLaunchDate(ev.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
            <span className="text-muted-foreground">usada como vencimento e pagamento; a data da compra fica guardada.</span>
          </label>
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">Competência (mês em que vale no DRE):</span>
            <input type="month" value={competenceMonth} onChange={ev => setCompetenceMonth(ev.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
            <span className="text-muted-foreground">vazio = mês da data do lançamento.</span>
          </label>

            {preview && (
              <>
              <div className="grid gap-2 md:grid-cols-2">
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
              {preview.warnings.map(w => <p key={w} className="text-xs text-muted-foreground">{w}</p>)}

              <div className="grid gap-3 md:grid-cols-3 items-end">
                <div className="space-y-1.5">
                  <Label>Na planilha, as compras aparecem como valores…</Label>
                  <Select value={amountSign} onValueChange={v => { setAmountSign(v as AmountSign); setEdits({}); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compras-positivas">positivos (estornos negativos)</SelectItem>
                      <SelectItem value="compras-negativas">negativos (créditos positivos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Unidade para todas as marcadas</Label>
                  <select
                    aria-label="Unidade para todas"
                    className={SELECT_CLASS}
                    value=""
                    onChange={e => { const v = e.target.value; if (v) applyAll(() => ({ unit_id: v === NONE ? null : v })); }}
                  >
                    <option value="">Aplicar a todas…</option>
                    <option value={NONE}>Sem unidade</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria para todas as marcadas</Label>
                  <select
                    aria-label="Categoria para todas"
                    className={SELECT_CLASS}
                    value=""
                    onChange={e => {
                      const v = e.target.value;
                      if (v) applyAll(d => (d.cats.some(c => c.id === v) ? { category_id: v } : null));
                    }}
                  >
                    <option value="">Aplicar às de mesmo tipo…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                  </select>
                </div>
              </div>

              </>
            )}
          </div>

          {/* Conteúdo: só a lista rola; cabeçalho e rodapé ficam travados. */}
          {preview && (
            <div className="min-h-0 flex-1 px-6 py-3 text-sm">
              <div className="h-full overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 px-2 w-8">
                        <Checkbox
                          aria-label="Marcar todas"
                          checked={drafts.some(d => !d.exists) && drafts.filter(d => !d.exists).every(d => d.include)}
                          onCheckedChange={v => setEdits(prev => {
                            const next = { ...prev };
                            for (const d of drafts) if (!d.exists) next[d.row.hashKey] = { ...next[d.row.hashKey], include: !!v };
                            return next;
                          })}
                        />
                      </th>
                      <th className="py-2 px-2 font-medium">Data</th>
                      <th className="py-2 px-2 font-medium">Descrição</th>
                      <th className="py-2 px-2 font-medium text-right">Valor</th>
                      <th className="py-2 px-2 font-medium">Unidade</th>
                      <th className="py-2 px-2 font-medium">Categoria</th>
                      <th className="py-2 px-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map(d => {
                      const key = d.row.hashKey;
                      const falta = d.include && (!d.unit_id || !d.category_id);
                      return (
                        <tr key={key} className={`border-b border-border/60 last:border-0 ${d.exists ? 'opacity-50' : ''}`}>
                          <td className="py-1.5 px-2">
                            <Checkbox
                              disabled={d.exists}
                              checked={d.include}
                              onCheckedChange={v => setEdit(key, { include: !!v })}
                              aria-label={`Incluir ${d.row.description}`}
                            />
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">{br(d.row.posted_at)}</td>
                          <td className="py-1.5 px-2">
                            <span className="block truncate max-w-[260px]">{d.row.description}</span>
                            <span className="text-[10px] text-muted-foreground">{cardText(d.row.card)}</span>
                          </td>
                          <td className={`py-1.5 px-2 text-right font-medium whitespace-nowrap ${d.row.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                            {brl(d.row.amount)}
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              aria-label={`Unidade de ${d.row.description}`}
                              disabled={!d.include}
                              className={SELECT_CLASS}
                              value={d.unit_id ?? NONE}
                              onChange={e => setEdit(key, { unit_id: e.target.value === NONE ? null : e.target.value })}
                            >
                              <option value={NONE}>Sem unidade</option>
                              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              aria-label={`Categoria de ${d.row.description}`}
                              disabled={!d.include}
                              className={SELECT_CLASS}
                              value={d.category_id ?? NONE}
                              onChange={e => setEdit(key, { category_id: e.target.value === NONE ? null : e.target.value })}
                            >
                              <option value={NONE}>Sem categoria</option>
                              {d.cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            {d.exists
                              ? <Badge variant="outline" className="text-[10px]">Já importada</Badge>
                              : !d.include
                                ? <Badge variant="outline" className="text-[10px]">Ignorada</Badge>
                                : falta
                                  ? <Badge variant="outline" className="text-[10px] text-destructive">Falta unidade/categoria</Badge>
                                  : <Badge className="text-[10px]">Pronta</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rodapé fixo: totais e ações. */}
          <div className="shrink-0 space-y-2 border-t border-border bg-background px-6 py-3">
            {preview && (
              <p className="text-xs text-muted-foreground">
                {included.length} marcada(s) · {readyToLaunch.length} pronta(s) para lançar · total{' '}
                {brl(included.reduce((t, d) => t + d.row.amount, 0))}. Linhas sem unidade ou categoria ficam
                pendentes na lista para você completar depois.
              </p>
            )}
            <DialogFooter className="gap-2">
              {!checked && preview && <span className="text-xs text-muted-foreground self-center">Verificando linhas já importadas…</span>}
              {progress && <span className="text-xs text-muted-foreground self-center">Lançando {progress.done}/{progress.total}…</span>}
              <Button variant="outline" disabled={busy} onClick={closeImport}>Cancelar</Button>
              <Button variant="outline" disabled={busy || !checked || included.length === 0} onClick={() => confirmImport(false)}>
                Salvar como pendentes
              </Button>
              <Button disabled={busy || !checked || readyToLaunch.length === 0} onClick={() => confirmImport(true)} className="gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Lançar {readyToLaunch.length} valor(es)
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
