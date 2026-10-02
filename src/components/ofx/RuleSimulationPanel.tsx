import { useMemo, useRef, useState } from 'react';
import { FlaskConical, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseOfx, readOfxFile } from '@/lib/ofx';
import { applyRules, matchingRules, type OfxRule, type StatementLine } from '@/lib/ofxMatch';
import type { OptionList } from './OfxRulesPanel';

type Source = 'arquivo' | 'importado';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function RuleSimulationPanel({
  rules, options, accounts,
}: {
  rules: OfxRule[];
  options: OptionList;
  accounts: { id: string; name: string; default_unit_id?: string | null }[];
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>('arquivo');
  const [accountId, setAccountId] = useState<string>('');
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await readOfxFile(file);
      const statements = parseOfx(text);
      const parsed: StatementLine[] = statements.flatMap(s =>
        s.transactions.map(t => ({
          fitid: t.fitid, posted_at: t.posted_at, amount: t.amount, memo: t.memo, trn_type: t.trn_type,
        }))
      );
      setLines(parsed);
      setLabel(`${file.name} · ${parsed.length} linhas`);
      if (parsed.length === 0) toast({ title: 'Nenhuma linha encontrada no arquivo', variant: 'destructive' });
    } catch (e) {
      toast({ title: 'Não foi possível ler o arquivo OFX', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const loadImported = async () => {
    if (!accountId) { toast({ title: 'Escolha a conta do extrato', variant: 'destructive' }); return; }
    if (from > to) { toast({ title: 'Período inválido', description: 'A data inicial deve ser anterior à final.', variant: 'destructive' }); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('bank_statement_entries')
      .select('fitid, posted_at, amount, memo, trn_type')
      .eq('account_id', accountId)
      .gte('posted_at', from)
      .lte('posted_at', to)
      .order('posted_at')
      .limit(1000);
    setLoading(false);
    if (error) { toast({ title: 'Erro ao carregar extrato', description: error.message, variant: 'destructive' }); return; }
    const parsed = (data ?? []).map((d: any) => ({ ...d, amount: Number(d.amount) })) as StatementLine[];
    setLines(parsed);
    setLabel(`${accounts.find(a => a.id === accountId)?.name ?? 'Conta'} · ${parsed.length} linhas`);
  };

  const ctx = useMemo(() => {
    const acc = accounts.find(a => a.id === accountId);
    return { accountId: accountId || null, accountUnitId: acc?.default_unit_id ?? null };
  }, [accounts, accountId]);

  const simulation = useMemo(() => lines.map(line => {
    const all = matchingRules(line.memo, line.amount, rules, ctx);
    return { line, outcome: applyRules(line.memo, line.amount, rules, ctx), others: all.slice(1) };
  }), [lines, rules, ctx]);

  const withRule = simulation.filter(s => s.outcome).length;
  const conflicts = simulation.filter(s => s.others.length > 0).length;

  const nameOf = (list: { id: string; name: string }[], id?: string | null) =>
    list.find(o => o.id === id)?.name;

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <CardTitle className="text-sm font-heading">Simulação de regras</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mostra qual regra seria aplicada a cada linha do extrato. Nada é gravado nem conciliado aqui.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Origem do extrato</Label>
            <Select value={source} onValueChange={v => { setSource(v as Source); setLines([]); setLabel(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="arquivo">Arquivo OFX (sem importar)</SelectItem>
                <SelectItem value="importado">Extrato já importado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === 'arquivo' ? (
            <div className="space-y-1.5">
              <Label>Arquivo</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".ofx,.OFX,text/plain"
                className="hidden"
                onChange={e => onFile(e.target.files?.[0])}
              />
              <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => fileRef.current?.click()} disabled={loading}>
                <Upload className="h-4 w-4" /> Selecionar OFX
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {source === 'importado' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>De</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Até</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full rounded-xl" onClick={loadImported} disabled={loading}>
                {loading ? 'Carregando...' : 'Simular'}
              </Button>
            </div>
          </div>
        )}

        {label && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{label}</Badge>
            <Badge variant="outline">{withRule} com regra</Badge>
            <Badge variant="outline">{simulation.length - withRule} sem regra</Badge>
            {conflicts > 0 && <Badge variant="outline">{conflicts} com mais de uma regra</Badge>}
          </div>
        )}

        {simulation.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Carregue um extrato para ver a simulação linha a linha.
          </p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {simulation.map(({ line, outcome, others }, i) => (
              <div key={`${line.fitid}-${i}`} className="rounded-xl border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{line.memo || '(sem descrição)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.posted_at.split('-').reverse().join('/')} · {brl(line.amount)}
                    </p>
                  </div>
                  {outcome
                    ? <Badge variant="secondary" className="shrink-0 text-[10px]">{outcome.rule.pattern}</Badge>
                    : <Badge variant="outline" className="shrink-0 text-[10px]">sem regra</Badge>}
                </div>
                {outcome && (
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    {[nameOf(options.categories, outcome.category_id), nameOf(options.units, outcome.unit_id),
                      nameOf(options.fronts, outcome.front_id), nameOf(options.partners, outcome.partner_id)]
                      .filter(Boolean).join(' · ') || 'Regra sem sugestão definida'}
                  </p>
                )}
                {outcome?.allocations?.length ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Rateio da regra: {outcome.allocations.map(a =>
                      `${nameOf(options.units, a.unit_id) ?? 'Sem unidade'}`
                      + `${a.front_id ? ' / ' + (nameOf(options.fronts, a.front_id) ?? '') : ''}`
                      + ` ${a.percentage}%`).join(' · ')}
                  </p>
                ) : null}
                {others.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Outras regras que também casam: {others.map(o => o.pattern).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
