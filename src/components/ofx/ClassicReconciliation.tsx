import { useMemo, useState } from 'react';
import { Link2, Link2Off, EyeOff, CheckSquare, Square, RotateCcw, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EnrichedEntry } from '@/hooks/useOfxImport';
import { CandidateTransaction, suggestMatches } from '@/lib/ofxMatch';
import { cn } from '@/lib/utils';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

type LeftTab = 'nao' | 'similares' | 'relacionados';
type SortKey = 'data' | 'valor';
type SortDir = 'asc' | 'desc';

export interface ClassicReconciliationProps {
  accountName: string;
  from: string;
  to: string;
  enriched: EnrichedEntry[];
  candidates: CandidateTransaction[];
  accountId: string;
  busy?: boolean;
  onLink: (entryId: string, transactionId: string, note?: string) => void | Promise<unknown>;
  onUnlink: (entryId: string) => void | Promise<unknown>;
  onIgnore: (entryIds: string[], reason: string) => void | Promise<unknown>;
  onCreate: (entryId: string) => void;
  /** Criar lançamentos para várias linhas do extrato de uma vez. */
  onCreateMany?: (entryIds: string[]) => void;
}

/**
 * Conciliação em painéis: extrato à esquerda, lançamentos pendentes à direita
 * e o detalhamento do que já está relacionado embaixo — no formato dos ERPs
 * contábeis clássicos.
 */
