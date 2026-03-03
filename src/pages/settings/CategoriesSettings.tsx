
import { useState, useEffect } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export default function CategoriesSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<any>('categories');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [dreLines, setDreLines] = useState<any[]>([]);

  useEffect(() => {
    (supabase.from('dre_lines') as any).select('id, name, code').order('sort_order').then(({ data }: any) => {
      setDreLines(data ?? []);
    });
  }, []);

  const columns: ColumnConfig[] = [
    { key: 'name', label: 'Nome' },
    { key: 'type', label: 'Tipo', render: (v: string) => (
      <Badge variant={v === 'receita' ? 'default' : 'secondary'} className="rounded-full text-xs">
        {v === 'receita' ? 'Receita' : 'Despesa'}
      </Badge>
    )},
    { key: 'dre_line_id', label: 'Linha DRE', render: (v: string) => {
      const line = dreLines.find(l => l.id === v);
      return line ? `${line.code} - ${line.name}` : '-';
    }},
    { key: 'parent_id', label: 'Categoria Pai', render: (v: string) => {
      const parent = data.find((c: any) => c.id === v);
      return parent ? parent.name : '-';
    }},
  ];

  const fields: FieldConfig[] = [
    { name: 'name', label: 'Nome da Categoria', required: true, placeholder: 'Ex: Matéria-Prima' },
    { name: 'type', label: 'Tipo', type: 'select', required: true, options: [
      { value: 'receita', label: 'Receita' },
      { value: 'despesa', label: 'Despesa' },
    ]},
    { name: 'parent_id', label: 'Categoria Pai (opcional)', type: 'select', options: [
      { value: '', label: 'Nenhuma (raiz)' },
      ...data.map((c: any) => ({ value: c.id, label: c.name })),
    ]},
    { name: 'dre_line_id', label: 'Linha do DRE', type: 'select', options: [
      { value: '', label: 'Nenhuma' },
      ...dreLines.map(l => ({ value: l.id, label: `${l.code} - ${l.name}` })),
    ]},
    { name: 'sort_order', label: 'Ordem', type: 'number', placeholder: '0' },
  ];

  const handleSave = async (formData: Record<string, any>) => {
    const clean = { ...formData };
    if (!clean.parent_id) delete clean.parent_id;
    if (!clean.dre_line_id) delete clean.dre_line_id;
    if (!clean.sort_order) clean.sort_order = 0;
    return editing ? update(editing.id, clean) : create(clean);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <CrudTable
        title="Categorias"
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
        title={editing ? 'Editar Categoria' : 'Nova Categoria'}
        fields={fields}
        initialData={editing}
        onSave={handleSave}
      />
    </div>
  );
}
