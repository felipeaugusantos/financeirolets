import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SelectOption {
  id: string;
  name: string;
}

interface ExtraField {
  key: string;
  label: string;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface SelectWithAddProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  noneLabel?: string;
  addLabel?: string;
  dialogTitle?: string;
  nameLabel?: string;
  extraFields?: ExtraField[];
  onAdd: (data: Record<string, string>) => Promise<string | null>; // returns new id or null on error
  className?: string;
  triggerClassName?: string;
}

export default function SelectWithAdd({
  value,
  onValueChange,
  options,
  placeholder = 'Selecionar',
  noneLabel = 'Nenhum(a)',
  addLabel = '+ Adicionar',
  dialogTitle = 'Adicionar Novo',
  nameLabel = 'Nome',
  extraFields = [],
  onAdd,
  className,
  triggerClassName,
}: SelectWithAddProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSelect = (v: string) => {
    if (v === '__add__') {
      setDialogOpen(true);
      return;
    }
    onValueChange(v === '__none__' ? '' : v);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const newId = await onAdd({ name: name.trim(), ...extras });
      if (newId) {
        onValueChange(newId);
        setDialogOpen(false);
        setName('');
        setExtras({});
      }
    } catch (err: any) {
      toast.error('Erro ao adicionar', { description: err?.message || 'Tente novamente' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select value={value || '__none__'} onValueChange={handleSelect}>
        <SelectTrigger className={cn('rounded-xl bg-card border-border', triggerClassName)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={className}>
          <SelectItem value="__none__">{noneLabel}</SelectItem>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
          <div
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm text-primary hover:bg-accent mt-1 border-t border-border"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            {addLabel}
          </div>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{nameLabel} *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`Nome...`}
                className="rounded-xl bg-card border-border"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            {extraFields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {field.label} {field.required && '*'}
                </Label>
                {field.type === 'select' && field.options ? (
                  <Select value={extras[field.key] || ''} onValueChange={v => setExtras(prev => ({ ...prev, [field.key]: v }))}>
                    <SelectTrigger className="rounded-xl bg-card border-border"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {field.options.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={extras[field.key] || ''}
                    onChange={e => setExtras(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="rounded-xl bg-card border-border"
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
