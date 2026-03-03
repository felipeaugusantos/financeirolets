
import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function DreSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<any>('dre_lines', 'sort_order');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const columns: ColumnConfig[] = [
    { key: 'sort_order', label: '#' },
    { key: 'code', label: 'Código' },
    { key: 'name', label: 'Nome' },
    { key: 'is_subtotal', label: 'Tipo', render: (v: boolean) => (
      <Badge variant={v ? 'default' : 'outline'} className="rounded-full text-xs">
        {v ? 'Subtotal' : 'Linha'}
      </Badge>
    )},
    { key: 'sign', label: 'Sinal', render: (v: number) => v === 1 ? '+' : '−' },
    { key: 'parent_id', label: 'Pai', render: (v: string) => {
      const p = data.find((d: any) => d.id === v);
      return p ? p.name : '-';
    }},
  ];

  const fields: FieldConfig[] = [
    { name: 'name', label: 'Nome da Linha', required: true, placeholder: 'Ex: Receita Bruta' },
    { name: 'code', label: 'Código', placeholder: 'Ex: RB' },
    { name: 'sort_order', label: 'Ordem', type: 'number', placeholder: '0' },
    { name: 'is_subtotal', label: 'É Subtotal?', type: 'select', options: [
      { value: 'false', label: 'Não (linha normal)' },
      { value: 'true', label: 'Sim (subtotal)' },
    ]},
    { name: 'sign', label: 'Sinal', type: 'select', options: [
      { value: '1', label: '+ Soma' },
      { value: '-1', label: '− Subtrai' },
    ]},
    { name: 'parent_id', label: 'Linha Pai (opcional)', type: 'select', options: [
      { value: '', label: 'Nenhuma (raiz)' },
      ...data.map((d: any) => ({ value: d.id, label: `${d.code} - ${d.name}` })),
    ]},
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const clean: Record<string, any> = {
      ...formData,
      sort_order: Number(formData.sort_order) || 0,
      sign: Number(formData.sign) || 1,
      is_subtotal: formData.is_subtotal === 'true',
    };
    if (!clean.parent_id) delete clean.parent_id;
    if (!clean.code) delete clean.code;
    return editing ? update(editing.id, clean) : create(clean);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <CrudTable
        title="Linhas do DRE"
        columns={columns}
        data={data}
        loading={loading}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        onEdit={row => { setEditing(row); setDialogOpen(true); }}
        onDelete={remove}
        onToggleActive={toggleActive}
      />
      <CrudDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar Linha DRE' : 'Nova Linha DRE'}
        fields={fields}
        initialData={editing ? { ...editing, is_subtotal: String(editing.is_subtotal), sign: String(editing.sign) } : undefined}
        onSave={handleSave}
      />
    </div>
  );
}
