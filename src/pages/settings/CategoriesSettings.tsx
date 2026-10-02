
import { useState, useEffect } from 'react';
import { useSupabaseCrud } from '@/hooks/useSupabaseCrud';
import { CrudTable, ColumnConfig } from '@/components/settings/CrudTable';
import { CrudDialog, type FormValues, FieldConfig } from '@/components/settings/CrudDialog';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export default function CategoriesSettings({ onBack }: { onBack: () => void }) {
  const { data, loading, create, update, remove, toggleActive } = useSupabaseCrud<Tables<'categories'>>('categories');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<'categories'> | null>(null);
  const [dreLines, setDreLines] = useState<Pick<Tables<'dre_lines'>, 'id' | 'name' | 'code'>[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('dre_lines').select('id, name, code').neq('view_scope', 'contabil').order('sort_order').then(({ data }) => {
      setDreLines(data ?? []);
    });
  }, []);

  const columns: ColumnConfig<Tables<'categories'>>[] = [
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
      const parent = data.find((c) => c.id === v);
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
      { value: '__none__', label: 'Nenhuma (raiz)' },
      ...data.map((c) => ({ value: c.id, label: c.name })),
    ]},
    { name: 'dre_line_id', label: 'Linha do DRE', type: 'select', options: [
      { value: '__none__', label: 'Nenhuma' },
      ...dreLines.map(l => ({ value: l.id, label: `${l.code} - ${l.name}` })),
    ]},
    { name: 'sort_order', label: 'Ordem', type: 'number', placeholder: '0' },
  ];

  const handleSave = async (formData: FormValues) => {
    const clean = { ...formData };
    if (!clean.parent_id || clean.parent_id === '__none__') clean.parent_id = null;
    if (!clean.dre_line_id || clean.dre_line_id === '__none__') clean.dre_line_id = null;
    if (!clean.sort_order) clean.sort_order = 0;
    return editing ? update(editing.id, clean) : create(clean);
  };

  const term = search.trim().toLowerCase();
  const filtered = term
    ? data.filter((c) => {
        const line = dreLines.find(l => l.id === c.dre_line_id);
        const parent = data.find((p) => p.id === c.parent_id);
        return [
          c.name,
          c.type === 'receita' ? 'receita' : 'despesa',
          line ? `${line.code} ${line.name}` : '',
          parent?.name ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
    : data;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, tipo, linha do DRE ou categoria pai..."
          className="pl-9 rounded-xl"
        />
      </div>
      {term && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {data.length} categoria(s)
        </p>
      )}
      <CrudTable
        title="Categorias"
        columns={columns}
        data={filtered}
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
