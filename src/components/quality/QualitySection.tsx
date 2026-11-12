import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function QualitySection({
  icon: Icon, title, hint, count, children, onExport, tone = 'warning',
}: {
  icon: LucideIcon; title: string; hint: string; count: number;
  children: React.ReactNode; onExport?: () => void; tone?: 'warning' | 'destructive' | 'muted';
}) {
  const [open, setOpen] = useState(false);
  const bg = tone === 'destructive' ? 'bg-destructive/10' : tone === 'muted' ? 'bg-muted' : 'bg-warning/10';
  const fg = tone === 'destructive' ? 'text-destructive' : tone === 'muted' ? 'text-muted-foreground' : 'text-warning';
  return (
    <Card className="shadow-card rounded-2xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 ${bg}`}><Icon className={`h-5 w-5 ${fg}`} /></div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              {title}
              <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{count}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onExport && count > 0 && <Button variant="outline" size="sm" onClick={onExport}>CSV</Button>}
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Ocultar' : 'Ver'}</Button>
        </div>
      </CardHeader>
      {open && <CardContent className="p-0 border-t border-border">{children}</CardContent>}
    </Card>
  );
}
