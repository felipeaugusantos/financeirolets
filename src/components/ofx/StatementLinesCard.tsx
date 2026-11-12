import type { EnrichedEntry, StatementEntry } from '@/hooks/useOfxImport';
import { Link2, Link2Off, EyeOff, PlusCircle, Zap, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { br, brl, confidenceStyle, basisLabel } from './ofxFormat';

interface Props {
  visible: EnrichedEntry[];
  loading: boolean;
  from: string;
  to: string;
  selected: Set<string>;
  selectableIds: string[];
  allVisibleSelected: boolean;
  autoLinkableCount: number;
  selectedCount: number;
  selectedWithSuggestionCount: number;
  batchRunning: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onAutoLink: () => void;
  onLinkSelected: () => void;
  onBulkCreate: () => void;
  onIgnoreSelected: () => void;
  onShowWholeYear: () => void;
  onLink: (entryId: string, transactionId: string, note: string) => void;
  onCreate: (item: EnrichedEntry) => void;
  onIgnore: (item: EnrichedEntry) => void;
  onReopen: (entry: StatementEntry) => void;
}

export default function StatementLinesCard({
  visible, loading, from, to, selected, selectableIds, allVisibleSelected, autoLinkableCount, selectedCount,
  selectedWithSuggestionCount, batchRunning, onToggle, onToggleAll, onAutoLink, onLinkSelected, onBulkCreate,
  onIgnoreSelected, onShowWholeYear, onLink, onCreate, onIgnore, onReopen,
}: Props) {
  return (
  <Card className="shadow-card rounded-2xl border-border">
    <CardHeader className="space-y-3">
      <CardTitle className="text-sm font-heading">Linhas do extrato</CardTitle>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-xl h-8"
          disabled={selectableIds.length === 0}
          onClick={onToggleAll}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {allVisibleSelected ? 'Limpar seleção' : `Selecionar pendentes (${selectableIds.length})`}
        </Button>

        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5 rounded-xl h-8"
          disabled={autoLinkableCount === 0 || batchRunning}
          onClick={onAutoLink}
        >
          <Zap className="h-3.5 w-3.5" />
          Vincular automático ({autoLinkableCount})
        </Button>

        {selectedCount > 0 && (
          <>
            <Badge variant="outline" className="text-[11px]">{selectedCount} selecionada(s)</Badge>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl h-8"
              disabled={selectedWithSuggestionCount === 0 || batchRunning}
              onClick={onLinkSelected}
            >
              <Link2 className="h-3.5 w-3.5" />
              Vincular à melhor sugestão ({selectedWithSuggestionCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl h-8"
              disabled={batchRunning}
              onClick={onBulkCreate}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Criar lançamentos em lote
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 rounded-xl h-8"
              disabled={batchRunning}
              onClick={onIgnoreSelected}
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
            onClick={onShowWholeYear}
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
                    onCheckedChange={() => onToggle(e.id)}
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
                          <Button size="sm" className="gap-1.5 rounded-xl h-8" onClick={() => onLink(e.id, s.transaction.id, s.reasons.join('; '))}>
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
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-8" onClick={() => onCreate(item)}>
                    <PlusCircle className="h-3.5 w-3.5" /> Criar lançamento
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl h-8" onClick={() => onIgnore(item)}>
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
                <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl h-8" onClick={() => onReopen(e as StatementEntry)}>
                  <Link2Off className="h-3.5 w-3.5" /> Reabrir
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </CardContent>
  </Card>
  );
}
