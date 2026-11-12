import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOfxImport, EnrichedEntry, StatementEntry, TransactionPatch } from '@/hooks/useOfxImport';
import type { Tables } from '@/integrations/supabase/types';
import { pickAutoLinkable, normalizeText } from '@/lib/ofxMatch';
import { OptionList } from '@/components/ofx/OfxRulesPanel';
import DuplicatePairingPanel from '@/components/ofx/DuplicatePairingPanel';
import OfxPeriodReport from '@/components/ofx/OfxPeriodReport';
import BulkCreateDialog, { type BulkCreatePatch } from '@/components/ofx/BulkCreateDialog';
import { resolveOfxSplit, type OfxSplitRow } from '@/components/ofx/OfxAllocationEditor';
import ClassicReconciliation from '@/components/ofx/ClassicReconciliation';
import InternalTransfersPanel from '@/components/ofx/InternalTransfersPanel';
import PatternGroupsPanel from '@/components/ofx/PatternGroupsPanel';
import ClosingPanel from '@/components/ofx/ClosingPanel';
import QuickRuleDialog, { QuickRuleSeed } from '@/components/ofx/QuickRuleDialog';
import AutoPostDialog, { type AutoPostItem } from '@/components/ofx/AutoPostDialog';
import BankApiImportDialog from '@/components/ofx/BankApiImportDialog';
import { useAuth } from '@/contexts/AuthContext';
import { reconciledPercent, matchesEntrySearch } from '@/lib/entrySearch';
import { createdFromStatement } from '@/lib/ofxUnlink';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { buildRuleFromEntry } from '@/lib/ruleFromEntry';
import SuggestedRulesPanel from '@/components/ofx/SuggestedRulesPanel';
import OfxControlsCard from '@/components/ofx/OfxControlsCard';
import { LastImportAlert, StatsCards, PendingAlert, DescriptionLinkAlert } from '@/components/ofx/OfxSummary';
import StatementLinesCard from '@/components/ofx/StatementLinesCard';
import UnlinkDialog from '@/components/ofx/UnlinkDialog';
import DeleteAllLinksDialog from '@/components/ofx/DeleteAllLinksDialog';
import IgnoreEntriesDialog from '@/components/ofx/IgnoreEntriesDialog';
import CreateFromStatementDialog from '@/components/ofx/CreateFromStatementDialog';