export default function ClassicReconciliation({
  accountName, from, to, enriched, candidates, accountId, busy,
  onLink, onUnlink, onIgnore, onCreate, onCreateMany,
}: ClassicReconciliationProps) {
  const [tab, setTab] = useState<LeftTab>('nao');
  const [entrySel, setEntrySel] = useState<Set<string>>(new Set());
  const [txSel, setTxSel] = useState<Set<string>>(new Set());
  const [onlySimilar, setOnlySimilar] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('data');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  /** Lançamentos já amarrados a alguma linha do extrato não voltam à lista. */
  const linkedTxIds = useMemo(
    () => new Set(enriched.map(v => v.entry.transaction_id).filter(Boolean) as string[]),
    [enriched]
  );

  const leftRows = useMemo(() => {
    const base = enriched.filter(v => {
      if (tab === 'relacionados') return v.entry.status === 'vinculado';
      if (tab === 'similares') return v.entry.status === 'pendente' && v.suggestions.length > 0;
      return v.entry.status === 'pendente';
    });
    const q = search.trim().toLowerCase();
    return q ? base.filter(v => (v.entry.memo || '').toLowerCase().includes(q)) : base;
  }, [enriched, tab, search]);

  const selectedEntries = useMemo(
    () => enriched.filter(v => entrySel.has(v.entry.id)),
    [enriched, entrySel]
  );
  const singleEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;

  /** Painel direito: pendentes do período, opcionalmente só os similares à linha marcada. */
  const rightRows = useMemo(() => {
    const pool = candidates.filter(t => !linkedTxIds.has(t.id));
    const base = onlySimilar && singleEntry
      ? suggestMatches(singleEntry.entry, accountId, pool).map(s => s.transaction)
      : pool.slice(0, 300);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === 'valor') {
        return (Number(a.net_amount ?? a.amount) - Number(b.net_amount ?? b.amount)) * dir;
      }
      const da = a.payment_date || a.due_date || a.competence_date || '';
      const db = b.payment_date || b.due_date || b.competence_date || '';
      return da.localeCompare(db) * dir;
    });
  }, [candidates, linkedTxIds, onlySimilar, singleEntry, accountId, sortKey, sortDir]);

  const related = useMemo(
    () => enriched
      .filter(v => v.entry.status === 'vinculado' && v.entry.transaction_id)
      .filter(v => (entrySel.size === 0 ? true : entrySel.has(v.entry.id)))
      .map(v => ({ item: v, tx: candidates.find(t => t.id === v.entry.transaction_id) ?? null })),
    [enriched, entrySel, candidates]
  );

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  };

  const totalEntrySel = selectedEntries.reduce((s, v) => s + Number(v.entry.amount), 0);
  const totalTxSel = rightRows
    .filter(t => txSel.has(t.id))
    .reduce((s, t) => s + Number(t.net_amount ?? t.amount) * (t.type === 'despesa' ? -1 : 1), 0);
  const totalRelated = related.reduce((s, r) => s + Number(r.item.entry.amount), 0);

  const clearAll = () => { setEntrySel(new Set()); setTxSel(new Set()); };

  const linkSelected = async () => {
    if (selectedEntries.length !== 1 || txSel.size !== 1) return;
    const txId = [...txSel][0];
    await onLink(selectedEntries[0].entry.id, txId, 'Vinculado na conciliação em painéis');
    clearAll();
  };

  const ignoreSelected = async () => {
    if (selectedEntries.length === 0) return;
    const reason = window.prompt(
      'Justificativa para ignorar as linhas selecionadas (fica registrada):',
      'Transferência entre contas próprias'
    );
    if (reason === null) return;
    await onIgnore(selectedEntries.map(v => v.entry.id), reason || 'Ignorada na conciliação');
    clearAll();
  };

  const canLink = selectedEntries.length === 1 && txSel.size === 1 && !busy;

  /** Explica ao usuário o que falta marcar para habilitar o vínculo. */
  const linkHint = (() => {
    if (canLink || busy) return null;
    if (txSel.size >= 1 && selectedEntries.length === 0)
      return 'Marque também a linha do extrato bancário (painel à esquerda) para vincular.';
    if (txSel.size > 1) return 'Marque apenas 1 lançamento pendente para vincular.';
    if (selectedEntries.length > 1) return 'Marque apenas 1 linha do extrato para vincular.';
    if (selectedEntries.length === 1 && txSel.size === 0)
      return 'Marque o lançamento pendente correspondente para vincular, ou use "Criar lançamento".';
    return null;
  })();


  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {/* ------------------------------- Extrato ------------------------------- */}
        <Card className="shadow-card rounded-2xl border-border overflow-hidden">
          <CardHeader className="bg-muted/40 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-heading">Extrato bancário — {accountName}</CardTitle>
              <span className="text-[11px] text-muted-foreground">{br(from)} a {br(to)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ['nao', 'Não relacionados'],
                ['similares', 'Similares'],
                ['relacionados', 'Relacionados'],
              ] as [LeftTab, string][]).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={tab === key ? 'default' : 'outline'}
                  className="rounded-xl h-7 text-[11px]"
                  onClick={() => { setTab(key); clearAll(); }}
                >
                  {label}
                </Button>
              ))}
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar histórico"
                className="h-7 w-40 text-[11px] rounded-xl ml-auto"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2 text-left font-medium">Data</th>
                    <th className="p-2 text-left font-medium">C/D</th>
                    <th className="p-2 text-right font-medium">Valor</th>
                    <th className="p-2 text-left font-medium">Histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {leftRows.map(v => {
                    const sel = entrySel.has(v.entry.id);
                    return (
                      <tr
                        key={v.entry.id}
                        className={cn('border-t border-border cursor-pointer', sel ? 'bg-primary/10' : 'hover:bg-muted/40')}
                        onClick={() => toggle(entrySel, v.entry.id, setEntrySel)}
                      >
                        <td className="p-2" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={sel} onCheckedChange={() => toggle(entrySel, v.entry.id, setEntrySel)} />
                        </td>
                        <td className="p-2 whitespace-nowrap">{br(v.entry.posted_at)}</td>
                        <td className="p-2">{v.entry.amount >= 0 ? 'C' : 'D'}</td>
                        <td className={cn('p-2 text-right tabular-nums whitespace-nowrap',
                          v.entry.amount >= 0 ? 'text-secondary' : 'text-destructive')}>
                          {brl(Math.abs(v.entry.amount))}
                        </td>
                        <td className="p-2">
                          <span className="line-clamp-1">{v.entry.memo}</span>
                          {v.ruleLabel && (
                            <Badge variant="outline" className="mt-0.5 text-[10px]">regra: {v.ruleLabel}</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {leftRows.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Não há dados para mostrar</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2 text-[11px]">
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-[11px]"
                  onClick={() => setEntrySel(new Set(leftRows.map(v => v.entry.id)))}>
                  <CheckSquare className="h-3 w-3" /> Marcar todos
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-xl gap-1 text-[11px]" onClick={clearAll}>
                  <Square className="h-3 w-3" /> Desmarcar
                </Button>
              </div>
              <span className="text-muted-foreground">
                Total selecionado: <strong className="text-foreground tabular-nums">{brl(totalEntrySel)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* -------------------------- Lançamentos pendentes -------------------------- */}
        <div className="space-y-3">
          <Card className="shadow-card rounded-2xl border-border overflow-hidden">
            <CardHeader className="bg-muted/40 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-heading">Lançamentos pendentes</CardTitle>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Checkbox checked={onlySimilar} onCheckedChange={v => setOnlySimilar(!!v)} />
                  Exibir somente similares
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {singleEntry
                  ? `Sugestões para: ${singleEntry.entry.memo}`
                  : 'Marque uma linha do extrato para ver os lançamentos similares.'}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[240px] overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2"></th>
                      <th className="p-2 text-left font-medium">
                        <button type="button" className="hover:text-foreground" onClick={() => toggleSort('data')}>
                          Data{arrow('data')}
                        </button>
                      </th>
                      <th className="p-2 text-left font-medium">C/D</th>
                      <th className="p-2 text-right font-medium">
                        <button type="button" className="hover:text-foreground" onClick={() => toggleSort('valor')}>
                          Valor{arrow('valor')}
                        </button>
                      </th>
                      <th className="p-2 text-left font-medium">Histórico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rightRows.map(t => {
                      const sel = txSel.has(t.id);
                      return (
                        <tr
                          key={t.id}
                          className={cn('border-t border-border cursor-pointer', sel ? 'bg-primary/10' : 'hover:bg-muted/40')}
                          onClick={() => toggle(txSel, t.id, setTxSel)}
                        >
                          <td className="p-2" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={sel} onCheckedChange={() => toggle(txSel, t.id, setTxSel)} />
                          </td>
                          <td className="p-2 whitespace-nowrap">{br(t.payment_date || t.due_date || t.competence_date)}</td>
                          <td className="p-2">{t.type === 'receita' ? 'C' : 'D'}</td>
                          <td className={cn('p-2 text-right tabular-nums whitespace-nowrap',
                            t.type === 'receita' ? 'text-secondary' : 'text-destructive')}>
                            {brl(Number(t.net_amount ?? t.amount))}
                          </td>
                          <td className="p-2">
                            <span className="line-clamp-1">{t.description}</span>
                            {t.partner_name && <span className="text-muted-foreground"> · {t.partner_name}</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {rightRows.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Não há dados para mostrar</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-[11px]">
                <Button size="sm" className="h-7 rounded-xl gap-1 text-[11px]" disabled={!canLink} onClick={linkSelected}
                  title={canLink ? 'Vincular a linha do extrato ao lançamento marcado' : linkHint ?? ''}>
                  <Link2 className="h-3 w-3" /> Vincular lançamentos
                </Button>
                <Button size="sm" variant="outline" className="h-7 rounded-xl gap-1 text-[11px]"
                  disabled={selectedEntries.length === 0 || busy} onClick={ignoreSelected}>
                  <EyeOff className="h-3 w-3" /> Ignorar lançamentos
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-xl gap-1 text-[11px]"
                  disabled={selectedEntries.length === 0 || busy}
                  onClick={() => {
                    const ids = selectedEntries.map(v => v.entry.id);
                    if (ids.length === 1 && !onCreateMany) onCreate(ids[0]);
                    else if (onCreateMany) onCreateMany(ids);
                  }}>
                  <PlusCircle className="h-3 w-3" />
                  {selectedEntries.length > 1 ? `Criar ${selectedEntries.length} lançamentos` : 'Criar lançamento'}
                </Button>
                <span className="ml-auto text-muted-foreground">
                  Total selecionado: <strong className="text-foreground tabular-nums">{brl(totalTxSel)}</strong>
                </span>
                {linkHint && (
                  <p className="w-full text-[11px] text-amber-600 dark:text-amber-400">{linkHint}</p>
                )}
              </div>

            </CardContent>
          </Card>

          {/* ------------------- Detalhamento dos relacionados ------------------- */}
          <Card className="shadow-card rounded-2xl border-border overflow-hidden">
            <CardHeader className="bg-muted/40 py-3">
              <CardTitle className="text-sm font-heading">Detalhamento dos lançamentos relacionados</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[200px] overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left font-medium">Data</th>
                      <th className="p-2 text-right font-medium">Valor</th>
                      <th className="p-2 text-left font-medium">Histórico do extrato</th>
                      <th className="p-2 text-left font-medium">Lançamento</th>
                      <th className="w-24 p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.map(({ item, tx }) => (
                      <tr key={item.entry.id} className="border-t border-border">
                        <td className="p-2 whitespace-nowrap">{br(item.entry.posted_at)}</td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">{brl(Math.abs(item.entry.amount))}</td>
                        <td className="p-2"><span className="line-clamp-1">{item.entry.memo}</span></td>
                        <td className="p-2"><span className="line-clamp-1">{tx?.description ?? '—'}</span></td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="ghost" className="h-6 rounded-lg gap-1 text-[11px]"
                            disabled={busy} onClick={() => onUnlink(item.entry.id)}>
                            <Link2Off className="h-3 w-3" /> Desvincular
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {related.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Não há dados para mostrar</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-[11px]">
                <Button size="sm" variant="ghost" className="h-7 rounded-xl gap-1 text-[11px]" onClick={clearAll}>
                  <RotateCcw className="h-3 w-3" /> Recompor seleção
                </Button>
                <span className="text-muted-foreground">
                  Total relacionado: <strong className="text-foreground tabular-nums">{brl(totalRelated)}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
