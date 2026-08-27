
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
  {
    key: 'initial_balance_date',
    label: 'Data-base',
    render: (v: string | null) => (v ? v.split('-').reverse().join('/') : '—'),
  },
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
  {
    name: 'initial_balance_date',
    label: 'Data-base do saldo inicial',
    type: 'date',
    hint: 'Dia em que esse saldo foi apurado no extrato. Só movimentos posteriores a esta data são somados ao saldo — alterá-la muda o saldo exibido em todos os relatórios.',
  },
  {
    name: 'ofx_acctid',
    label: 'Nº da conta no OFX (ACCTID)',
    placeholder: 'Preenchido automaticamente na 1ª importação',
    hint: 'Usado para conferir se o arquivo OFX importado pertence mesmo a esta conta.',
  },
  { name: 'ofx_bankid', label: 'Código do banco no OFX (BANKID)', placeholder: 'Ex: 237 (Bradesco)' },
];


export default function AccountsSettings({ onBack }: { onBack?: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<any>('accounts');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      )}

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
        onSave={data => {
          // Data-base vazia precisa virar nulo (string vazia não é data válida).
          const payload = { ...data, initial_balance_date: data.initial_balance_date || null };
          return editing ? update(editing.id, payload) : create(payload);
        }}
      />
    </div>
  );
}
