import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCurrentUserRoles } from '@/hooks/useUserRoles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Lock, Unlock } from 'lucide-react';

interface ClosedPeriod {
  id: string;
  year: number;
  month: number;
  note: string | null;
  closed_at: string;
  closed_by: string | null;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ClosedPeriodsSettings({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { isAdmin, isFinanceiro } = useCurrentUserRoles();
  const canClose = isAdmin || isFinanceiro;

  const today = new Date();
  const [periods, setPeriods] = useState<ClosedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ count: number; result: number } | null>(null);
  const [reopening, setReopening] = useState<ClosedPeriod | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('closed_periods')
      .select('id, year, month, note, closed_at, closed_by')
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar meses fechados', description: error.message, variant: 'destructive' });
    }
    setPeriods((data as ClosedPeriod[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const range = useMemo(() => {
    const y = Number(year);
    const m = Number(month);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
    return { start, end };
  }, [year, month]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('transactions')
        .select('type, net_amount')
        .neq('status', 'cancelado')
        .eq('affects_dre', true)
        .gte('competence_date', range.start)
        .lt('competence_date', range.end);
      if (cancelled) return;
      const rows = data ?? [];
      const result = rows.reduce(
        (acc, r: any) => acc + (r.type === 'receita' ? Number(r.net_amount) : -Number(r.net_amount)),
        0,
      );
      setPreview({ count: rows.length, result });
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const alreadyClosed = periods.some((p) => p.year === Number(year) && p.month === Number(month));

  const close = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('closed_periods').insert({
      year: Number(year),
      month: Number(month),
      note: note.trim() || null,
      closed_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível fechar o mês', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${MONTHS[Number(month) - 1]}/${year} fechado`, description: 'Lançamentos desse mês ficam bloqueados.' });
    setNote('');
    load();
  };

  const reopen = async () => {
    if (!reopening) return;
    const { error } = await supabase.from('closed_periods').delete().eq('id', reopening.id);
    if (error) {
      toast({ title: 'Não foi possível reabrir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${MONTHS[reopening.month - 1]}/${reopening.year} reaberto` });
    }
    setReopening(null);
    load();
  };

  const years = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 4 + i);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-accent" /> Fechamento de mês
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Depois de fechado, nenhum lançamento com competência no mês pode ser criado, alterado ou excluído.
            Somente um Administrador consegue reabrir.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Observação da conferência (opcional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {preview && (
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Ao fechar, ficam travados </span>
              <strong>{preview.count}</strong>
              <span className="text-muted-foreground"> lançamentos, com resultado de </span>
              <strong>{currency(preview.result)}</strong>.
            </div>
          )}

          {!canClose && (
            <p className="text-sm text-muted-foreground">
              Apenas os perfis Administrador e Financeiro podem fechar um mês.
            </p>
          )}

          <Button onClick={close} disabled={!canClose || saving || alreadyClosed} className="gap-2">
            <Lock className="h-4 w-4" />
            {alreadyClosed ? 'Mês já está fechado' : 'Fechar mês'}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card rounded-2xl border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">Meses fechados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && periods.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum mês fechado até agora.</p>
          )}
          {periods.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{MONTHS[p.month - 1]}/{p.year}</span>
                  <Badge variant="secondary">Fechado</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Em {new Date(p.closed_at).toLocaleDateString('pt-BR')}
                  {p.note ? ` — ${p.note}` : ''}
                </p>
              </div>
              {isAdmin && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReopening(p)}>
                  <Unlock className="h-4 w-4" /> Reabrir
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={!!reopening} onOpenChange={(o) => !o && setReopening(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reabrir {reopening ? `${MONTHS[reopening.month - 1]}/${reopening.year}` : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os lançamentos desse mês voltam a aceitar alterações e os valores já conferidos podem mudar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reopen}>Reabrir mês</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
