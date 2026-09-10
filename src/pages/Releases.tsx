import { useState } from 'react';
import { Download, Sparkles, Wrench, Bug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { releases, formatReleaseDate, KIND_LABEL, type ReleaseKind } from '@/data/releases';
import { exportReleaseNotesPdf } from '@/lib/releaseNotesPdf';

const KIND_ICON: Record<ReleaseKind, typeof Sparkles> = {
  novidade: Sparkles,
  melhoria: Wrench,
  correcao: Bug,
};

const KIND_CLASS: Record<ReleaseKind, string> = {
  novidade: 'bg-primary/10 text-primary border-primary/20',
  melhoria: 'bg-accent/10 text-accent border-accent/20',
  correcao: 'bg-muted text-muted-foreground border-border',
};

export default function Releases() {
  const [busy, setBusy] = useState(false);

  const handleExport = () => {
    setBusy(true);
    try {
      exportReleaseNotesPdf(releases);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-card-foreground">Novidades</h1>
          <p className="text-sm text-muted-foreground">
            Tudo o que mudou no sistema desde a última liberação, organizado por data de publicação.
          </p>
        </div>
        <Button onClick={handleExport} disabled={busy} className="gap-2">
          <Download className="h-4 w-4" />
          {busy ? 'Gerando...' : 'Baixar PDF (equipe)'}
        </Button>
      </div>

      <div className="space-y-5">
        {releases.map((release, idx) => (
          <Card key={release.version} className="shadow-card rounded-2xl border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-heading text-lg">Versão {release.version}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {formatReleaseDate(release.date)}
                </Badge>
                {idx === 0 && <Badge className="text-xs">Última liberação</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{release.summary}</p>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-4">
              {release.items.map((item, i) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <div key={`${release.version}-${i}`} className="flex gap-3">
                    <div className="mt-0.5 p-2 rounded-xl bg-muted h-fit">
                      <Icon className="h-4 w-4 text-accent" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge variant="outline" className={`text-[10px] ${KIND_CLASS[item.kind]}`}>
                          {KIND_LABEL[item.kind]}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{item.area}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
