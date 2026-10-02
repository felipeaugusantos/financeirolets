
import { useState } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, type FormValues, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Tables } from '@/integrations/supabase/types';

const typeLabels: Record<string, string> = { fornecedor: 'Fornecedor', cliente: 'Cliente', ambos: 'Ambos' };

const columns: ColumnConfig<Tables<'partners'>>[] = [
  { key: 'name', label: 'Nome' },
  { key: 'type', label: 'Tipo', render: (v: string) => <Badge variant="outline" className="rounded-full text-xs">{typeLabels[v] || v}</Badge> },
  { key: 'document', label: 'CPF/CNPJ' },
  { key: 'phone', label: 'Telefone' },
  { key: 'pix_key', label: 'Chave PIX' },
];

const fields: FieldConfig[] = [
  { name: 'name', label: 'Nome', required: true, placeholder: 'Razão social ou nome' },
  { name: 'type', label: 'Tipo', type: 'select', required: true, options: [
    { value: 'fornecedor', label: 'Fornecedor' },
    { value: 'cliente', label: 'Cliente' },
    { value: 'ambos', label: 'Ambos' },
  ]},
  { name: 'document', label: 'CPF/CNPJ', placeholder: '00.000.000/0000-00' },
  { name: 'email', label: 'E-mail', placeholder: 'email@exemplo.com' },
  { name: 'phone', label: 'Telefone', placeholder: '(11) 99999-9999' },
  { name: 'pix_key', label: 'Chave PIX', placeholder: 'CPF, e-mail, telefone ou aleatória' },
  { name: 'pix_key_type', label: 'Tipo da Chave PIX', type: 'select', options: [
    { value: '__none__', label: 'Nenhum' },
    { value: 'cpf', label: 'CPF' },
    { value: 'cnpj', label: 'CNPJ' },
    { value: 'email', label: 'E-mail' },
    { value: 'telefone', label: 'Telefone' },
    { value: 'aleatoria', label: 'Aleatória' },
  ]},
  { name: 'bank_name', label: 'Banco', placeholder: 'Nome do banco' },
  { name: 'bank_agency', label: 'Agência', placeholder: '0000' },
  { name: 'bank_account', label: 'Conta', placeholder: '00000-0' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export default function PartnersSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<Tables<'partners'>>('partners');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<'partners'> | null>(null);

  const handleSave = async (formData: FormValues) => {
    const clean = { ...formData };
    if (!clean.pix_key_type || clean.pix_key_type === '__none__') clean.pix_key_type = null;
    return editing ? update(editing.id, clean) : create(clean);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <CrudTable
        title="Parceiros"
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
        title={editing ? 'Editar Parceiro' : 'Novo Parceiro'}
        fields={fields}
        initialData={editing}
        onSave={handleSave}
      />
    </div>
  );
}
