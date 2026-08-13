import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, History, Filter, Eye, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toLocalISODate } from '@/lib/utils';

interface Props { onBack: () => void; }

interface AuditRow {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  old_data: any;
  new_data: any;
  user_id: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-success/10 text-success border-success/30',
  UPDATE: 'bg-secondary/10 text-secondary border-secondary/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
  RECONCILIATION_FIX: 'bg-accent/10 text-accent border-accent/30',
};

const ACTION_LABEL: Record<string, string> = {
  INSERT: 'Criação',
  UPDATE: 'Atualização',
  DELETE: 'Exclusão',
  RECONCILIATION_FIX: 'Reconciliação',
};

function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return toLocalISODate(d);
}
function startOfMonthIso() {
  const d = new Date();
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// created_at é timestamptz. Os inputs de data são "dia civil" em America/Sao_Paulo (UTC-3, sem DST desde 2019),
// então convertemos o intervalo explicitamente com o offset para não pegar o dia anterior/seguinte.
const SP_OFFSET = '-03:00';
const spDayStart = (isoDate: string) => `${isoDate}T00:00:00.000${SP_OFFSET}`;
const spDayEnd = (isoDate: string) => `${isoDate}T23:59:59.999${SP_OFFSET}`;

function diffFields(oldData: any, newData: any): { key: string; old: any; new: any }[] {
  if (!oldData && !newData) return [];
  if (!oldData) return Object.entries(newData).map(([key, value]) => ({ key, old: undefined, new: value }));
  if (!newData) return Object.entries(oldData).map(([key, value]) => ({ key, old: value, new: undefined }));
  const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
  return keys
    .filter((k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => ({ key: k, old: oldData[k], new: newData[k] }));
}

function valueDisplay(v: any) {
  if (v === null || v === undefined) return <span className="italic text-muted-foreground">vazio</span>;
  if (typeof v === 'object') return <code className="text-[10px]">{JSON.stringify(v)}</code>;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v);
}

export default function AuditSettings({ onBack }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState<string>('__all__');
  const [actionFilter, setActionFilter] = useState<string>('__all__');
  const [unitFilter, setUnitFilter] = useState<string>('__all__');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('units').select('id, name').order('name');
      setUnits((data ?? []) as any);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
      if (tableFilter !== '__all__') q = q.eq('table_name', tableFilter);
      if (actionFilter !== '__all__') q = q.eq('action', actionFilter);
      if (unitFilter !== '__all__') {
        // unit_id está dentro de new_data/old_data (jsonb) — filtra em ambos
        q = q.or(
          `new_data->>unit_id.eq.${unitFilter},old_data->>unit_id.eq.${unitFilter}`,
        );
      }
      if (dateFrom) q = q.gte('created_at', spDayStart(dateFrom));
      if (dateTo) q = q.lte('created_at', spDayEnd(dateTo));
      const { data, error } = await q;
      if (error) {
        toast({ title: 'Erro ao carregar auditoria', description: error.message, variant: 'destructive' });
        setRows([]);
      } else {
        setRows((data ?? []) as AuditRow[]);
        const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);
          const map: Record<string, string> = {};
          (profs ?? []).forEach((p: any) => {
            map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
          });
          setProfiles(map);
        }
      }
      setLoading(false);
    })();
  }, [tableFilter, actionFilter, unitFilter, dateFrom, dateTo, toast]);

  const tables = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))), [rows]);
  const unitName = (id?: string | null) => (id ? units.find((u) => u.id === id)?.name : undefined);
  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.table_name.toLowerCase().includes(s) ||
        r.record_id.toLowerCase().includes(s) ||
        (profiles[r.user_id || ''] || '').toLowerCase().includes(s),
    );
  }, [rows, search, profiles]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground flex items-center gap-2">
            <History className="h-6 w-6 text-accent" />
            Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">Histórico de alterações no sistema</p>
        </div>
      </div>

      <Card className="shadow-card rounded-2xl border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtros
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl h-8 text-xs"
              onClick={() => { setDateFrom(todayIso()); setDateTo(todayIso()); }}
            >Hoje</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl h-8 text-xs"
              onClick={() => { setDateFrom(todayIso(7)); setDateTo(todayIso()); }}
            >Últimos 7 dias</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl h-8 text-xs"
              onClick={() => { setDateFrom(todayIso(30)); setDateTo(todayIso()); }}
            >Últimos 30 dias</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl h-8 text-xs"
              onClick={() => { setDateFrom(startOfMonthIso()); setDateTo(todayIso()); }}
            >Este mês</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl h-8 text-xs"
              onClick={() => {
                setTableFilter('__all__'); setActionFilter('__all__'); setUnitFilter('__all__');
                setDateFrom(''); setDateTo(''); setSearch('');
              }}
            >Limpar</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tabela</Label>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ação</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="INSERT">Criação</SelectItem>
                  <SelectItem value="UPDATE">Atualização</SelectItem>
                  <SelectItem value="DELETE">Exclusão</SelectItem>
                  <SelectItem value="RECONCILIATION_FIX">Reconciliação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" className="rounded-xl" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" className="rounded-xl" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Buscar</Label>
              <Input className="rounded-xl" placeholder="Tabela, ID, usuário..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {filtered.length} registro(s) — máx. 500 mais recentes
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card rounded-2xl border-border">
          <CardContent className="py-16 text-center text-muted-foreground">Nenhum log encontrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="shadow-card rounded-xl border-border">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] border ${ACTION_COLORS[r.action] || ''}`}>
                      {ACTION_LABEL[r.action] || r.action}
                    </Badge>
                    <span className="text-sm font-medium">{r.table_name}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate">{r.record_id.slice(0, 8)}…</span>
                    {(() => {
                      const uid = r.new_data?.unit_id || r.old_data?.unit_id;
                      const name = unitName(uid);
                      return name ? (
                        <Badge variant="outline" className="text-[10px] border-accent/30 text-accent gap-1">
                          <Building2 className="h-3 w-3" />{name}
                        </Badge>
                      ) : null;
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(r.created_at)} · {r.user_id ? (profiles[r.user_id] || 'Usuário') : 'Sistema'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="rounded-xl gap-1" onClick={() => setDetail(r)}>
                  <Eye className="h-4 w-4" /> Ver
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Badge variant="outline" className={`text-xs border ${ACTION_COLORS[detail?.action || ''] || ''}`}>
                {ACTION_LABEL[detail?.action || ''] || detail?.action}
              </Badge>
              {detail?.table_name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3 text-sm">
                <div className="text-xs text-muted-foreground">
                  ID: <code className="font-mono">{detail.record_id}</code> ·{' '}
                  {fmtDate(detail.created_at)} ·{' '}
                  {detail.user_id ? (profiles[detail.user_id] || detail.user_id.slice(0, 8)) : 'Sistema'}
                  {(() => {
                    const uid = detail.new_data?.unit_id || detail.old_data?.unit_id;
                    const name = unitName(uid);
                    return name ? <> · Unidade: <strong>{name}</strong></> : null;
                  })()}
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Campo</th>
                        <th className="text-left p-2">Anterior</th>
                        <th className="text-left p-2">Novo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffFields(detail.old_data, detail.new_data).map((d) => (
                        <tr key={d.key} className="border-t border-border">
                          <td className="p-2 font-mono text-muted-foreground">{d.key}</td>
                          <td className="p-2">{valueDisplay(d.old)}</td>
                          <td className="p-2 font-medium">{valueDisplay(d.new)}</td>
                        </tr>
                      ))}
                      {diffFields(detail.old_data, detail.new_data).length === 0 && (
                        <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">Sem diferenças.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
