import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tables } from '@/integrations/supabase/types';

type Store = Tables<'ifood_stores'>;

export default function IfoodStoresSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<Store>('ifood_stores');
  const { data: units } = useSupabaseCrud<Tables<'units'>>('units');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const unitName = (id: string | null) => units.find(u => u.id === id)?.name ?? '—';

  const columns: ColumnConfig<Store>[] = [
    { key: 'name', label: 'Loja' },
    { key: 'merchant_id', label: 'Merchant ID' },
    { key: 'unit_id', label: 'Unidade', render: (r: Store) => unitName(r.unit_id) },
  ] as ColumnConfig<Store>[];

  const fields: FieldConfig[] = [
    { name: 'name', label: 'Nome da loja no iFood', required: true, placeholder: "Ex: Let's Cookies Boulevard" },
    { name: 'merchant_id', label: 'Merchant ID (ID da loja no Portal do Parceiro)', placeholder: 'Ex: 6b487a27-...' },
    { name: 'unit_id', label: 'Unidade do sistema', type: 'select', required: true, options: units.filter(u => u.active).map(u => ({ value: u.id, label: u.name })) },
  ];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <p className="text-sm text-muted-foreground">Cadastre cada loja do iFood e ligue à unidade. Depois, na tela iFood, escolha a loja para ver o botão de importar planilha.</p>
      <CrudTable
        title="Lojas iFood"
        columns={columns}
        data={data}
        loading={loading}
        onAdd={() => { setEditing(null); setOpen(true); }}
        onEdit={row => { setEditing(row); setOpen(true); }}
        onDelete={remove}
        onToggleActive={toggleActive}
      />
      <CrudDialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar loja iFood' : 'Nova loja iFood'}
        fields={fields}
        initialData={editing}
        onSave={d => editing ? update(editing.id, d) : create(d)}
      />
    </div>
  );
}
