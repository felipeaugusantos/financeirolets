
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Tables } from '@/integrations/supabase/types';

const columns: ColumnConfig<Tables<'accounts'>>[] = [
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

/** Campo extra: unidade padrão desta conta, usada pelas regras de conciliação. */
function buildFields(units: { id: string; name: string }[]): FieldConfig[] {
  return [
    ...fields,
    {
      name: 'default_unit_id',
      label: 'Unidade padrão desta conta',
      type: 'select',
      options: units.map(u => ({ value: u.id, label: u.name })),
      hint: 'Usada pelas regras de conciliação marcadas como "unidade da conta do extrato".',
    },
  ];
}


export default function AccountsSettings({ onBack }: { onBack?: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<Tables<'accounts'>>('accounts');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<'accounts'> | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('units').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setUnits((data ?? [])));
  }, []);

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
        fields={buildFields(units)}
        initialData={editing}
        onSave={data => {
          // Data-base vazia precisa virar nulo (string vazia não é data válida).
          const payload = {
            ...data,
            initial_balance_date: data.initial_balance_date || null,
            default_unit_id: data.default_unit_id || null,
          } as Partial<Tables<'accounts'>>;
          return editing ? update(editing.id, payload) : create(payload);
        }}
      />
    </div>
  );
}
