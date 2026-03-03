
import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const columns: ColumnConfig[] = [
  { key: 'name', label: 'Nome' },
  { key: 'type', label: 'Tipo' },
  { key: 'initial_balance', label: 'Saldo Inicial', render: (v: number) => `R$ ${(v ?? 0).toFixed(2)}` },
];

const fields: FieldConfig[] = [
  { name: 'name', label: 'Nome da Conta', required: true, placeholder: 'Ex: Banco Principal' },
  { name: 'type', label: 'Tipo', type: 'select', options: [
    { value: 'caixa', label: 'Caixa' },
    { value: 'banco', label: 'Banco' },
    { value: 'cartao', label: 'Cartão' },
    { value: 'investimento', label: 'Investimento' },
    { value: 'outro', label: 'Outro' },
  ]},
  { name: 'initial_balance', label: 'Saldo Inicial', type: 'number', placeholder: '0.00' },
];

export default function AccountsSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<any>('accounts');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <CrudTable
        title="Contas Financeiras"
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
        title={editing ? 'Editar Conta' : 'Nova Conta'}
        fields={fields}
        initialData={editing}
        onSave={data => editing ? update(editing.id, data) : create(data)}
      />
    </div>
  );
}
