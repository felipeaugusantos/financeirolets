import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ChevronDown, ChevronRight, History, User } from 'lucide-react';
import { fmtDate, fmtDateTime } from './format';

const AUDIT_FIELDS: Array<{ key: string; label: string; format?: (v: string | null) => string }> = [
  { key: 'status', label: 'Status' },
  { key: 'payment_date', label: 'Data pgto.', format: (v) => fmtDate(v) },
  { key: 'competence_date', label: 'Competência', format: (v) => fmtDate(v) },
  { key: 'due_date', label: 'Vencimento', format: (v) => fmtDate(v) },
  { key: 'category_id', label: 'Categoria' },
  { key: 'unit_id', label: 'Unidade' },
  { key: 'front_id', label: 'Frente' },
];

type AuditData = Record<string, unknown> | null;

function diffFields(oldData: AuditData, newData: AuditData) {
  const out: Array<{ label: string; from: string; to: string }> = [];
  if (!oldData || !newData) return out;
  for (const f of AUDIT_FIELDS) {
    const a = oldData[f.key];
    const b = newData[f.key];
    if (a === b) continue;
    out.push({
      label: f.label,
      from: a == null ? '—' : (f.format ? f.format(a as string) : String(a)),
      to: b == null ? '—' : (f.format ? f.format(b as string) : String(b)),
    });
  }
  return out;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  record_id: string;
  old_data: AuditData;
  new_data: AuditData;
  user_id: string | null;
  user_name?: string;
}

export function AuditHistory({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('id, created_at, record_id, old_data, new_data, user_id')
        .eq('context', 'reconciliation')
        .order('created_at', { ascending: false })
        .limit(50);
      const list = (logs ?? []) as AuditEntry[];
      const userIds = Array.from(new Set(list.map((l) => l.user_id).filter(Boolean))) as string[];
      const names = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        (profs ?? []).forEach((p) => names.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
      }
      if (!cancel) {
        setEntries(list.map((e) => ({ ...e, user_name: e.user_id ? (names.get(e.user_id) || e.user_id.slice(0, 8)) : 'Sistema' })));
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, refreshKey]);

  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader
        className="flex flex-row items-center justify-between gap-3 pb-3 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <History className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-heading">Histórico de correções</CardTitle>
            <p className="text-xs text-muted-foreground">Últimas 50 correções aplicadas na Reconciliação (quem, quando, antes → depois).</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
            </div>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-xs text-muted-foreground py-3">Nenhuma correção registrada ainda.</p>
          )}
          {!loading && entries.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {entries.map((e) => {
                const diff = diffFields(e.old_data, e.new_data);
                const desc = String(e.new_data?.description || e.old_data?.description || e.record_id.slice(0, 8));
                return (
                  <div key={e.id} className="rounded-xl border border-border p-3 bg-card">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={desc}>{desc}</div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><User className="h-3 w-3" /> {e.user_name}</span>
                          <span>•</span>
                          <span>{fmtDateTime(e.created_at)}</span>
                        </div>
                      </div>
                      <code className="text-[10px] text-muted-foreground font-mono">{e.record_id.slice(0, 8)}</code>
                    </div>
                    {diff.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {diff.map((d, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground/70">{d.label}:</span>
                            <span className="font-mono text-destructive line-through">{d.from}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono text-success">{d.to}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
