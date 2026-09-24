import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { resolveCategorySplit, type CategorySplitRule } from '@/lib/categorySplits';
import { parseOfx, readOfxFile, OfxStatement } from '@/lib/ofx';
import {
  applyRules,
  suggestMatches,
  CandidateTransaction,
  MatchSuggestion,
  OfxRule,
  StatementLine,
  matchByDescription,
  emptyDescriptionMatch,
  DescriptionMatch,
  pairDuplicates,
  DuplicatePairGroup,

} from '@/lib/ofxMatch';


/** Busca FITIDs já gravados em lotes (evita o limite de 1.000 do .in()). */
async function fetchExistingByFitid(accountId: string, fitids: string[], cols: string): Promise<any[]> {
  const unique = Array.from(new Set(fitids));
  const out: any[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await (supabase as any)
      .from('bank_statement_entries').select(cols)
      .eq('account_id', accountId).in('fitid', unique.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

export interface StatementEntry extends StatementLine {
  id: string;
  account_id: string;
  status: 'pendente' | 'vinculado' | 'ignorado';
  transaction_id: string | null;
  match_note: string | null;
  source_file: string | null;
  ignore_reason?: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
}


export interface ImportSummary {
  fileName: string;
  statements: OfxStatement[];
  inserted: number;
  duplicated: number;
  /** Diferença entre o saldo final do arquivo e o saldo declarado pelo banco. */
  ledgerBalance: number | null;
  ledgerBalanceDate: string | null;
  period: { start: string | null; end: string | null };
}

/** Uma linha do rateio (por unidade e/ou frente) definido na conciliação. */
export interface OfxAllocation {
  unit_id: string | null;
  front_id: string | null;
  allocation_type: 'percentual' | 'valor';
  value: number;
}

export interface EnrichedEntry {

  entry: StatementEntry;
  suggestions: MatchSuggestion[];
  ruleCategoryId: string | null;
  ruleUnitId: string | null;
  ruleFrontId: string | null;
  rulePartnerId: string | null;
  ruleLabel: string | null;
  /** Rateio sugerido pela regra (percentual por unidade/frente). */
  ruleAllocations: OfxAllocation[] | null;
  /** Lançamento existente com a mesma descrição, e checagem contra a regra. */
  descMatch: DescriptionMatch;
}

export function useOfxImport(accountId: string | null, from: string, to: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [candidates, setCandidates] = useState<CandidateTransaction[]>([]);
  const [rules, setRules] = useState<OfxRule[]>([]);
  const [splitRules, setSplitRules] = useState<CategorySplitRule[]>([]);
  const [accountUnitId, setAccountUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);

  const loadRules = useCallback(async () => {
    const [{ data }, { data: splits }] = await Promise.all([
      (supabase as any).from('ofx_import_rules').select('*').eq('active', true).order('priority'),
      (supabase as any).from('category_split_rules').select('*').eq('active', true),
    ]);
    setSplitRules((splits ?? []) as CategorySplitRule[]);
    setRules((data ?? []) as OfxRule[]);
  }, []);

  /** Sem rateio informado, aplica a divisão padrão da categoria (se houver). */
  const categorySplitFor = useCallback((categoryId: string | null, accId: string | null): OfxAllocation[] => {
    const lines = resolveCategorySplit(categoryId, accId, splitRules);
    return (lines ?? []).map(l => ({
      unit_id: l.unit_id, front_id: null, allocation_type: 'percentual' as const, value: l.percentage,
    }));
  }, [splitRules]);

  /** Unidade padrão da conta do extrato, usada pelas regras "unidade do extrato". */
  useEffect(() => {
    if (!accountId) { setAccountUnitId(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('accounts').select('default_unit_id').eq('id', accountId).maybeSingle();
      setAccountUnitId((data?.default_unit_id ?? null) as string | null);
    })();
  }, [accountId]);

  const ruleContext = useMemo(() => ({ accountId, accountUnitId }), [accountId, accountUnitId]);

  const load = useCallback(async () => {
    if (!accountId) { setEntries([]); setCandidates([]); return; }
    setLoading(true);

    // Janela ampliada em 7 dias para achar lançamentos lançados fora do dia.
    const pad = (iso: string, days: number) => {
      const d = new Date(`${iso}T12:00:00`);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const [entriesRes, txRes] = await Promise.all([
      (supabase as any)
        .from('bank_statement_entries')
        .select('*')
        .eq('account_id', accountId)
        .gte('posted_at', from)
        .lte('posted_at', to)
        .order('posted_at')
        .limit(2000),
      supabase
        .from('transactions')
        .select('id, type, description, amount, net_amount, tax_amount, competence_date, due_date, payment_date, status, account_id, category_id, unit_id, front_id, partner_id, partner:partners(name)')
        // Só lançamentos da conta do extrato (ou ainda sem conta definida).
        .or(`account_id.eq.${accountId},account_id.is.null`)
        .gte('competence_date', pad(from, -35))
        .lte('competence_date', pad(to, 35))
        .neq('status', 'cancelado')
        .limit(5000),

    ]);

    if (entriesRes.error) {
      toast({ title: 'Erro ao carregar extrato', description: entriesRes.error.message, variant: 'destructive' });
    }
    setEntries((entriesRes.data ?? []) as StatementEntry[]);
    setCandidates(((txRes.data ?? []) as any[]).map(t => ({
      ...t,
      partner_name: t.partner?.name ?? null,
    })) as CandidateTransaction[]);

    setLoading(false);
  }, [accountId, from, to, toast]);

  useEffect(() => { loadRules(); }, [loadRules]);
  useEffect(() => { load(); }, [load]);

  /** Lançamentos já vinculados a outra linha não devem ser sugeridos de novo. */
  const linkedTransactionIds = useMemo(
    () => new Set(entries.filter(e => e.transaction_id).map(e => e.transaction_id as string)),
    [entries]
  );

  const { enriched, duplicateGroups } = useMemo<{ enriched: EnrichedEntry[]; duplicateGroups: DuplicatePairGroup[] }>(() => {
    if (!accountId) return { enriched: [], duplicateGroups: [] };

    const list = entries.map(entry => {
      const pool = candidates.filter(t => !linkedTransactionIds.has(t.id) || t.id === entry.transaction_id);
      const outcome = applyRules(entry.memo || '', entry.amount, rules, ruleContext);
      const descMatch = entry.status === 'pendente'
        ? matchByDescription(entry.memo || '', entry.amount, entry.posted_at, pool, outcome)
        : emptyDescriptionMatch();

      return {
        entry,
        descMatch,
        suggestions: entry.status === 'pendente' ? suggestMatches(entry, accountId, pool) : [],
        ruleCategoryId: outcome?.category_id ?? null,
        ruleUnitId: outcome?.unit_id ?? null,
        ruleFrontId: outcome?.front_id ?? null,
        rulePartnerId: outcome?.partner_id ?? null,
        ruleLabel: outcome ? outcome.rule.pattern : null,
        ruleAllocations: outcome?.allocations
          ? outcome.allocations.map(a => ({
              unit_id: a.unit_id, front_id: a.front_id,
              allocation_type: 'percentual' as const, value: a.percentage,
            }))
          : null,
        outcome,
      };
    });

    // Reserva 1:1 quando o extrato traz linhas repetidas (mesma descrição, data e valor)
    // e existem lançamentos igualmente idênticos: cada linha fica com um deles.
    const { patches, groups } = pairDuplicates(
      list.map(i => ({
        key: i.entry.id,
        memo: i.entry.memo || '',
        posted_at: i.entry.posted_at,
        amount: i.entry.amount,
        descMatch: i.descMatch,
        outcome: i.outcome,
      })),
      linkedTransactionIds
    );

    return {
      enriched: list.map(({ outcome: _o, ...rest }) => ({
        ...rest,
        descMatch: patches.get(rest.entry.id) ?? rest.descMatch,
      })),
      duplicateGroups: groups,
    };
  }, [entries, candidates, rules, accountId, linkedTransactionIds, ruleContext]);


  /** Lê o arquivo e grava as linhas novas. Nenhum lançamento é criado aqui. */
  const importFile = useCallback(async (file: File, targetAccountId: string) => {
    setImporting(true);
    try {
      const text = await readOfxFile(file);
      const statements = parseOfx(text);
      const lines = statements.flatMap(s => s.transactions);

      const existing = await fetchExistingByFitid(targetAccountId, lines.map(l => l.fitid), 'fitid');
      const known = new Set(((existing ?? []) as { fitid: string }[]).map(r => r.fitid));

      const seen = new Set<string>();
      const rows = lines
        .filter(l => {
          if (known.has(l.fitid) || seen.has(l.fitid)) return false;
          seen.add(l.fitid);
          return true;
        })
        .map(l => ({
          account_id: targetAccountId,
          fitid: l.fitid,
          posted_at: l.posted_at,
          amount: l.amount,
          memo: l.memo,
          trn_type: l.trn_type,
          check_number: l.check_number ?? null,
          source_file: file.name,
          imported_by: user?.id ?? null,
          status: 'pendente',
        }));

      let inserted = 0;
      if (rows.length > 0) {
        const { error, count } = await (supabase as any)
          .from('bank_statement_entries')
          .upsert(rows, { onConflict: 'account_id,fitid', ignoreDuplicates: true, count: 'exact' });
        if (error) throw error;
        inserted = count ?? rows.length;
      }

      const last = statements[statements.length - 1];
      const summary: ImportSummary = {
        fileName: file.name,
        statements,
        inserted,
        duplicated: lines.length - rows.length,
        ledgerBalance: last?.ledger_balance ?? null,
        ledgerBalanceDate: last?.ledger_balance_date ?? null,
        period: { start: statements[0]?.start_date ?? null, end: last?.end_date ?? null },
      };
      setLastImport(summary);
      toast({
        title: `${inserted} linha(s) de extrato importada(s)`,
        description: summary.duplicated
          ? `${summary.duplicated} linha(s) já existiam e foram ignoradas.`
          : undefined,
      });
      await load();
      return summary;
    } catch (err: any) {
      toast({ title: 'Erro ao importar OFX', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setImporting(false);
    }
  }, [load, toast, user]);

  /**
   * Relê o MESMO arquivo OFX (ou outro) sem reiniciar a importação: as linhas
   * já gravadas são atualizadas (memo/valor/tipo) e as novas são inseridas.
   * Em seguida recarrega as regras de conciliação para reaplicá-las às linhas
   * pendentes. Nenhuma decisão já tomada (vinculado/ignorado) é desfeita.
   */
  const reprocessFile = useCallback(async (file: File, targetAccountId: string) => {
    setImporting(true);
    try {
      const text = await readOfxFile(file);
      const statements = parseOfx(text);
      const lines = statements.flatMap(s => s.transactions);

      const existing = await fetchExistingByFitid(targetAccountId, lines.map(l => l.fitid), 'id, fitid, status');
      const byFitid = new Map(
        ((existing ?? []) as { id: string; fitid: string; status: string }[]).map(r => [r.fitid, r])
      );

      const seen = new Set<string>();
      const newRows: any[] = [];
      let refreshed = 0;

      for (const l of lines) {
        if (seen.has(l.fitid)) continue;
        seen.add(l.fitid);
        const found = byFitid.get(l.fitid);
        if (found) {
          if (found.status === 'pendente') {
            await (supabase as any).from('bank_statement_entries').update({
              posted_at: l.posted_at,
              amount: l.amount,
              memo: l.memo,
              trn_type: l.trn_type,
              check_number: l.check_number ?? null,
              source_file: file.name,
            }).eq('id', found.id);
            refreshed++;
          }
          continue;
        }
        newRows.push({
          account_id: targetAccountId,
          fitid: l.fitid,
          posted_at: l.posted_at,
          amount: l.amount,
          memo: l.memo,
          trn_type: l.trn_type,
          check_number: l.check_number ?? null,
          source_file: file.name,
          imported_by: user?.id ?? null,
          status: 'pendente',
        });
      }

      if (newRows.length > 0) {
        const { error } = await (supabase as any).from('bank_statement_entries').upsert(newRows, { onConflict: 'account_id,fitid', ignoreDuplicates: true });
        if (error) throw error;
      }

      await loadRules();
      await load();
      toast({
        title: 'Arquivo reprocessado',
        description: `${refreshed} linha(s) pendente(s) atualizadas e ${newRows.length} nova(s). Regras de conciliação reaplicadas.`,
      });
      return { refreshed, inserted: newRows.length, statements };
    } catch (err: any) {
      toast({ title: 'Erro ao reprocessar OFX', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setImporting(false);
    }
  }, [load, loadRules, toast, user]);

  /** Recarrega as regras e as linhas para reaplicar a classificação sugerida. */
  const reapplyRules = useCallback(async () => {
    await loadRules();
    await load();
    toast({ title: 'Regras de conciliação reaplicadas às linhas pendentes' });
  }, [loadRules, load, toast]);

  /** Campos de rastreabilidade gravados em toda decisão (individual ou em lote). */
  const decisionStamp = useCallback(() => ({
    decided_by: user?.id ?? null,
    decided_at: new Date().toISOString(),
  }), [user]);

  const updateEntry = useCallback(async (entryId: string, patch: Record<string, unknown>) => {
    const { error } = await (supabase as any)
      .from('bank_statement_entries')
      .update(patch)
      .eq('id', entryId);
    return error?.message ?? null;
  }, []);

  const linkEntry = useCallback(async (entryId: string, transactionId: string, note?: string) => {
    const err = await updateEntry(entryId, {
      transaction_id: transactionId, status: 'vinculado', match_note: note ?? null, ...decisionStamp(),
    });
    if (err) { toast({ title: 'Erro ao vincular', description: err, variant: 'destructive' }); return false; }
    await load();
    return true;
  }, [updateEntry, decisionStamp, load, toast]);

  const unlinkEntry = useCallback(async (entryId: string) => {
    const err = await updateEntry(entryId, {
      transaction_id: null, status: 'pendente', match_note: null, ignore_reason: null, ...decisionStamp(),
    });
    if (err) { toast({ title: 'Erro ao desvincular', description: err, variant: 'destructive' }); return false; }
    await load();
    return true;
  }, [updateEntry, decisionStamp, load, toast]);

  const ignoreEntry = useCallback(async (entryId: string, note: string) => {
    const err = await updateEntry(entryId, {
      status: 'ignorado', match_note: note, ignore_reason: note, ...decisionStamp(),
    });
    if (err) { toast({ title: 'Erro ao ignorar', description: err, variant: 'destructive' }); return false; }
    await load();
    return true;
  }, [updateEntry, decisionStamp, load, toast]);

/** Rateio opcional aplicado ao lançamento criado pela conciliação. */
  // (tipo exportado abaixo do hook)

  const insertAllocations = useCallback(async (
    transactionId: string,
    allocations: OfxAllocation[] | undefined,
  ) => {
    if (!allocations?.length) return;
    await (supabase as any).from('transaction_allocations').insert(
      allocations.map(a => ({
        transaction_id: transactionId,
        unit_id: a.unit_id ?? null,
        front_id: a.front_id ?? null,
        allocation_type: a.allocation_type,
        percentage: a.allocation_type === 'percentual' ? a.value : null,
        amount: a.allocation_type === 'valor' ? a.value : null,
      })),
    );
  }, []);

  /** Cria o lançamento correspondente a uma linha. Não recarrega nem vincula. */
  const insertTransactionFor = useCallback(async (
    entry: StatementEntry,
    patch: {
      description: string;
      category_id: string | null;
      unit_id: string | null;
      front_id: string | null;
      partner_id: string | null;
      /** Conta do lançamento; por padrão, a conta do extrato. */
      account_id?: string | null;
      /** Forma de pagamento (sugerida pelo texto do extrato). */
      payment_method?: string | null;
      /** Rateio por unidade/frente. */
      allocations?: OfxAllocation[];
      /** Se false, não aplica o rateio da regra (usuário escolheu a unidade manualmente). */
      useRuleAllocations?: boolean;
    }
  ): Promise<{ id: string } | { error: string }> => {
    const amount = Math.abs(entry.amount);
    const type = entry.amount >= 0 ? 'receita' : 'despesa';
    // Sem rateio informado na tela, vale o rateio definido na regra do extrato.
    const outcome = applyRules(entry.memo || '', entry.amount, rules, ruleContext);
    const allocations = patch.allocations?.length
      ? patch.allocations
      : patch.useRuleAllocations === false ? [] : (outcome?.allocations ?? []).map(a => ({
          unit_id: a.unit_id, front_id: a.front_id,
          allocation_type: 'percentual' as const, value: a.percentage,
        }));
    const { data: created, error } = await supabase
      .from('transactions')
      .insert({
        type: type as any,
        description: patch.description || entry.memo || 'Lançamento do extrato',
        amount,
        tax_amount: 0,
        net_amount: amount,
        competence_date: entry.posted_at,
        due_date: entry.posted_at,
        payment_date: entry.posted_at,
        status: (type === 'receita' ? 'recebido' : 'pago') as any,
        account_id: patch.account_id ?? entry.account_id,
        category_id: patch.category_id,
        unit_id: patch.unit_id,
        front_id: patch.front_id,
        partner_id: patch.partner_id,
        payment_method: (patch.payment_method || null) as any,
        notes: `Importado do extrato OFX (${entry.source_file ?? 'arquivo'}) — FITID ${entry.fitid}`,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (error || !created) return { error: error?.message ?? 'Falha ao criar lançamento' };
    await insertAllocations(created.id, allocations);
    return { id: created.id };
  }, [user, insertAllocations, rules, ruleContext]);


  /** Cria o lançamento a partir da linha do extrato e já o vincula. */
  const createFromEntry = useCallback(async (
    entry: StatementEntry,
    patch: Parameters<typeof insertTransactionFor>[1]
  ) => {
    const res = await insertTransactionFor(entry, patch);
    if ('error' in res) {
      toast({ title: 'Erro ao criar lançamento', description: res.error, variant: 'destructive' });
      return false;
    }
    return linkEntry(entry.id, res.id, 'Criado a partir do extrato');
  }, [insertTransactionFor, linkEntry, toast]);

  // -------------------------------------------------------------------------
  // Ações em lote — um único recarregamento no fim, com resumo de erros.
  // -------------------------------------------------------------------------

  const [batchRunning, setBatchRunning] = useState(false);

  const runBatch = useCallback(async (
    label: string,
    tasks: (() => Promise<string | null>)[]
  ) => {
    if (tasks.length === 0) return { ok: 0, failed: 0 };
    setBatchRunning(true);
    let ok = 0;
    const failures: string[] = [];
    for (const task of tasks) {
      const err = await task();
      if (err) failures.push(err); else ok++;
    }
    await load();
    setBatchRunning(false);
    toast({
      title: `${label}: ${ok} linha(s)`,
      description: failures.length ? `${failures.length} falha(s): ${failures[0]}` : undefined,
      variant: failures.length ? 'destructive' : undefined,
    });
    return { ok, failed: failures.length };
  }, [load, toast]);

  /** Vincula várias linhas de uma vez aos lançamentos indicados. */
  const linkMany = useCallback((pairs: { entryId: string; transactionId: string; note?: string }[]) =>
    runBatch('Vinculadas', pairs.map(p => () => updateEntry(p.entryId, {
      transaction_id: p.transactionId, status: 'vinculado', match_note: p.note ?? null, ...decisionStamp(),
    })))
  , [runBatch, updateEntry, decisionStamp]);

  /**
   * Ignora várias linhas com UMA justificativa obrigatória, gravada em cada
   * linha (ignore_reason) junto com autor e data — a auditoria é preservada.
   */
  const ignoreMany = useCallback((entryIds: string[], reason: string) => {
    const note = reason.trim();
    if (!note) {
      toast({ title: 'Informe a justificativa para ignorar', variant: 'destructive' });
      return Promise.resolve({ ok: 0, failed: entryIds.length });
    }
    return runBatch('Ignoradas', entryIds.map(id => () => updateEntry(id, {
      status: 'ignorado', match_note: note, ignore_reason: note, ...decisionStamp(),
    })));
  }, [runBatch, updateEntry, decisionStamp, toast]);

  /** Cria e vincula um lançamento para cada linha selecionada. */
  const createMany = useCallback((
    items: { entry: StatementEntry; patch: Parameters<typeof insertTransactionFor>[1] }[]
  ) => runBatch('Lançamentos criados', items.map(item => async () => {
    const res = await insertTransactionFor(item.entry, item.patch);
    if ('error' in res) return res.error;
    return updateEntry(item.entry.id, {
      transaction_id: res.id, status: 'vinculado',
      match_note: 'Criado a partir do extrato (lote)', ...decisionStamp(),
    });
  })), [runBatch, insertTransactionFor, updateEntry, decisionStamp]);

  /**
   * Cria UM único lançamento com o valor total das linhas selecionadas e
   * vincula todas elas a esse lançamento (agrupamento do extrato).
   */
  const createGrouped = useCallback(async (
    items: StatementEntry[],
    patch: Parameters<typeof insertTransactionFor>[1] & { competence_date?: string }
  ) => {
    if (items.length === 0) return { ok: 0, failed: 0 };
    setBatchRunning(true);
    const total = items.reduce((s, e) => s + Number(e.amount), 0);
    const amount = Math.abs(total);
    const type = total >= 0 ? 'receita' : 'despesa';
    const date = patch.competence_date
      ?? items.map(e => e.posted_at).sort()[items.length - 1];
    const files = Array.from(new Set(items.map(e => e.source_file).filter(Boolean)));

    const { data: created, error } = await supabase
      .from('transactions')
      .insert({
        type: type as any,
        description: patch.description || 'Lançamento agrupado do extrato',
        amount,
        tax_amount: 0,
        net_amount: amount,
        competence_date: date,
        due_date: date,
        payment_date: date,
        status: (type === 'receita' ? 'recebido' : 'pago') as any,
        account_id: patch.account_id ?? items[0].account_id,
        category_id: patch.category_id,
        unit_id: patch.unit_id,
        front_id: patch.front_id,
        partner_id: patch.partner_id,
        payment_method: (patch.payment_method || null) as any,
        notes: `Agrupamento de ${items.length} linha(s) do extrato OFX (${files.join(', ') || 'arquivo'}) — FITIDs ${items.map(e => e.fitid).join(', ')}`,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();


    if (error || !created) {
      setBatchRunning(false);
      toast({ title: 'Erro ao criar lançamento agrupado', description: error?.message, variant: 'destructive' });
      return { ok: 0, failed: items.length };
    }

    await insertAllocations(created.id, patch.allocations);



    let ok = 0;
    const failures: string[] = [];
    for (const e of items) {
      const err = await updateEntry(e.id, {
        transaction_id: created.id,
        status: 'vinculado',
        match_note: `Criado a partir do extrato (agrupado: ${items.length} linhas)`,
        ...decisionStamp(),
      });
      if (err) failures.push(err); else ok++;
    }
    await load();
    setBatchRunning(false);
    toast({
      title: `Lançamento agrupado criado (${ok} linha(s) vinculadas)`,
      description: failures.length ? `${failures.length} falha(s): ${failures[0]}` : undefined,
      variant: failures.length ? 'destructive' : undefined,
    });
    return { ok, failed: failures.length };
  }, [updateEntry, decisionStamp, load, toast, user, insertAllocations]);

  /**
   * Exclui a conciliação de várias linhas: o vínculo é desfeito e a linha volta
   * para pendente. O lançamento em si não é alterado nem apagado.
   */
  const unlinkMany = useCallback((entryIds: string[]) =>
    runBatch('Conciliações excluídas', entryIds.map(id => () => updateEntry(id, {
      transaction_id: null, status: 'pendente', match_note: null, ignore_reason: null, ...decisionStamp(),
    })))
  , [runBatch, updateEntry, decisionStamp]);

  /**
   * Vincula automaticamente as linhas cujo memo é idêntico à descrição de um
   * único lançamento existente e cujas categoria/unidade/frente/parceiro batem
   * com a regra de conciliação. Apenas vincula — não concilia nem altera o
   * lançamento.
   */
  const autoLinkByDescription = useCallback((
    items: { entryId: string; transactionId: string }[]
  ) => runBatch('Vinculadas por descrição', items.map(i => () => updateEntry(i.entryId, {
    transaction_id: i.transactionId,
    status: 'vinculado',
    match_note: 'Vínculo automático por descrição idêntica, validado pelas regras de conciliação',
    ...decisionStamp(),
  }))), [runBatch, updateEntry, decisionStamp]);

  const stats = useMemo(() => {
    const pend = entries.filter(e => e.status === 'pendente');
    const sum = (arr: StatementEntry[]) => arr.reduce((s, e) => s + Number(e.amount), 0);
    return {
      total: entries.length,
      pendentes: pend.length,
      vinculados: entries.filter(e => e.status === 'vinculado').length,
      ignorados: entries.filter(e => e.status === 'ignorado').length,
      entradas: sum(entries.filter(e => e.amount > 0)),
      saidas: sum(entries.filter(e => e.amount < 0)),
      pendenteValor: sum(pend),
    };
  }, [entries]);

  return {
    enriched, duplicateGroups, entries, candidates, rules, loading, importing, batchRunning, lastImport, stats,
    importFile, reprocessFile, reapplyRules, linkEntry, unlinkEntry, ignoreEntry, createFromEntry,
    linkMany, ignoreMany, createMany, createGrouped, autoLinkByDescription, unlinkMany,
    reload: load, reloadRules: loadRules,
  };
}

