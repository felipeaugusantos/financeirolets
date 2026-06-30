import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Bookmark, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface FilterPreset<T> {
  id: string;
  name: string;
  createdAt: string;
  filters: T;
}

interface Props<T> {
  storageKey: string;
  currentFilters: T;
  onApply: (filters: T) => void;
}

export function FilterPresets<T>({ storageKey, currentFilters, onApply }: Props<T>) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<FilterPreset<T>[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  const persist = (list: FilterPreset<T>[]) => {
    setPresets(list);
    try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch {}
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newPreset: FilterPreset<T> = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: new Date().toISOString(),
      filters: currentFilters,
    };
    persist([newPreset, ...presets].slice(0, 20));
    setName('');
    setOpen(false);
    setSelected(newPreset.id);
    toast({ title: 'Preset salvo', description: `"${trimmed}" foi salvo.` });
  };

  const handleApply = (id: string) => {
    setSelected(id);
    const preset = presets.find(p => p.id === id);
    if (preset) {
      onApply(preset.filters);
      toast({ title: 'Preset aplicado', description: preset.name });
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    const p = presets.find(x => x.id === selected);
    persist(presets.filter(x => x.id !== selected));
    setSelected('');
    if (p) toast({ title: 'Preset removido', description: p.name });
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1 min-w-[200px] flex-1">
        <Label className="text-xs flex items-center gap-1">
          <Bookmark className="h-3 w-3" /> Presets de filtros
        </Label>
        <Select value={selected} onValueChange={handleApply} disabled={presets.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder={presets.length === 0 ? 'Nenhum preset salvo' : 'Carregar preset...'} />
          </SelectTrigger>
          <SelectContent>
            {presets.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" title="Salvar filtros atuais como preset">
            <Save className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar preset de filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nome do preset</Label>
            <Input
              autoFocus
              placeholder="Ex.: Fábrica + Produção + Últimos 30 dias"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!name.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        variant="outline"
        size="icon"
        onClick={handleDelete}
        disabled={!selected}
        title="Excluir preset selecionado"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}