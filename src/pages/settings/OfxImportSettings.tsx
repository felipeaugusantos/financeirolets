import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Link2, Link2Off, EyeOff, PlusCircle, FileText, AlertTriangle, Zap, CheckSquare, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOfxImport, EnrichedEntry, StatementEntry, TransactionPatch } from '@/hooks/useOfxImport';
import type { Tables } from '@/integrations/supabase/types';
import { pickAutoLinkable, normalizeText } from '@/lib/ofxMatch';
import { OptionList } from '@/components/ofx/OfxRulesPanel';
import DuplicatePairingPanel from '@/components/ofx/DuplicatePairingPanel';
import OfxPeriodReport from '@/components/ofx/OfxPeriodReport';
import BulkCreateDialog, { type BulkCreatePatch } from '@/components/ofx/BulkCreateDialog';
import ClassicReconciliation from '@/components/ofx/ClassicReconciliation';
import InternalTransfersPanel from '@/components/ofx/InternalTransfersPanel';
import PatternGroupsPanel from '@/components/ofx/PatternGroupsPanel';
import ClosingPanel from '@/components/ofx/ClosingPanel';
import QuickRuleDialog, { QuickRuleSeed } from '@/components/ofx/QuickRuleDialog';
import AutoPostDialog, { type AutoPostItem } from '@/components/ofx/AutoPostDialog';
import { useAuth } from '@/contexts/AuthContext';
import { reconciledPercent, matchesEntrySearch } from '@/lib/entrySearch';
import { createdFromStatement } from '@/lib/ofxUnlink';
import { Progress } from '@/components/ui/progress';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import SuggestedRulesPanel from '@/components/ofx/SuggestedRulesPanel';
import { suggestPaymentMethod } from '@/lib/paymentMethod';

import { parseOfx, readOfxFile } from '@/lib/ofx';
import { todayLocalISO } from '@/lib/utils';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');
const NONE = '__none__';

function firstDayOfMonth(): string {
  const t = todayLocalISO();
  return `${t.slice(0, 7)}-01`;
}

const confidenceStyle: Record<string, string> = {
  alta: 'bg-secondary/15 text-secondary border-secondary/30',
  media: 'bg-accent/15 text-accent border-accent/30',
  baixa: 'bg-muted text-muted-foreground border-border',
};

const basisLabel: Record<string, string> = {
  exato: 'valor exato',
  liquido: 'líquido/impostos',
  taxa: 'taxa de adquirente',
  juros: 'juros ou multa',
  aproximado: 'arredondamento',
  bruto: 'valor bruto',
};

// Quadro "Nomes repetidos sem regra" oculto a pedido do cliente (item 15).
const SHOW_SUGGESTED_RULES = false;

