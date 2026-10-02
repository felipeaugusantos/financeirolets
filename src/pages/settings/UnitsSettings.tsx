
import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tables } from '@/integrations/supabase/types';

const columns: ColumnConfig[] = [
  { key: 'name', label: 'Nome' },
  { key: 'code', label: 'Código' },
];

const fields: FieldConfig[] = [
  { name: 'name', label: 'Nome da Unidade', required: true, placeholder: 'Ex: Let\'s Café' },
  { name: 'code', label: 'Código', placeholder: 'Ex: CAFE' },
];

export default function UnitsSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<Tables<'units'>>('units');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <CrudTable
        title="Unidades"
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
        title={editing ? 'Editar Unidade' : 'Nova Unidade'}
        fields={fields}
        initialData={editing}
        onSave={data => editing ? update(editing.id, data) : create(data)}
      />
    </div>
  );
}
