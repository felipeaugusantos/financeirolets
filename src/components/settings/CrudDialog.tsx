
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import React, { useState, useEffect } from 'react';

export interface FieldConfig {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

interface CrudDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Record<string, any>) => Promise<boolean>;
  title: string;
  fields: FieldConfig[];
  initialData?: Record<string, any>;
}

export function CrudDialog({ open, onClose, onSave, title, fields, initialData }: CrudDialogProps) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const defaults: Record<string, any> = {};
      fields.forEach(f => {
        const val = initialData?.[f.name];
        if (f.type === 'select' && (val === null || val === undefined || val === '')) {
          // Find if there's a __none__ option
          const hasNone = f.options?.some(o => o.value === '__none__');
          defaults[f.name] = hasNone ? '__none__' : '';
        } else {
          defaults[f.name] = val ?? '';
        }
      });
      setForm(defaults);
    }
  }, [open, initialData, fields]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map(f => (
            <div key={f.name} className="space-y-1.5">
              <Label className="text-xs font-medium">{f.label}</Label>
              {f.type === 'select' ? (
                <Select value={form[f.name] || ''} onValueChange={v => setForm(p => ({ ...p, [f.name]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {f.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  value={form[f.name] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="rounded-xl"
                />
              ) : (
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={form[f.name] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.name]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  placeholder={f.placeholder}
                  className="rounded-xl"
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl">{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
