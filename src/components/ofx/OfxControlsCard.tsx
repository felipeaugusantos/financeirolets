import { Upload, PlusCircle, Zap, RefreshCw, RotateCcw, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import type { RefObject, ChangeEvent } from 'react';
import type { Tables } from '@/integrations/supabase/types';
import type { reconciledPercent } from '@/lib/entrySearch';

export type StatusFilter = 'pendente' | 'vinculado' | 'ignorado' | 'todos';

interface Props {
  accounts: Tables<'accounts'>[];
  accountId: string;
  from: string;
  to: string;
  importing: boolean;
  loading: boolean;
  batchRunning: boolean;
  canAutoPost: boolean;
  autoLinkableCount: number;
  selectedCount: number;
  autoPostCount: number;
  statusFilter: StatusFilter;
  view: 'paineis' | 'lista';
  search: string;
  progress: ReturnType<typeof reconciledPercent>;
  fileRef: RefObject<HTMLInputElement>;
  reprocessRef: RefObject<HTMLInputElement>;
  onAccountChange: (id: string) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onReprocessFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onReapplyRules: () => void;
  onRevalidate: () => void;
  onOpenAutoPost: () => void;
  onOpenApiImport: () => void;
  onStatusFilterChange: (s: StatusFilter) => void;
  onSearchChange: (v: string) => void;
}

export default function OfxControlsCard({
  accounts, accountId, from, to, importing, loading, batchRunning, canAutoPost, autoLinkableCount, selectedCount, autoPostCount,
  statusFilter, view, search, progress, fileRef, reprocessRef, onAccountChange, onFromChange, onToChange, onFile, onReprocessFile,
  onReapplyRules, onRevalidate, onOpenAutoPost, onOpenApiImport, onStatusFilterChange, onSearchChange,
}: Props) {
  return (
  <Card className="shadow-card rounded-2xl border-border">
    <CardContent className="pt-6 grid gap-3 sm:grid-cols-4">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Conta</Label>
        <Select value={accountId} onValueChange={onAccountChange}>
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
        <Input type="date" value={from} onChange={e => onFromChange(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Até</Label>
        <Input type="date" value={to} onChange={e => onToChange(e.target.value)} />
      </div>
      <div className="sm:col-span-4 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".ofx,.OFX,text/plain,application/x-ofx" className="hidden" onChange={onFile} />
        <Button
          className="gap-2 rounded-xl"
          disabled={!accountId || importing}
          onClick={() => setTimeout(() => fileRef.current?.click(), 100)}
        >
          <Upload className="h-4 w-4" />
          {importing ? 'Lendo arquivo...' : 'Selecionar arquivo OFX'}
        </Button>
        <input ref={reprocessRef} type="file" accept=".ofx,.OFX,text/plain,application/x-ofx" className="hidden" onChange={onReprocessFile} />
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
          variant="outline"
          className="gap-2 rounded-xl"
          disabled={!accountId || importing}
          onClick={() => onOpenApiImport()}
          title="Importa a resposta da API de Saldo e Extrato do Bradesco (JSON). Só lançamentos fechados; nada vira lançamento sozinho."
        >
          <Landmark className="h-4 w-4" /> Importar da API Bradesco
        </Button>
        <Button
          variant="ghost"
          className="gap-2 rounded-xl"
          disabled={!accountId || loading || importing}
          onClick={onReapplyRules}
          title="Recarrega as regras de conciliação e reaplica às linhas pendentes"
        >
          <RotateCcw className="h-4 w-4" /> Reaplicar regras
        </Button>
        <Button
          variant="secondary"
          className="gap-2 rounded-xl"
          disabled={!accountId || loading || batchRunning}
          onClick={onRevalidate}
          title="Revalida os registros já importados: vincula automaticamente quando data, descrição e valor são iguais e marca os apenas parecidos como similares"
        >
          <Zap className="h-4 w-4" /> Revalidar importados ({autoLinkableCount})
        </Button>
        {canAutoPost && (
        <Button
          variant="secondary"
          className="gap-2 rounded-xl"
          disabled={!accountId || loading || batchRunning || autoPostCount === 0}
          onClick={() => onOpenAutoPost()}
          title="Cria e concilia as linhas selecionadas (ou, sem seleção, as que as regras já classificaram)"
        >
          <PlusCircle className="h-4 w-4" />
          {selectedCount > 0 ? 'Lançar selecionadas' : 'Lançar pelas regras'} ({autoPostCount})
        </Button>
        )}

        {(['pendente', 'vinculado', 'ignorado', 'todos'] as const).map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            className="rounded-xl capitalize"
            onClick={() => onStatusFilterChange(s)}
          >
            {s}
          </Button>
        ))}
        {view === 'lista' && (
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
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
  );
}
