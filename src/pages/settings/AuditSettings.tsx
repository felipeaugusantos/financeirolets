import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, History, Filter, Eye } from 'lucide-react';
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
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

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
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState<string>('__all__');
  const [actionFilter, setActionFilter] = useState<string>('__all__');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
      if (tableFilter !== '__all__') q = q.eq('table_name', tableFilter);
      if (actionFilter !== '__all__') q = q.eq('action', actionFilter);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
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
  }, [tableFilter, actionFilter, dateFrom, dateTo, toast]);

  const tables = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))), [rows]);
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                      {r.action}
                    </Badge>
                    <span className="text-sm font-medium">{r.table_name}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate">{r.record_id.slice(0, 8)}…</span>
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
                {detail?.action}
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