export default function OfxImportSettings({ onBack }: { onBack?: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const reprocessRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const filterKey = `ofx-conciliacao-filtros:${user?.id ?? 'anon'}`;
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(filterKey) || '{}') as Record<string, string>; }
    catch { return {} as Record<string, string>; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [accounts, setAccounts] = useState<Tables<'accounts'>[]>([]);
  const [accountId, setAccountId] = useState<string>(saved.accountId || '');
  const [from, setFrom] = useState(saved.from || firstDayOfMonth());
  const [to, setTo] = useState(saved.to || todayLocalISO());
  const [statusFilter, setStatusFilter] = useState<'pendente' | 'vinculado' | 'ignorado' | 'todos'>(
    (saved.statusFilter as 'pendente') || 'pendente');
  const [search, setSearch] = useState(saved.search || '');
  const [options, setOptions] = useState<OptionList>({ categories: [], units: [], fronts: [], partners: [] });
  const [createFor, setCreateFor] = useState<EnrichedEntry | null>(null);
  const [createForm, setCreateForm] = useState<Partial<TransactionPatch>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [view, setView] = useState<'paineis' | 'lista'>((saved.view as 'lista') || 'paineis');
  const [existingDescriptions, setExistingDescriptions] = useState<Map<string, string[]>>(new Map());
  /** Conciliação (vínculo) que o usuário pediu para excluir; null = nenhum diálogo. */
  const [deleteTarget, setDeleteTarget] = useState<StatementEntry | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  /** Revisão única para criar vários lançamentos com os mesmos campos. */
  const [bulkOpen, setBulkOpen] = useState(false);
  /** Linhas em revisão no diálogo de criação em lote. */
  const [bulkItems, setBulkItems] = useState<EnrichedEntry[]>([]);
  /** Regra rápida sendo criada a partir de uma linha/grupo do extrato. */
  const [ruleSeed, setRuleSeed] = useState<QuickRuleSeed | null>(null);
  /** Revisão do lançamento automático das linhas já classificadas por regra. */
  const [autoPostOpen, setAutoPostOpen] = useState(false);


  const {
    enriched, entries, candidates, rules, loading, importing, batchRunning, lastImport, stats,
    importFile, reprocessFile, reapplyRules, linkEntry, unlinkEntry, unlinkAndDeleteEntry, ignoreEntry, createFromEntry,
    linkMany, ignoreMany, createMany, createGrouped, autoLinkByDescription, unlinkMany, duplicateGroups,
  } = useOfxImport(accountId || null, from, to);

  // Guarda os filtros para reabrir a tela do mesmo jeito.
  useEffect(() => {
    try {
      localStorage.setItem(filterKey, JSON.stringify({ accountId, from, to, statusFilter, view, search }));
    } catch { /* armazenamento indisponível */ }
  }, [filterKey, accountId, from, to, statusFilter, view, search]);

  // Seleção não sobrevive a troca de conta, período, status ou visão (evita somas "invisíveis").
  useEffect(() => { setSelected(new Set()); }, [accountId, from, to, statusFilter, view]);

  const progress = useMemo(() => reconciledPercent(entries), [entries]);


  useEffect(() => {
    (async () => {
      const [acc, cat, uni, fro, par] = await Promise.all([
        supabase.from('accounts').select('*').eq('active', true).order('name'),
        supabase.from('categories').select('id, name, type').eq('active', true).order('name'),
        supabase.from('units').select('id, name').eq('active', true).order('name'),
        supabase.from('business_fronts').select('id, name').eq('active', true).order('name'),
        supabase.from('partners').select('id, name').eq('active', true).order('name'),
      ]);
      setAccounts(acc.data ?? []);
      if (!accountId && acc.data?.length) setAccountId(acc.data[0].id);
      setOptions({
        categories: (cat.data ?? []),
        units: (uni.data ?? []),
        fronts: (fro.data ?? []),
        partners: (par.data ?? []),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const account = accounts.find(a => a.id === accountId);

  /**
   * Lançamentos já existentes (mesma conta ou sem conta) usados para detectar
   * duplicidade. A chave combina descrição + valor; as datas ficam na lista
   * para exigir proximidade de dias — descrição repetida sozinha não basta.
   */
  useEffect(() => {
    if (!accountId) { setExistingDescriptions(new Map()); return; }
    const shift = (iso: string, days: number) => {
      const d = new Date(`${iso}T12:00:00`);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    (async () => {
      const { data } = await supabase
        .from('transactions')
        .select('description, amount, net_amount, competence_date, due_date, payment_date, account_id')
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .gte('competence_date', shift(from, -35))
        .lte('competence_date', shift(to, 35))
        .neq('status', 'cancelado')
        .limit(5000);
      const map = new Map<string, string[]>();
      for (const t of (data ?? [])) {
        const desc = normalizeText(t.description || '');
        if (!desc) continue;
        const values = [t.amount, t.net_amount]
          .filter(v => v !== null && v !== undefined)
          .map(v => Math.abs(Number(v)).toFixed(2));
        const dates = [t.payment_date, t.due_date, t.competence_date].filter(Boolean) as string[];
        for (const v of new Set(values)) {
          const key = `${desc}|${v}`;
          map.set(key, [...(map.get(key) ?? []), ...dates]);
        }
      }
      setExistingDescriptions(map);
    })();
  }, [accountId, from, to, entries.length]);

  /**
   * Ids de linhas pendentes que já têm lançamento equivalente:
   * mesma descrição, mesmo valor e data em até 5 dias de diferença.
   */
  const { isAdmin: roleAdmin, isFinanceiro: roleFin } = useCurrentUserRoles();
  /** Resposta do cliente (P13): só Administrador e Financeiro lançam pelas regras. */
  const canAutoPost = roleAdmin || roleFin;

  const duplicateIds = useMemo(() => {
    const set = new Set<string>();
    const dayDiff = (a: string, b: string) =>
      Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000;
    for (const e of entries) {
      if (e.status !== 'pendente') continue;
      const desc = normalizeText(e.memo || '');
      if (!desc) continue;
      // Resposta do cliente (P12): tarifas iguais em dias próximos nunca são repetidas.
      if (desc.includes('tarifa')) continue;
      const dates = existingDescriptions.get(`${desc}|${Math.abs(Number(e.amount)).toFixed(2)}`);
      if (dates?.some(d => dayDiff(d, e.posted_at) <= 5)) set.add(e.id);
    }
    return set;
  }, [entries, existingDescriptions]);


  /** Linhas pendentes com descrição idêntica a um único lançamento e regra compatível. */
  const descAutoLinkables = useMemo(
    () => enriched.filter(v => v.entry.status === 'pendente' && v.descMatch.autoLinkable),
    [enriched]
  );
  const descAutoIds = useMemo(
    () => new Set(descAutoLinkables.map(v => v.entry.id)),
    [descAutoLinkables]
  );
  /** Linhas com descrição idêntica, mas divergentes da regra de conciliação. */
  const descDivergences = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of enriched) {
      if (v.entry.status !== 'pendente') continue;
      if (v.descMatch.divergences.length > 0) map.set(v.entry.id, v.descMatch.divergences);
      else if (v.descMatch.ambiguous) map.set(v.entry.id, ['mais de um lançamento com a mesma descrição']);
    }
    return map;
  }, [enriched]);

  /** Linhas apenas parecidas (ex.: mesma descrição e valor, data diferente). */
  const descSimilar = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of enriched) {
      if (v.entry.status !== 'pendente') continue;
      if (v.descMatch.similar) map.set(v.entry.id, v.descMatch.similarReasons);
    }
    return map;
  }, [enriched]);


  const runAutoLinkByDescription = async () => {
    if (descAutoLinkables.length === 0) return;
    await autoLinkByDescription(descAutoLinkables.map(v => ({
      entryId: v.entry.id,
      transactionId: v.descMatch.transaction!.id,
    })));
    clearSelection();
  };

  /**
   * Aplica a regra atual (data + descrição + valor iguais = vínculo automático;
   * só parte igual = "similar") também aos registros JÁ importados: reaplica as
   * regras, revalida todas as linhas pendentes e vincula as que batem exatamente.
   */
  const revalidateImported = async () => {
    await reapplyRules();
    if (descAutoLinkables.length === 0) {
      toast({
        title: 'Nenhum vínculo automático encontrado',
        description: 'As linhas pendentes já importadas foram revalidadas: nenhuma tem data, descrição e valor idênticos a um lançamento.',
      });
      return;
    }
    await runAutoLinkByDescription();
  };

  /** Desvincular: linhas com lançamento pedem confirmação; ignoradas apenas reabrem. */
  const requestUnlink = (e: StatementEntry) => {
    if (e.transaction_id) setDeleteTarget(e);
    else unlinkEntry(e.id);
  };

  /** Só desfaz o vínculo; o lançamento fica. */
  const confirmDeleteLink = async () => {
    if (!deleteTarget) return;
    await unlinkEntry(deleteTarget.id);
    setDeleteTarget(null);
    toast({ title: 'Conciliação desfeita', description: 'A linha voltou para pendente. O lançamento não foi apagado.' });
  };

  /** Desfaz o vínculo e exclui o lançamento (padrão). */
  const confirmUnlinkAndDelete = async () => {
    if (!deleteTarget?.transaction_id) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await unlinkAndDeleteEntry(target.id, target.transaction_id!, {
      createdFromExtract: createdFromStatement(target),
      matchNote: target.match_note,
    });
  };

  /** Exclui todas as conciliações (linhas vinculadas) do período exibido. */
  const confirmDeleteAllLinks = async () => {
    const ids = entries.filter(e => e.status === 'vinculado').map(e => e.id);
    setDeleteAllOpen(false);
    if (ids.length === 0) return;
    await unlinkMany(ids);
    clearSelection();
  };



  const visible = useMemo(
    () => enriched.filter(e =>
      (statusFilter === 'todos' || e.entry.status === statusFilter)
      && (view !== 'lista' || matchesEntrySearch(search, e.entry.memo, Number(e.entry.amount)))),
    [enriched, statusFilter, search, view]
  );
  const listEntries = useMemo(
    () => (search.trim() ? entries.filter(e => matchesEntrySearch(search, e.memo, Number(e.amount))) : entries),
    [entries, search]
  );

  // Só linhas pendentes entram em ação de lote.
  const selectableIds = useMemo(
    () => visible.filter(v => v.entry.status === 'pendente').map(v => v.entry.id),
    [visible]
  );
  const selectedItems = useMemo(
    () => visible.filter(v => selected.has(v.entry.id) && v.entry.status === 'pendente'),
    [visible, selected]
  );
  const selectedWithSuggestion = useMemo(
    () => selectedItems.filter(v => v.suggestions.length > 0),
    [selectedItems]
  );
  /** Linhas pendentes que podem ser vinculadas sem ambiguidade. */
  const autoLinkable = useMemo(
    () => pickAutoLinkable(
      enriched
        .filter(v => v.entry.status === 'pendente')
        .map(v => ({ key: v.entry.id, suggestions: v.suggestions }))
    ),
    [enriched]
  );

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(selectableIds));

  const clearSelection = () => setSelected(new Set());

  /**
   * Linhas pendentes que uma regra já classificou (categoria definida) e que
   * ainda não têm lançamento equivalente: candidatas ao lançamento automático.
   */
  const autoPostable = useMemo(
    () => enriched.filter(v =>
      v.entry.status === 'pendente'
      && !!v.ruleCategoryId
      && !descAutoIds.has(v.entry.id)
    ),
    [enriched, descAutoIds]
  );
  /** Com seleção na tabela, o diálogo traz exatamente as linhas marcadas. */
  const autoPostItems = selectedItems.length > 0 ? selectedItems : autoPostable;
  /** Linhas com possível duplicidade: aparecem no diálogo, mas desmarcadas e com aviso. */
  const autoPostWarnIds = useMemo(() => {
    const s = new Set(duplicateIds);
    descAutoIds.forEach(id => s.add(id));
    return s;
  }, [duplicateIds, descAutoIds]);

  /** Cria e concilia, de uma vez, as linhas revisadas no diálogo automático. */
  const confirmAutoPost = async (items: AutoPostItem[]) => {
    setAutoPostOpen(false);
    const res = await createMany(items.map(({ item: v, categoryId, unitId, frontId, paymentMethod, useRuleAllocations }) => ({
      entry: v.entry as StatementEntry,
      patch: {
        description: v.entry.memo || 'Lançamento do extrato',
        category_id: categoryId,
        unit_id: useRuleAllocations ? null : unitId,
        front_id: useRuleAllocations ? null : frontId,
        partner_id: v.rulePartnerId,
        payment_method: paymentMethod as TransactionPatch['payment_method'],
        allocations: useRuleAllocations ? (v.ruleAllocations ?? undefined) : undefined,
      },
    })));
    clearSelection();
    // Depois de lançar, mostra o extrato já conciliado para conferência.
    if (res.ok > 0) {
      setStatusFilter('vinculado');
      setView('lista');
    }
  };


  const runAutoLink = async () => {
    await linkMany(autoLinkable.map(a => ({
      entryId: a.key, transactionId: a.transactionId, note: `Lote automático — ${a.reasons.join('; ')}`,
    })));
    clearSelection();
  };

  const runLinkSelected = async () => {
    await linkMany(selectedWithSuggestion.map(v => ({
      entryId: v.entry.id,
      transactionId: v.suggestions[0].transaction.id,
      note: `Lote manual — ${v.suggestions[0].reasons.join('; ')}`,
    })));
    clearSelection();
  };

  /** Abre a revisão em lote para as linhas informadas (ou as selecionadas). */
  const openBulkCreate = (items?: EnrichedEntry[]) => {
    const list = (items ?? selectedItems).filter(v => v.entry.status === 'pendente');
    if (list.length === 0) {
      toast({ title: 'Selecione ao menos uma linha pendente', variant: 'destructive' });
      return;
    }
    setBulkItems(list);
    setBulkOpen(true);
  };

  /** Cria os lançamentos revisados no diálogo em lote. */
  const confirmBulkCreate = async (
    payload: { entryId: string; patch: BulkCreatePatch }[],
    grouped?: { description: string; competence_date: string },
  ) => {
    const byId = new Map(bulkItems.map(v => [v.entry.id, v]));
    setBulkOpen(false);
    if (grouped) {
      const first = payload[0];
      await createGrouped(
        payload.filter(p => byId.has(p.entryId)).map(p => byId.get(p.entryId)!.entry as StatementEntry),
        { ...first.patch, description: grouped.description, competence_date: grouped.competence_date },
      );
      clearSelection();
      return;
    }
    await createMany(payload
      .filter(p => byId.has(p.entryId))
      .map(p => ({ entry: byId.get(p.entryId)!.entry as StatementEntry, patch: p.patch })));
    clearSelection();
  };

  const runCreateSelected = async () => {
    const dups = selectedItems.filter(v => duplicateIds.has(v.entry.id));
    const target = selectedItems.filter(v => !duplicateIds.has(v.entry.id));
    if (target.length === 0) {
      toast({
        title: 'Nada a criar',
        description: 'Todas as linhas selecionadas já têm lançamento com a mesma descrição.',
        variant: 'destructive',
      });
      return;
    }
    if (dups.length > 0) {
      toast({
        title: `${dups.length} linha(s) ignorada(s) por duplicidade`,
        description: 'Já existe lançamento com a mesma descrição no período. Crie manualmente se for necessário.',
      });
    }
    await createMany(target.map(v => ({
      entry: v.entry as StatementEntry,
      patch: {
        description: v.entry.memo || 'Lançamento do extrato',
        category_id: v.ruleCategoryId,
        unit_id: v.ruleUnitId,
        front_id: v.ruleFrontId,
        partner_id: v.rulePartnerId,
      },
    })));
    clearSelection();
  };

  const runIgnoreSelected = async () => {
    const res = await ignoreMany(selectedItems.map(v => v.entry.id), ignoreReason);
    if (res.ok > 0) {
      setIgnoreOpen(false);
      setIgnoreReason('');
      clearSelection();
    }
  };

  /**
   * Ajusta o período da tela para cobrir as datas do arquivo importado.
   * Sem isso, importar um extrato de agosto no dia 02/09 mostra a lista vazia.
   */
  const widenPeriodTo = (summary: { statements: { transactions: { posted_at: string }[] }[]; fileName?: string }) => {
    const dates = summary.statements.flatMap(s => s.transactions.map(t => t.posted_at)).sort();
    if (dates.length === 0) return;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const nextFrom = first < from ? first : from;
    const nextTo = last > to ? last : to;
    if (nextFrom !== from || nextTo !== to) {
      setFrom(nextFrom);
      setTo(nextTo);
      toast({
        title: 'Período ajustado ao arquivo',
        description: `O extrato tem lançamentos de ${first.split('-').reverse().join('/')} a ${last.split('-').reverse().join('/')}. O filtro foi ampliado para exibi-los.`,
      });
    }
  };


  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    if (fileRef.current) fileRef.current.value = '';

    // Trava de segurança: nunca importar um arquivo de outra conta.
    // Importação cruzada é o erro mais caro aqui — bagunça saldo e DRE das duas contas.
    try {
      const parsed = parseOfx(await readOfxFile(file));
      const acct = parsed[0]?.acctid || '';
      const owner = accounts.find(a => a.ofx_acctid && acct && a.ofx_acctid === acct);
      if (acct && account?.ofx_acctid && account.ofx_acctid !== acct) {
        toast({
          title: 'Importação bloqueada: arquivo de outra conta',
          description: `O arquivo é da conta ${acct}${owner ? ` ("${owner.name}")` : ''}, mas você selecionou "${account.name}" (${account.ofx_acctid}). Selecione a conta correta e importe de novo.`,
          variant: 'destructive',
        });
        return;
      }
      if (acct && !account?.ofx_acctid && owner && owner.id !== accountId) {
        toast({
          title: 'Importação bloqueada: conta já usada por outra',
          description: `A conta ${acct} do arquivo já está gravada em "${owner.name}".`,
          variant: 'destructive',
        });
        return;
      }
    } catch {
      // Se não conseguirmos pré-ler, seguimos: importFile trata e reporta o erro.
    }

    const summary = await importFile(file, accountId);

    // O filtro de período é o motivo nº 1 de "importei e não apareceu nada":
    // o arquivo pode ser de datas fora do período na tela. Ampliamos o filtro
    // para cobrir as datas realmente presentes no arquivo.
    if (summary) widenPeriodTo(summary);

    // Se o arquivo declara a conta e ainda não gravamos, guardamos para o próximo upload.
    const acct = summary?.statements[0]?.acctid;
    if (summary && acct && account && !account.ofx_acctid) {
      await supabase.from('accounts').update({
        ofx_acctid: acct,
        ofx_bankid: summary.statements[0].bankid || null,
      }).eq('id', accountId);
      setAccounts(list => list.map(a => (a.id === accountId ? { ...a, ofx_acctid: acct } : a)));
    }
  };


  /** Abre a revisão em lote já com as linhas de um grupo de histórico. */
  const openBulkFor = (items: EnrichedEntry[]) => {
    setBulkItems(items);
    setBulkOpen(true);
  };

  /** Reprocessa o mesmo arquivo: atualiza pendentes, insere novas e reaplica regras. */
  const handleReprocessFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    const summary = await reprocessFile(file, accountId);
    if (summary) widenPeriodTo(summary);

    if (reprocessRef.current) reprocessRef.current.value = '';
    clearSelection();
  };


  const openCreate = (item: EnrichedEntry) => {
    setCreateFor(item);
    setCreateForm({
      description: item.entry.memo || '',
      category_id: item.ruleCategoryId ?? null,
      unit_id: item.ruleUnitId ?? null,
      front_id: item.ruleFrontId ?? null,
      partner_id: item.rulePartnerId ?? null,
    });
  };

  const confirmCreate = async () => {
    if (!createFor) return;
    // Mantém o rateio da regra, a menos que o usuário tenha escolhido uma unidade na tela.
    const keepRuleSplit = !createForm.unit_id && (createFor.ruleAllocations?.length ?? 0) > 0;
    const ok = await createFromEntry(createFor.entry as StatementEntry, {
      ...createForm,
      useRuleAllocations: keepRuleSplit,
      allocations: keepRuleSplit ? createFor.ruleAllocations : undefined,
    } as TransactionPatch);
    if (ok) setCreateFor(null);
  };

  const handleIgnore = async (item: EnrichedEntry) => {
    const note = window.prompt('Por que esta linha não vira lançamento? (fica registrado)', 'Transferência entre contas próprias');
    if (note === null) return;
    await ignoreEntry(item.entry.id, note || 'Ignorada manualmente');
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      )}

      <div>
        <h2 className="font-heading text-xl font-bold text-card-foreground">Conciliação bancária (OFX)</h2>

        <p className="text-sm text-muted-foreground">
          Bradesco e Stone. O extrato nunca cria lançamento sozinho — cada linha é vinculada, criada ou ignorada por você.
        </p>
      </div>

      <Card className="shadow-card rounded-2xl border-border">
        <CardContent className="pt-6 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Conta</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.ofx_acctid ? ` · ${a.ofx_acctid}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>De</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-4 flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".ofx,.OFX,text/plain,application/x-ofx" className="hidden" onChange={handleFile} />
            <Button
              className="gap-2 rounded-xl"
              disabled={!accountId || importing}
              onClick={() => setTimeout(() => fileRef.current?.click(), 100)}
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Lendo arquivo...' : 'Selecionar arquivo OFX'}
            </Button>
            <input ref={reprocessRef} type="file" accept=".ofx,.OFX,text/plain,application/x-ofx" className="hidden" onChange={handleReprocessFile} />
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              disabled={!accountId || importing}
              onClick={() => setTimeout(() => reprocessRef.current?.click(), 100)}
              title="Relê o mesmo arquivo e reaplica as regras nas linhas pendentes, sem desfazer decisões já tomadas"
            >
              <RefreshCw className="h-4 w-4" />
              {importing ? 'Processando...' : 'Reprocessar arquivo OFX'}
            </Button>
            <Button
              variant="ghost"
              className="gap-2 rounded-xl"
              disabled={!accountId || loading || importing}
              onClick={reapplyRules}
              title="Recarrega as regras de conciliação e reaplica às linhas pendentes"
            >
              <RotateCcw className="h-4 w-4" /> Reaplicar regras
            </Button>
            <Button
              variant="secondary"
              className="gap-2 rounded-xl"
              disabled={!accountId || loading || batchRunning}
              onClick={revalidateImported}
              title="Revalida os registros já importados: vincula automaticamente quando data, descrição e valor são iguais e marca os apenas parecidos como similares"
            >
              <Zap className="h-4 w-4" /> Revalidar importados ({descAutoLinkables.length})
            </Button>
            {canAutoPost && (
            <Button
              variant="secondary"
              className="gap-2 rounded-xl"
              disabled={!accountId || loading || batchRunning || autoPostItems.length === 0}
              onClick={() => setAutoPostOpen(true)}
              title="Cria e concilia as linhas selecionadas (ou, sem seleção, as que as regras já classificaram)"
            >
              <PlusCircle className="h-4 w-4" />
              {selectedItems.length > 0 ? 'Lançar selecionadas' : 'Lançar pelas regras'} ({autoPostItems.length})
            </Button>
            )}

            {(['pendente', 'vinculado', 'ignorado', 'todos'] as const).map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                className="rounded-xl capitalize"
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Button>
            ))}
            {view === 'lista' && (
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por descrição ou valor"
                className="h-8 w-56 rounded-xl text-xs"
              />
            )}
          </div>
          {accountId && progress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span><strong className="text-foreground">{progress.pct}% conciliado</strong> no período</span>
                <span>{progress.done} de {progress.total} linha(s) decididas</span>
              </div>
              <Progress value={progress.pct} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {lastImport && (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-0.5">
            <p><strong>{lastImport.fileName}</strong> — {lastImport.inserted} linha(s) novas, {lastImport.duplicated} já existentes (não reimportadas).</p>
            {lastImport.period.start && lastImport.period.end && (
              <p>Período do arquivo: {br(lastImport.period.start)} a {br(lastImport.period.end)}.</p>
            )}
            {lastImport.ledgerBalance !== null && (
              <p>
                Saldo final informado pelo banco
                {lastImport.ledgerBalanceDate ? ` em ${br(lastImport.ledgerBalanceDate)}` : ''}: <strong>{brl(lastImport.ledgerBalance)}</strong>.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Linhas no período', value: String(stats.total) },
          { label: 'Pendentes', value: String(stats.pendentes) },
          { label: 'Entradas do extrato', value: brl(stats.entradas) },
          { label: 'Saídas do extrato', value: brl(Math.abs(stats.saidas)) },
        ].map(k => (
          <Card key={k.label} className="shadow-card rounded-2xl border-border">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="font-heading text-lg font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.pendentes > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {stats.pendentes} linha(s) do extrato ainda sem decisão, somando {brl(stats.pendenteValor)}.
            Enquanto houver pendências, a conciliação bancária do período não pode ser considerada fechada.
          </AlertDescription>
        </Alert>
      )}

      {(descAutoLinkables.length > 0 || descDivergences.size > 0) && (
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-2">
            <p>
              {descAutoLinkables.length} linha(s) do extrato têm descrição idêntica a um lançamento existente
              e batem com a regra de conciliação (categoria, unidade, frente e parceiro) — podem ser
              <strong> vinculadas automaticamente</strong>, sem conciliar nem alterar o lançamento.
              {descDivergences.size > 0 && ` ${descDivergences.size} linha(s) têm descrição igual, mas divergem da regra e ficam para decisão manual.`}
            </p>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl h-8"
              disabled={descAutoLinkables.length === 0 || batchRunning}
              onClick={runAutoLinkByDescription}
            >
              <Zap className="h-3.5 w-3.5" /> Vincular automático por descrição ({descAutoLinkables.length})
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {([['paineis', 'Visão em painéis'], ['lista', 'Visão em lista']] as const).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={view === key ? 'default' : 'outline'}
            className="rounded-xl"
            onClick={() => setView(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {accountId && view === 'paineis' && (
        <ClassicReconciliation
          accountName={account?.name ?? 'Conta'}
          from={from}
          to={to}
          accountId={accountId}
          enriched={enriched}
          candidates={candidates}
          busy={batchRunning}
          onLink={(entryId, txId, note) => linkEntry(entryId, txId, note)}
          onUnlink={(entryId) => {
            const e = entries.find(x => x.id === entryId);
            if (e) requestUnlink(e as StatementEntry);
          }}
          search={search}
          onSearchChange={setSearch}
          onIgnore={(ids, reason) => ignoreMany(ids, reason)}
          onCreate={(id) => {
            const item = enriched.find(v => v.entry.id === id);
            if (item) openCreate(item);
          }}
          onCreateMany={(ids) => {
            const items = ids
              .map(id => enriched.find(v => v.entry.id === id))
              .filter(Boolean) as EnrichedEntry[];
            if (items.length === 1) openCreate(items[0]);
            else openBulkCreate(items);
          }}
        />
      )}

      {accountId && (
        <ClosingPanel
          accountId={accountId}
          accountName={account?.name ?? 'Conta'}
          to={to}
          ledgerBalance={lastImport?.ledgerBalance ?? null}
          ledgerBalanceDate={lastImport?.ledgerBalanceDate ?? null}
          pendentes={stats.pendentes}
          pendenteValor={stats.pendenteValor}
        />
      )}

      {accountId && <InternalTransfersPanel from={from} to={to} />}

      {accountId && (
        <PatternGroupsPanel
          enriched={enriched}
          onCreateRule={setRuleSeed}
          onCreateMany={openBulkFor}
        />
      )}

      {/* Quadro "Nomes repetidos sem regra" oculto a pedido do cliente (item 15). */}
      {SHOW_SUGGESTED_RULES && accountId && <SuggestedRulesPanel enriched={enriched} onCreateRule={setRuleSeed} />}

      {accountId && view === 'lista' && (
        <DuplicatePairingPanel groups={duplicateGroups} />
      )}


      {accountId && view === 'lista' && (
        <OfxPeriodReport
          entries={listEntries}
          accountName={account?.name ?? 'Conta'}
          from={from}
          to={to}
          selected={selected}
          duplicates={duplicateIds}
          autoLinkables={descAutoIds}
          divergences={descDivergences}
          similars={descSimilar}

          busy={batchRunning}
          onView={(e) => navigate(`/lancamentos?q=${encodeURIComponent(e.memo || '')}`)}
          onUnlink={(e) => requestUnlink(e)}
          onDeleteLink={(e) => setDeleteTarget(e)}
          onDeleteAllLinks={() => setDeleteAllOpen(true)}
          onToggle={toggle}
          onToggleAll={(ids) => {
            const all = ids.every(id => selected.has(id));
            ids.forEach(id => { if (all === selected.has(id)) toggle(id); });
          }}
          onCreate={(id) => {
            const item = enriched.find(v => v.entry.id === id);
            if (item) openCreate(item);
          }}
          onCreateSelected={() => openBulkCreate()}
        />
      )}

      {view === 'lista' && (
        <div>
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowDetails(v => !v)}>
            {showDetails ? 'Ocultar detalhes e sugestões' : 'Ver detalhes e sugestões das linhas'}
          </Button>
        </div>
      )}

      {showDetails && view === 'lista' && (
      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-sm font-heading">Linhas do extrato</CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl h-8"
              disabled={selectableIds.length === 0}
              onClick={toggleAll}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {allVisibleSelected ? 'Limpar seleção' : `Selecionar pendentes (${selectableIds.length})`}
            </Button>

            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 rounded-xl h-8"
              disabled={autoLinkable.length === 0 || batchRunning}
              onClick={runAutoLink}
            >
              <Zap className="h-3.5 w-3.5" />
              Vincular automático ({autoLinkable.length})
            </Button>

            {selectedItems.length > 0 && (
              <>
                <Badge variant="outline" className="text-[11px]">{selectedItems.length} selecionada(s)</Badge>
                <Button
                  size="sm"
                  className="gap-1.5 rounded-xl h-8"
                  disabled={selectedWithSuggestion.length === 0 || batchRunning}
                  onClick={runLinkSelected}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Vincular à melhor sugestão ({selectedWithSuggestion.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-xl h-8"
                  disabled={batchRunning}
                  onClick={() => openBulkCreate()}
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Criar lançamentos em lote
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 rounded-xl h-8"
                  disabled={batchRunning}
                  onClick={() => setIgnoreOpen(true)}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Ignorar selecionadas
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            "Vincular automático" só usa linhas de confiança alta, com um único candidato e sem disputa pelo mesmo
            lançamento. Ignorar em lote exige justificativa, gravada em cada linha com autor e data.
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && visible.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma linha nesse filtro.</p>
              <p className="text-xs text-muted-foreground">
                Se você acabou de importar um extrato, confira o <strong>período</strong> ({from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}) e a <strong>conta</strong> selecionada:
                as linhas só aparecem se a data do extrato estiver dentro do filtro.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => { setFrom(`${to.slice(0, 4)}-01-01`); setTo(todayLocalISO()); }}
              >
                Ver o ano todo
              </Button>
            </div>
          )}

          {visible.map(item => {
            const e = item.entry;
            return (
              <div key={e.id} className="rounded-2xl border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {e.status === 'pendente' && (
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.has(e.id)}
                        onCheckedChange={() => toggle(e.id)}
                        aria-label={`Selecionar linha de ${br(e.posted_at)}`}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.memo || '(sem descrição)'}</p>
                      <p className="text-xs text-muted-foreground">
                        {br(e.posted_at)} · {e.trn_type} · FITID {e.fitid}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-heading font-bold ${e.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                      {brl(e.amount)}
                    </p>
                    <Badge variant="outline" className="text-[10px] capitalize">{e.status}</Badge>
                  </div>
                </div>


                {item.ruleLabel && e.status === 'pendente' && (
                  <p className="text-xs text-accent">Regra "{item.ruleLabel}" aplicada — sugestão preenchida ao criar.</p>
                )}

                {e.status === 'pendente' && (
                  <>
                    {item.suggestions.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Lançamentos compatíveis:</p>
                        {item.suggestions.map(s => (
                          <div key={s.transaction.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {s.transaction.description} · {brl(Number(s.transaction.amount))}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{s.reasons.join(' · ')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-[10px] ${confidenceStyle[s.confidence]}`}>
                                {basisLabel[s.basis] ?? s.basis} · confiança {s.confidence}
                              </Badge>
                              <Button size="sm" className="gap-1.5 rounded-xl h-8" onClick={() => linkEntry(e.id, s.transaction.id, s.reasons.join('; '))}>
                                <Link2 className="h-3.5 w-3.5" /> Vincular
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum lançamento compatível encontrado na janela de 7 dias, nem considerando taxas ou juros.</p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-8" onClick={() => openCreate(item)}>
                        <PlusCircle className="h-3.5 w-3.5" /> Criar lançamento
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl h-8" onClick={() => handleIgnore(item)}>
                        <EyeOff className="h-3.5 w-3.5" /> Ignorar
                      </Button>
                    </div>
                  </>
                )}

                {e.status !== 'pendente' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {e.ignore_reason ? `Justificativa: ${e.ignore_reason}` : (e.match_note || '—')}
                      {e.decided_at && ` · ${new Date(e.decided_at).toLocaleString('pt-BR')}`}
                    </p>
                    <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl h-8" onClick={() => requestUnlink(e as StatementEntry)}>
                      <Link2Off className="h-3.5 w-3.5" /> Reabrir
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      )}



      <Dialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Desvincular conciliação</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                {br(deleteTarget.posted_at)} · {brl(Number(deleteTarget.amount))} · {deleteTarget.memo}
              </p>
              <p>
                A linha voltará para <strong>pendente</strong>. Em mês fechado a exclusão é recusada e nada é alterado.
              </p>
              {createdFromStatement(deleteTarget) ? (
                <p className="text-destructive">
                  Este lançamento foi criado a partir da linha: "Desvincular e excluir" o exclui (com rateio e anexos).
                  Se outras linhas do extrato estiverem ligadas a ele, ele é mantido até a última ser desvinculada.
                </p>
              ) : (
                <p>
                  Este lançamento já existia antes da conciliação. "Desvincular e excluir" o exclui também;
                  "Só desvincular" o mantém.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="outline" disabled={batchRunning} onClick={confirmDeleteLink}>Só desvincular</Button>
            <Button variant="destructive" disabled={batchRunning} onClick={confirmUnlinkAndDelete}>
              Desvincular e excluir lançamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Excluir todas as conciliações do período</DialogTitle></DialogHeader>
          <p className="text-xs">
            {entries.filter(e => e.status === 'vinculado').length} linha(s) vinculada(s) voltarão para pendente.
            Nenhum lançamento é excluído.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteAllOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={batchRunning} onClick={confirmDeleteAllLinks}>Excluir conciliações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ignoreOpen} onOpenChange={o => { setIgnoreOpen(o); if (!o) setIgnoreReason(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Ignorar {selectedItems.length} linha(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1 max-h-40 overflow-auto">
              {selectedItems.slice(0, 8).map(v => (
                <p key={v.entry.id} className="truncate">
                  {br(v.entry.posted_at)} · {brl(v.entry.amount)} · {v.entry.memo}
                </p>
              ))}
              {selectedItems.length > 8 && <p>... e mais {selectedItems.length - 8}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa (obrigatória)</Label>
              <Textarea
                value={ignoreReason}
                onChange={ev => setIgnoreReason(ev.target.value)}
                placeholder="Ex.: transferência entre contas próprias, já registrada na conta de destino."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                A mesma justificativa é gravada em cada linha, junto com seu usuário e a data/hora.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Transferência entre contas próprias', 'Estorno/duplicidade do banco', 'Movimento não financeiro'].map(s => (
                <Button key={s} size="sm" variant="outline" className="rounded-xl h-7 text-xs" onClick={() => setIgnoreReason(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIgnoreOpen(false)}>Cancelar</Button>
            <Button onClick={runIgnoreSelected} disabled={!ignoreReason.trim() || batchRunning}>
              Ignorar com justificativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <BulkCreateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={bulkItems}
        duplicates={duplicateIds}
        options={options}
        accounts={accounts}
        defaultAccountId={accountId}
        busy={batchRunning}
        onConfirm={confirmBulkCreate}
      />

      <QuickRuleDialog
        seed={ruleSeed}
        options={options}
        onOpenChange={o => !o && setRuleSeed(null)}
        onSaved={reapplyRules}
      />

      <AutoPostDialog
        open={autoPostOpen}
        onOpenChange={setAutoPostOpen}
        items={autoPostItems}
        duplicateIds={autoPostWarnIds}
        options={options}
        busy={batchRunning}
        onConfirm={confirmAutoPost}
      />




      <Dialog open={!!createFor} onOpenChange={o => !o && setCreateFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Criar lançamento a partir do extrato</DialogTitle></DialogHeader>
          {createFor && (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-0.5">
                <p><strong>Extrato:</strong> {br(createFor.entry.posted_at)} · {brl(createFor.entry.amount)}</p>
                <p className="text-muted-foreground">{createFor.entry.memo}</p>
                <p className="text-muted-foreground">
                  Será criado como <strong>{createFor.entry.amount >= 0 ? 'receita recebida' : 'despesa paga'}</strong> na conta selecionada,
                  com data de pagamento igual à do extrato.
                </p>
              </div>
              {duplicateIds.has(createFor.entry.id) && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  Já existe um lançamento com esta mesma descrição no período. Confirme se não é duplicidade antes de criar.
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-border p-2">
                  <p className="text-muted-foreground">Valor</p>
                  <p className="font-medium">{brl(Math.abs(createFor.entry.amount))}</p>
                </div>
                <div className="rounded-xl border border-border p-2">
                  <p className="text-muted-foreground">Data</p>
                  <p className="font-medium">{br(createFor.entry.posted_at)}</p>
                </div>
                <div className="rounded-xl border border-border p-2">
                  <p className="text-muted-foreground">Conta</p>
                  <p className="font-medium truncate">{account?.name ?? '—'}</p>
                </div>
              </div>
              {createFor.ruleLabel && (
                <p className="text-xs text-muted-foreground">
                  Campos pré-preenchidos pela regra de conciliação "<strong>{createFor.ruleLabel}</strong>". Revise e salve.
                </p>
              )}
              {(createFor.ruleAllocations?.length ?? 0) > 0 && (
                <p className="text-xs rounded-lg border border-border bg-muted/50 p-2">
                  {createForm.unit_id
                    ? 'Unidade escolhida: o rateio da regra não será aplicado.'
                    : `Será aplicado o rateio da regra entre ${createFor.ruleAllocations!.map(a => `${options.units.find(u => u.id === a.unit_id)?.name ?? '—'} ${a.value ?? ''}%`).join(', ')}. Escolha uma unidade só se quiser lançar tudo nela.`}
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={createForm.description ?? ''} onChange={ev => setCreateForm((f) => ({ ...f, description: ev.target.value }))} />
              </div>
              {([
                ['category_id', 'Categoria', options.categories.filter(c =>
                  createFor.entry.amount >= 0 ? c.type === 'receita' : c.type === 'despesa')],
                ['unit_id', 'Unidade', options.units],
                ['front_id', 'Frente de negócio', options.fronts],
                ['partner_id', 'Parceiro', options.partners],
              ] as const).map(([key, label, list]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Select
                    value={(createForm[key] as string | null | undefined) ?? NONE}
                    onValueChange={v => setCreateForm((f) => ({ ...f, [key]: v === NONE ? null : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>Nenhuma</SelectItem>
                      {list.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateFor(null)}>Cancelar</Button>
            <Button onClick={confirmCreate}>Criar e vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
