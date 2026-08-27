import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Upload, Link2, Link2Off, EyeOff, PlusCircle, FileText, AlertTriangle, Zap, CheckSquare } from 'lucide-react';
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
import { useOfxImport, EnrichedEntry, StatementEntry } from '@/hooks/useOfxImport';
import { pickAutoLinkable } from '@/lib/ofxMatch';
import OfxRulesPanel, { OptionList } from '@/components/ofx/OfxRulesPanel';
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

export default function OfxImportSettings({ onBack }: { onBack?: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayLocalISO());
  const [statusFilter, setStatusFilter] = useState<'pendente' | 'vinculado' | 'ignorado' | 'todos'>('pendente');
  const [options, setOptions] = useState<OptionList>({ categories: [], units: [], fronts: [], partners: [] });
  const [createFor, setCreateFor] = useState<EnrichedEntry | null>(null);
  const [createForm, setCreateForm] = useState<any>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');

  const {
    enriched, rules, loading, importing, batchRunning, lastImport, stats,
    importFile, linkEntry, unlinkEntry, ignoreEntry, createFromEntry,
    linkMany, ignoreMany, createMany, reloadRules,
  } = useOfxImport(accountId || null, from, to);


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
        categories: (cat.data ?? []) as any,
        units: (uni.data ?? []) as any,
        fronts: (fro.data ?? []) as any,
        partners: (par.data ?? []) as any,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const account = accounts.find(a => a.id === accountId);

  const visible = useMemo(
    () => enriched.filter(e => statusFilter === 'todos' || e.entry.status === statusFilter),
    [enriched, statusFilter]
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(selectableIds));

  const clearSelection = () => setSelected(new Set());

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

  const runCreateSelected = async () => {
    await createMany(selectedItems.map(v => ({
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


  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    const summary = await importFile(file, accountId);
    if (fileRef.current) fileRef.current.value = '';

    // Se o arquivo declara a conta e ainda não gravamos, guardamos para o próximo upload.
    const acct = summary?.statements[0]?.acctid;
    if (summary && acct && account && !account.ofx_acctid) {
      await supabase.from('accounts').update({
        ofx_acctid: acct,
        ofx_bankid: summary.statements[0].bankid || null,
      } as any).eq('id', accountId);
      setAccounts(list => list.map(a => (a.id === accountId ? { ...a, ofx_acctid: acct } : a)));
    }
    // Aviso quando o arquivo é de outra conta.
    if (summary && acct && account?.ofx_acctid && account.ofx_acctid !== acct) {
      toast({
        title: 'Atenção: conta do arquivo é diferente',
        description: `O arquivo é da conta ${acct}, mas "${account.name}" está gravada como ${account.ofx_acctid}.`,
        variant: 'destructive',
      });
    }
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
    const ok = await createFromEntry(createFor.entry as StatementEntry, createForm);
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
          </div>
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

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader>
          <CardTitle className="text-sm font-heading">Linhas do extrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && visible.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma linha nesse filtro. Importe um arquivo OFX para começar.</p>
          )}
          {visible.map(item => {
            const e = item.entry;
            return (
              <div key={e.id} className="rounded-2xl border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.memo || '(sem descrição)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {br(e.posted_at)} · {e.trn_type} · FITID {e.fitid}
                    </p>
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
                                confiança {s.confidence}
                              </Badge>
                              <Button size="sm" className="gap-1.5 rounded-xl h-8" onClick={() => linkEntry(e.id, s.transaction.id, s.reasons.join('; '))}>
                                <Link2 className="h-3.5 w-3.5" /> Vincular
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum lançamento compatível encontrado na janela de 5 dias.</p>
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
                    <p className="text-xs text-muted-foreground">{e.match_note || '—'}</p>
                    <Button size="sm" variant="ghost" className="gap-1.5 rounded-xl h-8" onClick={() => unlinkEntry(e.id)}>
                      <Link2Off className="h-3.5 w-3.5" /> Reabrir
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <OfxRulesPanel rules={rules} options={options} onChanged={reloadRules} />

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
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={createForm.description ?? ''} onChange={ev => setCreateForm((f: any) => ({ ...f, description: ev.target.value }))} />
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
                    value={createForm[key] ?? NONE}
                    onValueChange={v => setCreateForm((f: any) => ({ ...f, [key]: v === NONE ? null : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>Nenhuma</SelectItem>
                      {list.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
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
