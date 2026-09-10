import { useMemo, useRef, useState } from 'react';
import { FileDown, FileText, BarChart3, PlusCircle, ExternalLink, Link2Off, Sparkles, AlertTriangle, GitCompareArrows, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { StatementEntry } from '@/hooks/useOfxImport';
import { exportToCsv, csvDate, csvNumber } from '@/lib/exportCsv';
import { exportToPdf } from '@/lib/exportPdf';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

/** Linhas criadas a partir do extrato carregam esta marca no match_note. */
const CREATED_MARK = /criad[ao]/i;

interface Props {
  entries: StatementEntry[];
  accountName: string;
  from: string;
  to: string;
  /** Ids de linhas pendentes selecionadas para ação em lote. */
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  onCreate?: (id: string) => void;
  onCreateSelected?: () => void;
  /** Ids cuja descrição já existe em lançamentos do período. */
  duplicates?: Set<string>;
  /** Ids prontos para vínculo automático por descrição idêntica. */
  autoLinkables?: Set<string>;
  /** Ids com descrição igual, porém divergentes da regra (campos divergentes). */
  divergences?: Map<string, string[]>;
  /** Ids apenas parecidos (descrição igual, mas data e/ou valor diferentes). */
  similars?: Map<string, string[]>;
  /** Abrir o lançamento vinculado a uma linha. */
  onView?: (entry: StatementEntry) => void;
  /** Desfazer o vínculo / estornar a decisão da linha. */
  onUnlink?: (entry: StatementEntry) => void;
  /** Excluir a conciliação da linha (volta para pendente, com confirmação). */
  onDeleteLink?: (entry: StatementEntry) => void;
  /** Excluir todas as conciliações do período. */
  onDeleteAllLinks?: () => void;
  busy?: boolean;
}

export default function OfxPeriodReport({
  entries, accountName, from, to,
  selected, onToggle, onToggleAll, onCreate, onCreateSelected, duplicates,
  autoLinkables, divergences, similars, onView, onUnlink, onDeleteLink, onDeleteAllLinks, busy,

}: Props) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const interactive = !!onCreate;


  const data = useMemo(() => {
    const sum = (arr: StatementEntry[]) => arr.reduce((s, e) => s + Number(e.amount), 0);
    const vinculados = entries.filter(e => e.status === 'vinculado');
    const criados = vinculados.filter(e => CREATED_MARK.test(e.match_note ?? ''));
    const apenasVinculados = vinculados.filter(e => !CREATED_MARK.test(e.match_note ?? ''));
    const ignorados = entries.filter(e => e.status === 'ignorado');
    const pendentes = entries
      .filter(e => e.status === 'pendente')
      .sort((a, b) => a.posted_at.localeCompare(b.posted_at) || Math.abs(b.amount) - Math.abs(a.amount));

    const decididas = entries.length - pendentes.length;
    const arquivos = Array.from(new Set(entries.map(e => e.source_file).filter(Boolean))) as string[];

    return {
      total: entries.length,
      arquivos,
      vinculados: apenasVinculados,
      criados,
      ignorados,
      pendentes,
      cobertura: entries.length ? decididas / entries.length : 0,
      valorPendente: sum(pendentes),
      entradasPendentes: sum(pendentes.filter(e => e.amount > 0)),
      saidasPendentes: sum(pendentes.filter(e => e.amount < 0)),
    };
  }, [entries]);

  const pendingIds = useMemo(() => data.pendentes.map(e => e.id), [data.pendentes]);
  const selectedCount = pendingIds.filter(id => selected?.has(id)).length;
  const allSelected = pendingIds.length > 0 && selectedCount === pendingIds.length;

  const periodo = `${br(from)} a ${br(to)}`;
  const fileBase = `conciliacao-ofx_${accountName.replace(/\W+/g, '-').toLowerCase()}_${from}_${to}`;

  const exportCsv = () => {
    if (data.pendentes.length === 0) {
      toast({ title: 'Nenhuma linha pendente no período' });
      return;
    }
    exportToCsv(
      `${fileBase}_pendentes.csv`,
      ['Data', 'Conta', 'Descrição (memo)', 'Tipo', 'FITID', 'Arquivo', 'Valor'],
      data.pendentes.map(e => [
        csvDate(e.posted_at),
        accountName,
        e.memo ?? '',
        e.trn_type ?? '',
        e.fitid,
        e.source_file ?? '',
        csvNumber(Number(e.amount)),
      ])
    );
  };

  const exportPdf = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      await exportToPdf({
        title: 'Conciliação bancária (OFX)',
        subtitle: `${accountName} · ${periodo}`,
        filename: `${fileBase}.pdf`,
        element: printRef.current,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar PDF', description: err?.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const kpis = [
    { label: 'Importadas', value: String(data.total), hint: data.arquivos.length ? `${data.arquivos.length} arquivo(s)` : '—' },
    { label: 'Vinculadas', value: String(data.vinculados.length), hint: 'a lançamentos existentes' },
    { label: 'Criadas', value: String(data.criados.length), hint: 'novo lançamento pelo extrato' },
    { label: 'Ignoradas', value: String(data.ignorados.length), hint: 'com justificativa' },
  ];

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Relatório do período
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-8" onClick={exportCsv}>
            <FileDown className="h-3.5 w-3.5" /> Pendentes (CSV)
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-8" onClick={exportPdf} disabled={exporting}>
            <FileText className="h-3.5 w-3.5" /> {exporting ? 'Gerando...' : 'Relatório (PDF)'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div ref={printRef} className="space-y-4 bg-background p-1">
          <p className="text-xs text-muted-foreground">
            {accountName} · período {periodo}
            {data.arquivos.length > 0 && ` · arquivos: ${data.arquivos.join(', ')}`}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="rounded-2xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="font-heading text-lg font-bold">{k.value}</p>
                <p className="text-[11px] text-muted-foreground">{k.hint}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Taxa de cobertura</p>
              <Badge variant="outline" className="text-xs">
                {pct(data.cobertura)} · {data.total - data.pendentes.length} de {data.total} linhas decididas
              </Badge>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.round(data.cobertura * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {data.pendentes.length} linha(s) pendente(s), saldo líquido de {brl(data.valorPendente)}
              {' '}(entradas {brl(data.entradasPendentes)} · saídas {brl(Math.abs(data.saidasPendentes))}).
              A conciliação só é considerada fechada com 100% de cobertura.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Linhas pendentes ({data.pendentes.length})</p>
              {interactive && selectedCount > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">{selectedCount} selecionada(s)</Badge>
                  <Button size="sm" className="gap-1.5 rounded-xl h-8" disabled={busy} onClick={onCreateSelected}>
                    <PlusCircle className="h-3.5 w-3.5" /> Criar lançamentos
                  </Button>
                </div>
              )}
            </div>
            {data.pendentes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma pendência — período conciliado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      {interactive && (
                        <th className="py-1.5 pr-2 font-medium w-8">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => onToggleAll?.(pendingIds)}
                            aria-label="Selecionar todas as linhas pendentes"
                          />
                        </th>
                      )}
                      <th className="py-1.5 pr-2 font-medium">Data</th>
                      <th className="py-1.5 pr-2 font-medium">Descrição</th>
                      <th className="py-1.5 pr-2 font-medium">Tipo</th>
                      <th className="py-1.5 pr-2 font-medium">FITID</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Valor</th>
                      {interactive && <th className="py-1.5 text-right font-medium">Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendentes.map(e => (
                      <tr key={e.id} className="border-b border-border/50">
                        {interactive && (
                          <td className="py-1.5 pr-2">
                            <Checkbox
                              checked={selected?.has(e.id) ?? false}
                              onCheckedChange={() => onToggle?.(e.id)}
                              aria-label={`Selecionar linha de ${br(e.posted_at)}`}
                            />
                          </td>
                        )}
                        <td className="py-1.5 pr-2 whitespace-nowrap">{br(e.posted_at)}</td>
                        <td className="py-1.5 pr-2 max-w-[320px] truncate">
                          {e.memo || '(sem descrição)'}
                          {duplicates?.has(e.id) && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-destructive/40 text-destructive">
                              já existe em lançamentos
                            </Badge>
                          )}
                          {autoLinkables?.has(e.id) && (
                            <Badge variant="outline" className="ml-2 text-[10px] border-secondary/40 text-secondary gap-1">
                              <Sparkles className="h-3 w-3" /> pronto p/ vínculo automático
                            </Badge>
                          )}
                          {divergences?.get(e.id)?.length ? (
                            <Badge variant="outline" className="ml-2 text-[10px] border-accent/40 text-accent gap-1">
                              <AlertTriangle className="h-3 w-3" /> diverge da regra: {divergences.get(e.id)!.join(', ')}
                            </Badge>
                          ) : null}
                          {similars?.has(e.id) && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] border-accent/40 text-accent gap-1"
                              title={`Similar — confira antes de vincular (difere em: ${similars.get(e.id)!.join(', ') || 'detalhes'})`}
                            >
                              <GitCompareArrows className="h-3 w-3" /> similar
                              {similars.get(e.id)!.length ? ` (difere em ${similars.get(e.id)!.join(', ')})` : ''}
                            </Badge>
                          )}

                        </td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{e.trn_type || '—'}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{e.fitid}</td>
                        <td className={`py-1.5 pr-2 text-right whitespace-nowrap font-medium ${e.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                          {brl(Number(e.amount))}
                        </td>
                        {interactive && (
                          <td className="py-1.5 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 rounded-xl h-7"
                              disabled={busy}
                              onClick={() => onCreate?.(e.id)}
                            >
                              <PlusCircle className="h-3.5 w-3.5" /> Criar lançamento
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {interactive && (data.criados.length + data.vinculados.length + data.ignorados.length) > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Linhas processadas ({data.criados.length + data.vinculados.length + data.ignorados.length})
                </p>
                {onDeleteAllLinks && (data.criados.length + data.vinculados.length) > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 rounded-xl h-8 border-destructive/40 text-destructive"
                    disabled={busy}
                    onClick={onDeleteAllLinks}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir conciliações ({data.criados.length + data.vinculados.length})
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">Data</th>
                      <th className="py-1.5 pr-2 font-medium">Descrição</th>
                      <th className="py-1.5 pr-2 font-medium">Status</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Valor</th>
                      <th className="py-1.5 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.criados, ...data.vinculados, ...data.ignorados]
                      .sort((a, b) => a.posted_at.localeCompare(b.posted_at))
                      .map(e => {
                        const criado = e.status === 'vinculado' && CREATED_MARK.test(e.match_note ?? '');
                        const status = e.status === 'ignorado' ? 'Ignorado' : criado ? 'Criado' : 'Vinculado';
                        return (
                          <tr key={e.id} className="border-b border-border/50">
                            <td className="py-1.5 pr-2 whitespace-nowrap">{br(e.posted_at)}</td>
                            <td className="py-1.5 pr-2 max-w-[320px] truncate">{e.memo || '(sem descrição)'}</td>
                            <td className="py-1.5 pr-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${criado ? 'border-secondary/40 text-secondary' : e.status === 'ignorado' ? 'text-muted-foreground' : 'border-accent/40 text-accent'}`}
                              >
                                {status}
                              </Badge>
                            </td>
                            <td className={`py-1.5 pr-2 text-right whitespace-nowrap font-medium ${e.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                              {brl(Number(e.amount))}
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap space-x-1">
                              {e.transaction_id && onView && (
                                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-7" onClick={() => onView(e)}>
                                  <ExternalLink className="h-3.5 w-3.5" /> Ver lançamento
                                </Button>
                              )}
                              {onUnlink && (
                                <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl h-7" disabled={busy} onClick={() => onUnlink(e)}>
                                  <Link2Off className="h-3.5 w-3.5" /> {criado ? 'Cancelar/estornar' : 'Reabrir'}
                                </Button>
                              )}
                              {onDeleteLink && e.transaction_id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 rounded-xl h-7 text-destructive"
                                  disabled={busy}
                                  onClick={() => onDeleteLink(e)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Excluir conciliação
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
