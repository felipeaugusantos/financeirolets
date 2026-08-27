import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { parseOfx, readOfxFile, OfxStatement } from '@/lib/ofx';
import {
  applyRules,
  suggestMatches,
  CandidateTransaction,
  MatchSuggestion,
  OfxRule,
  StatementLine,
} from '@/lib/ofxMatch';

export interface StatementEntry extends StatementLine {
  id: string;
  account_id: string;
  status: 'pendente' | 'vinculado' | 'ignorado';
  transaction_id: string | null;
  match_note: string | null;
  source_file: string | null;
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

export interface EnrichedEntry {
  entry: StatementEntry;
  suggestions: MatchSuggestion[];
  ruleCategoryId: string | null;
  ruleUnitId: string | null;
  ruleFrontId: string | null;
  rulePartnerId: string | null;
  ruleLabel: string | null;
}

export function useOfxImport(accountId: string | null, from: string, to: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [candidates, setCandidates] = useState<CandidateTransaction[]>([]);
  const [rules, setRules] = useState<OfxRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);

  const loadRules = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('ofx_import_rules')
      .select('*')
      .eq('active', true)
      .order('priority');
    setRules((data ?? []) as OfxRule[]);
  }, []);

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
        .select('id, type, description, amount, net_amount, competence_date, due_date, payment_date, status, account_id, category_id, unit_id')
        .gte('competence_date', pad(from, -35))
        .lte('competence_date', pad(to, 35))
        .neq('status', 'cancelado')
        .limit(5000),
    ]);

    if (entriesRes.error) {
      toast({ title: 'Erro ao carregar extrato', description: entriesRes.error.message, variant: 'destructive' });
    }
    setEntries((entriesRes.data ?? []) as StatementEntry[]);
    setCandidates((txRes.data ?? []) as unknown as CandidateTransaction[]);
    setLoading(false);
  }, [accountId, from, to, toast]);

  useEffect(() => { loadRules(); }, [loadRules]);
  useEffect(() => { load(); }, [load]);

  /** Lançamentos já vinculados a outra linha não devem ser sugeridos de novo. */
  const linkedTransactionIds = useMemo(
    () => new Set(entries.filter(e => e.transaction_id).map(e => e.transaction_id as string)),
    [entries]
  );

  const enriched = useMemo<EnrichedEntry[]>(() => {
    if (!accountId) return [];
    return entries.map(entry => {
      const pool = candidates.filter(t => !linkedTransactionIds.has(t.id) || t.id === entry.transaction_id);
      const outcome = applyRules(entry.memo || '', entry.amount, rules);
      return {
        entry,
        suggestions: entry.status === 'pendente' ? suggestMatches(entry, accountId, pool) : [],
        ruleCategoryId: outcome?.category_id ?? null,
        ruleUnitId: outcome?.unit_id ?? null,
        ruleFrontId: outcome?.front_id ?? null,
        rulePartnerId: outcome?.partner_id ?? null,
        ruleLabel: outcome ? outcome.rule.pattern : null,
      };
    });
  }, [entries, candidates, rules, accountId, linkedTransactionIds]);

  /** Lê o arquivo e grava as linhas novas. Nenhum lançamento é criado aqui. */
  const importFile = useCallback(async (file: File, targetAccountId: string) => {
    setImporting(true);
    try {
      const text = await readOfxFile(file);
      const statements = parseOfx(text);
      const lines = statements.flatMap(s => s.transactions);

      const { data: existing } = await (supabase as any)
        .from('bank_statement_entries')
        .select('fitid')
        .eq('account_id', targetAccountId)
        .in('fitid', lines.map(l => l.fitid).slice(0, 1000));
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
          .insert(rows, { count: 'exact' });
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

  const linkEntry = useCallback(async (entryId: string, transactionId: string, note?: string) => {
    const { error } = await (supabase as any)
      .from('bank_statement_entries')
      .update({ transaction_id: transactionId, status: 'vinculado', match_note: note ?? null })
      .eq('id', entryId);
    if (error) { toast({ title: 'Erro ao vincular', description: error.message, variant: 'destructive' }); return false; }
    await load();
    return true;
  }, [load, toast]);

  const unlinkEntry = useCallback(async (entryId: string) => {
    const { error } = await (supabase as any)
      .from('bank_statement_entries')
      .update({ transaction_id: null, status: 'pendente', match_note: null })
      .eq('id', entryId);
    if (error) { toast({ title: 'Erro ao desvincular', description: error.message, variant: 'destructive' }); return false; }
    await load();
    return true;
  }, [load, toast]);

  const ignoreEntry = useCallback(async (entryId: string, note: string) => {
    const { error } = await (supabase as any)
      .from('bank_statement_entries')
      .update({ status: 'ignorado', match_note: note })
      .eq('id', entryId);
    if (error) { toast({ title: 'Erro ao ignorar', description: error.message, variant: 'destructive' }); return false; }
    await load();
    return true;
  }, [load, toast]);

  /** Cria o lançamento a partir da linha do extrato e já o vincula. */
  const createFromEntry = useCallback(async (
    entry: StatementEntry,
    patch: {
      description: string;
      category_id: string | null;
      unit_id: string | null;
      front_id: string | null;
      partner_id: string | null;
    }
  ) => {
    const amount = Math.abs(entry.amount);
    const type = entry.amount >= 0 ? 'receita' : 'despesa';
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
        account_id: entry.account_id,
        category_id: patch.category_id,
        unit_id: patch.unit_id,
        front_id: patch.front_id,
        partner_id: patch.partner_id,
        notes: `Importado do extrato OFX (${entry.source_file ?? 'arquivo'}) — FITID ${entry.fitid}`,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();

    if (error || !created) {
      toast({ title: 'Erro ao criar lançamento', description: error?.message, variant: 'destructive' });
      return false;
    }
    return linkEntry(entry.id, created.id, 'Criado a partir do extrato');
  }, [linkEntry, toast, user]);

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
    enriched, entries, rules, loading, importing, lastImport, stats,
    importFile, linkEntry, unlinkEntry, ignoreEntry, createFromEntry, reload: load, reloadRules: loadRules,
  };
}
