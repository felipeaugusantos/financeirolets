import { useState } from 'react';
import { ArrowLeft, AlertTriangle, Copy, Tag, Building2, EyeOff, CalendarX, Users, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDataQuality, QualityTx } from '@/hooks/useDataQuality';
import { exportToCsv, csvNumber, csvDate, CsvCell } from '@/lib/exportCsv';
import { toLocalISODate, todayLocalISO } from '@/lib/utils';

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');

function TxTable({ items, limit = 50 }: { items: QualityTx[]; limit?: number }) {
  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento nesta condição.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Competência</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-[10px]">ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.slice(0, limit).map((t) => (
            <TableRow key={t.id}>
              <TableCell className="whitespace-nowrap">{fmtDate(t.competence_date)}</TableCell>
              <TableCell className="max-w-[280px] truncate">{t.description}</TableCell>
              <TableCell>{t.type}</TableCell>
              <TableCell>{t.status}</TableCell>
              <TableCell className="text-right">{fmt(t.net_amount)}</TableCell>
              <TableCell className="text-[10px] text-muted-foreground">{t.id.slice(0, 8)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length > limit && (
        <p className="p-3 text-xs text-muted-foreground">
          Mostrando {limit} de {items.length}. Use o CSV para a lista completa.
        </p>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  count,
  children,
  onExport,
}: {
  icon: any;
  title: string;
  hint: string;
  count: number;
  children: React.ReactNode;
  onExport?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-warning/10 shrink-0">
            <Icon className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              {title}
              <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{count}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onExport && count > 0 && (
            <Button variant="outline" size="sm" onClick={onExport}>CSV</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Ocultar' : 'Ver'}
          </Button>
        </div>
      </CardHeader>
      {open && <CardContent className="p-0 border-t border-border">{children}</CardContent>}
    </Card>
  );
}

export default function DataQualitySettings({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState({
    from: toLocalISODate(new Date(new Date().getFullYear(), 0, 1)),
    to: todayLocalISO(),
  });
  const q = useDataQuality(range);

  const exportTxs = (name: string, items: QualityTx[], problem: string) => {
    const headers = ['ID', 'Competência', 'Descrição', 'Tipo', 'Status', 'Valor Líquido', 'Vencimento', 'Pagamento', 'Problema'];
    const rows: CsvCell[][] = items.map((t) => [
      t.id,
      csvDate(t.competence_date),
      t.description,
      t.type,
      t.status,
      csvNumber(t.net_amount),
      csvDate(t.due_date),
      csvDate(t.payment_date),
      problem,
    ]);
    exportToCsv(`conferencia_${name}_${todayLocalISO()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div>
        <h2 className="font-heading text-xl font-bold text-card-foreground">Conferência de lançamentos</h2>
        <p className="text-sm text-muted-foreground">
          Lista de registros que precisam de revisão manual. Esta tela é somente leitura.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Nenhuma correção é aplicada automaticamente. Revise cada caso e ajuste manualmente no lançamento
          quando tiver certeza.
        </AlertDescription>
      </Alert>

      <Card className="shadow-card rounded-2xl border-border">
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Competência de</Label>
            <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">até</Label>
            <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="gap-2" onClick={q.reload} disabled={q.loading}>
              {q.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {q.loading ? (
        <p className="text-sm text-muted-foreground">Analisando lançamentos...</p>
      ) : (
        <div className="space-y-3">
          <Section
            icon={Copy}
            title="Possíveis duplicados"
            hint="Mesma natureza, data de competência, valor e descrição."
            count={q.duplicates.length}
            onExport={() =>
              exportTxs('duplicados', q.duplicates.flatMap((g) => g.items), 'possível duplicado')
            }
          >
            <div className="divide-y divide-border">
              {q.duplicates.slice(0, 30).map((g) => (
                <div key={g.key} className="p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    {g.items.length} lançamentos idênticos — confira lado a lado antes de excluir qualquer um.
                  </p>
                  <TxTable items={g.items} limit={10} />
                </div>
              ))}
              {q.duplicates.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Nenhum grupo suspeito no período.</p>
              )}
            </div>
          </Section>

          <Section
            icon={AlertTriangle}
            title="Tipo x status incompatível"
            hint="Ex.: despesa marcada como recebido, receita marcada como pago."
            count={q.typeStatusMismatch.length}
            onExport={() => exportTxs('tipo_status', q.typeStatusMismatch, 'tipo/status incompatível')}
          >
            <TxTable items={q.typeStatusMismatch} />
          </Section>

          <Section
            icon={Tag}
            title="Sem categoria"
            hint="Não entram no DRE por falta de classificação."
            count={q.semCategoria.length}
            onExport={() => exportTxs('sem_categoria', q.semCategoria, 'sem categoria')}
          >
            <TxTable items={q.semCategoria} />
          </Section>

          <Section
            icon={Building2}
            title="Sem unidade e sem rateio"
            hint='Aparecem como "Sem unidade" nos relatórios — não somem, mas não pertencem a nenhuma unidade.'
            count={q.semUnidade.length}
            onExport={() => exportTxs('sem_unidade', q.semUnidade, 'sem unidade/rateio')}
          >
            <TxTable items={q.semUnidade} />
          </Section>

          <Section
            icon={EyeOff}
            title="Fora do DRE (affects_dre = false)"
            hint="Marcados manualmente para não impactar o resultado."
            count={q.foraDoDre.length}
            onExport={() => exportTxs('fora_dre', q.foraDoDre, 'affects_dre = false')}
          >
            <TxTable items={q.foraDoDre} />
          </Section>

          <Section
            icon={EyeOff}
            title="Fora do caixa (affects_cashflow = false)"
            hint="Não impactam o Fluxo de Caixa (ex.: receita bruta de venda no cartão)."
            count={q.foraDoCaixa.length}
            onExport={() => exportTxs('fora_caixa', q.foraDoCaixa, 'affects_cashflow = false')}
          >
            <TxTable items={q.foraDoCaixa} />
          </Section>

          <Section
            icon={CalendarX}
            title="Pagos sem data de pagamento"
            hint="Ficam de fora do Fluxo de Caixa e do DRE em regime de caixa."
            count={q.pagoSemData.length}
            onExport={() => exportTxs('pago_sem_data', q.pagoSemData, 'pago sem data de pagamento')}
          >
            <TxTable items={q.pagoSemData} />
          </Section>

          <Section
            icon={Users}
            title="Despesas sem fornecedor"
            hint="Insumos, embalagens, fretes e bonificações deveriam ter parceiro vinculado."
            count={q.semFornecedor.length}
            onExport={() => exportTxs('sem_fornecedor', q.semFornecedor, 'despesa sem fornecedor')}
          >
            <TxTable items={q.semFornecedor} />
          </Section>

          <Section
            icon={Tag}
            title="Categorias com problema de classificação"
            hint="Categoria sem linha do DRE ou sem nenhum uso."
            count={q.categoryIssues.length}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Problema</TableHead>
                    <TableHead className="text-right">Lançamentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.categoryIssues.map((c, i) => (
                    <TableRow key={`${c.id}-${i}`}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.type}</TableCell>
                      <TableCell>{c.problem === 'sem-dre' ? 'Sem linha do DRE' : 'Sem uso'}</TableCell>
                      <TableCell className="text-right">{c.usageCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section
            icon={Tag}
            title="Linhas do DRE com várias categorias"
            hint="Útil para identificar casos como Salários indo tudo para uma única linha."
            count={q.dreLineIssues.length}
          >
            <div className="divide-y divide-border">
              {q.dreLineIssues.map((l) => (
                <div key={l.dreLineName} className="p-3">
                  <p className="text-sm font-medium">{l.dreLineName}</p>
                  <p className="text-xs text-muted-foreground">{l.categories.join(' • ')}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
