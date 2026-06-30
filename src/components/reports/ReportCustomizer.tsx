import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';

export interface SectionItem<K extends string> {
  key: K;
  label: string;
  hint?: string;
}
export interface SectionGroup<K extends string> {
  label: string;
  items: SectionItem<K>[];
}

export function useReportSections<K extends string>(
  storageKey: string,
  defaults: Record<K, boolean>,
) {
  const [sections, setSections] = useState<Record<K, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<K, boolean>>;
        return { ...defaults, ...parsed };
      }
    } catch { /* ignore */ }
    return defaults;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(sections)); } catch { /* ignore */ }
  }, [storageKey, sections]);

  const set = useCallback((k: K, v: boolean) => setSections((s) => ({ ...s, [k]: v })), []);
  const toggle = useCallback((k: K) => setSections((s) => ({ ...s, [k]: !s[k] })), []);
  const reset = useCallback(() => setSections(defaults), [defaults]);
  const isOn = useCallback((k: K) => !!sections[k], [sections]);

  return { sections, set, toggle, reset, isOn };
}

interface CustomizerProps<K extends string> {
  title?: string;
  description?: string;
  groups: SectionGroup<K>[];
  sections: Record<K, boolean>;
  onToggle: (k: K) => void;
  onReset: () => void;
  /** Section keys to also render as inline switches before the trigger. */
  inlineKeys?: K[];
  triggerLabel?: string;
}

export function ReportCustomizer<K extends string>({
  title = 'Personalizar relatório',
  description = 'Escolha colunas, blocos e detalhes que devem aparecer no relatório final. A exportação continua completa.',
  groups, sections, onToggle, onReset, inlineKeys, triggerLabel = 'Personalizar',
}: CustomizerProps<K>) {
  const inlineItems: SectionItem<K>[] = (inlineKeys ?? [])
    .map((k) => groups.flatMap((g) => g.items).find((it) => it.key === k))
    .filter(Boolean) as SectionItem<K>[];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {inlineItems.map((it) => (
        <div key={it.key} className="flex items-center gap-2">
          <Switch
            id={`inline-${it.key}`}
            checked={!!sections[it.key]}
            onCheckedChange={() => onToggle(it.key)}
          />
          <Label htmlFor={`inline-${it.key}`} className="text-xs cursor-pointer" title={it.hint}>
            {it.label}
          </Label>
        </div>
      ))}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 h-8">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[90vw] sm:w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            {groups.map((g, gi) => (
              <div key={g.label} className="space-y-2">
                {gi > 0 && <Separator />}
                <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground pt-1">
                  {g.label}
                </div>
                <div className="space-y-2">
                  {g.items.map((it) => (
                    <div key={it.key} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`sec-${it.key}`}
                        checked={!!sections[it.key]}
                        onCheckedChange={() => onToggle(it.key)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <Label htmlFor={`sec-${it.key}`} className="text-sm cursor-pointer leading-tight">
                          {it.label}
                        </Label>
                        {it.hint && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{it.hint}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <SheetFooter className="mt-6 flex-row justify-between gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
            </Button>
            <SheetClose asChild>
              <Button size="sm">Concluir</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}