import { parseOfx, readOfxFile } from '@/lib/ofx';
import { todayLocalISO } from '@/lib/utils';
import { firstDayOfMonth } from '@/components/ofx/ofxFormat';

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
  const [createSplit, setCreateSplit] = useState(false);
  const [createSplitRows, setCreateSplitRows] = useState<OfxSplitRow[]>([]);
  const manualSplit = resolveOfxSplit(createSplitRows);
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
  /** Importação da resposta da API de Saldo e Extrato do Bradesco. */
  const [apiOpen, setApiOpen] = useState(false);


  const {
    enriched, entries, candidates, rules, loading, importing, batchRunning, lastImport, stats,
    importFile, reprocessFile, reapplyRules, linkEntry, unlinkEntry, unlinkAndDeleteEntry, ignoreEntry, createFromEntry,
    linkMany, ignoreMany, createMany, createGrouped, autoLinkByDescription, unlinkMany, duplicateGroups, reload,
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
    setCreateSplit(false);
    setCreateSplitRows(item.ruleAllocations?.length
      ? item.ruleAllocations.map(a => ({ unit_id: a.unit_id, front_id: a.front_id, pct: String(a.value) }))
      : [{ unit_id: null, front_id: null, pct: '' }]);
    setCreateForm({
      description: item.entry.memo || '',
      category_id: item.ruleCategoryId ?? null,
      unit_id: item.ruleUnitId ?? null,
      front_id: item.ruleFrontId ?? null,
      partner_id: item.rulePartnerId ?? null,
    });
  };

  const confirmCreate = async (rulePattern: string | null = null) => {
    if (!createFor || batchRunning || (createSplit && !manualSplit.valid)) return;
    // Mantém o rateio da regra, a menos que o usuário tenha escolhido uma unidade na tela.
    const keepRuleSplit = !createForm.unit_id && (createFor.ruleAllocations?.length ?? 0) > 0;
    const ok = await createFromEntry(createFor.entry as StatementEntry, {
      ...createForm,
      unit_id: createSplit ? null : createForm.unit_id,
      front_id: createSplit ? null : createForm.front_id,
      useRuleAllocations: !createSplit && keepRuleSplit,
      allocations: createSplit ? manualSplit.allocations : keepRuleSplit ? createFor.ruleAllocations ?? undefined : undefined,
    } as TransactionPatch);
    if (!ok) return;
    const entry = createFor.entry;
    setCreateFor(null);
    if (!rulePattern) return;
    const rule = buildRuleFromEntry({
      pattern: rulePattern,
      amount: Number(entry.amount),
      accountId: accountId || null,
      categoryId: createForm.category_id ?? null,
      unitId: createSplit ? null : createForm.unit_id ?? null,
      frontId: createSplit ? null : createForm.front_id ?? null,
      partnerId: createForm.partner_id ?? null,
      allocations: createSplit ? manualSplit.allocations : keepRuleSplit ? createFor.ruleAllocations : null,
      userId: user?.id ?? null,
    });
    if (!rule) return;
    const { error } = await supabase.from('ofx_import_rules').insert(rule);
    if (error) {
      toast({ title: 'Lançamento criado, mas a regra não foi salva', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Regra salva', description: `"${rule.pattern}" será usada nos próximos extratos.` });
    await reapplyRules();
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

      <OfxControlsCard
        accounts={accounts}
        accountId={accountId}
        from={from}
        to={to}
        importing={importing}
        loading={loading}
        batchRunning={batchRunning}
        canAutoPost={canAutoPost}
        autoLinkableCount={descAutoLinkables.length}
        selectedCount={selectedItems.length}
        autoPostCount={autoPostItems.length}
        statusFilter={statusFilter}
        view={view}
        search={search}
        progress={progress}
        fileRef={fileRef}
        reprocessRef={reprocessRef}
        onAccountChange={setAccountId}
        onFromChange={setFrom}
        onToChange={setTo}
        onFile={handleFile}
        onReprocessFile={handleReprocessFile}
        onReapplyRules={reapplyRules}
        onRevalidate={revalidateImported}
        onOpenAutoPost={() => setAutoPostOpen(true)}
        onOpenApiImport={() => setApiOpen(true)}
        onStatusFilterChange={setStatusFilter}
        onSearchChange={setSearch}
      />

      <LastImportAlert lastImport={lastImport} />

      <StatsCards stats={stats} />

      <PendingAlert stats={stats} />

      <DescriptionLinkAlert
        autoLinkableCount={descAutoLinkables.length}
        divergenceCount={descDivergences.size}
        busy={batchRunning}
        onAutoLink={runAutoLinkByDescription}
      />


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
        <StatementLinesCard
          visible={visible}
          loading={loading}
          from={from}
          to={to}
          selected={selected}
          selectableIds={selectableIds}
          allVisibleSelected={allVisibleSelected}
          autoLinkableCount={autoLinkable.length}
          selectedCount={selectedItems.length}
          selectedWithSuggestionCount={selectedWithSuggestion.length}
          batchRunning={batchRunning}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onAutoLink={runAutoLink}
          onLinkSelected={runLinkSelected}
          onBulkCreate={() => openBulkCreate()}
          onIgnoreSelected={() => setIgnoreOpen(true)}
          onShowWholeYear={() => { setFrom(`${to.slice(0, 4)}-01-01`); setTo(todayLocalISO()); }}
          onLink={linkEntry}
          onCreate={openCreate}
          onIgnore={handleIgnore}
          onReopen={requestUnlink}
        />
      )}



      <UnlinkDialog
        target={deleteTarget}
        busy={batchRunning}
        onClose={() => setDeleteTarget(null)}
        onUnlinkOnly={confirmDeleteLink}
        onUnlinkAndDelete={confirmUnlinkAndDelete}
      />

      <DeleteAllLinksDialog
        open={deleteAllOpen}
        onOpenChange={setDeleteAllOpen}
        linkedCount={entries.filter(e => e.status === 'vinculado').length}
        busy={batchRunning}
        onConfirm={confirmDeleteAllLinks}
      />

      <IgnoreEntriesDialog
        open={ignoreOpen}
        onOpenChange={o => { setIgnoreOpen(o); if (!o) setIgnoreReason(''); }}
        items={selectedItems}
        reason={ignoreReason}
        onReasonChange={setIgnoreReason}
        busy={batchRunning}
        onConfirm={runIgnoreSelected}
      />

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

      <BankApiImportDialog
        open={apiOpen}
        onOpenChange={setApiOpen}
        accountId={accountId}
        accountName={accounts.find(a => a.id === accountId)?.name ?? ''}
        onImported={range => {
          void reload();
          if (range) widenPeriodTo({ statements: [{ transactions: [{ posted_at: range.from }, { posted_at: range.to }] }] });
        }}
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




      <CreateFromStatementDialog
        createFor={createFor}
        onClose={() => setCreateFor(null)}
        accountName={account?.name}
        duplicateIds={duplicateIds}
        options={options}
        form={createForm}
        onFormChange={setCreateForm}
        split={createSplit}
        onSplitChange={setCreateSplit}
        splitRows={createSplitRows}
        onSplitRowsChange={setCreateSplitRows}
        manualSplitValid={manualSplit.valid}
        busy={batchRunning}
        onConfirm={confirmCreate}
        canSaveRule={canAutoPost}
      />
    </div>
  );
}
