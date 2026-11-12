import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useQualityCtx } from './qualityContext';

export function BulkBar({ block, ids, children }: { block: string; ids: string[]; children?: ReactNode }) {
  const { selected, setAll } = useQualityCtx();
  return (
  <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/40 border-b border-border">
    <Checkbox
      checked={ids.length > 0 && selected(block).size === ids.length}
      onCheckedChange={(v) => setAll(block, ids, !!v)}
    />
    <span className="text-xs text-muted-foreground">
      Selecionar todos ({selected(block).size}/{ids.length})
    </span>
    <div className="ml-auto flex items-center gap-2 flex-wrap">{children}</div>
  </div>
  );
}
