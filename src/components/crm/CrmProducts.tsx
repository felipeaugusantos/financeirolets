import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, type ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, type FieldConfig, type FormValues } from '@/components/settings/CrudDialog';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'crm_products'>;
const money = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const packages = [{ value: 'unidade', label: 'Unidade' }, { value: 'caixa', label: 'Caixa' }, { value: 'pacote', label: 'Pacote' }, { value: 'kit', label: 'Kit' }];

const fields: FieldConfig[] = [
  { name: 'name', label: 'Nome do produto', required: true },
  { name: 'code', label: 'Código' },
  { name: 'flavor_type', label: 'Tipo / sabor (ex.: tradicional, recheado, vegano)' },
  { name: 'package', label: 'Embalagem', type: 'select', required: true, options: packages },
  { name: 'cookies_per_package', label: 'Cookies por embalagem', type: 'number', required: true },
  { name: 'price', label: 'Preço de venda (R$)', type: 'number', required: true },
  { name: 'weight_grams', label: 'Peso (g)', type: 'number' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

export function CrmProducts() {
  const products = useSupabaseCrud<Product>('crm_products', 'name');
  const { toast } = useToast();
  const [editor, setEditor] = useState<FormValues | null>(null);

  const columns: ColumnConfig<Product>[] = [
    { key: 'name', label: 'Produto' },
    { key: 'flavor_type', label: 'Tipo' },
    { key: 'package', label: 'Embalagem', render: (v: string, p) => `${packages.find(x => x.value === v)?.label ?? v} · ${p.cookies_per_package} un.` },
    { key: 'price', label: 'Preço', render: (v: number) => money(v) },
  ];

  const save = async (raw: FormValues): Promise<boolean | string> => {
    const price = Number(raw.price), per = Number(raw.cookies_per_package);
    if (!String(raw.name ?? '').trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(per) || per < 1) {
      toast({ title: 'Confira nome, preço e cookies por embalagem', variant: 'destructive' }); return false;
    }
    const row: FormValues = { ...Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === '' ? null : v])), price, cookies_per_package: per, weight_grams: raw.weight_grams ? Number(raw.weight_grams) : null };
    const id = editor?.id;
    return typeof id === 'string' ? products.update(id, row) : products.create(row);
  };

  return <>
    <CrudTable title="Produtos (tipos de cookies)" columns={columns} data={products.data.filter(p => p.active)} loading={products.loading} hasActive={false}
      onAdd={() => setEditor({ package: 'caixa', cookies_per_package: 1, price: 0 })} onEdit={p => setEditor({ ...p })}
      onDelete={id => { if (window.confirm('Arquivar este produto?')) void products.update(id, { active: false }); }} />
    {editor && <CrudDialog open onClose={() => setEditor(null)} title={editor.id ? 'Editar produto' : 'Novo produto'} fields={fields} initialData={editor} onSave={save} />}
  </>;
}
