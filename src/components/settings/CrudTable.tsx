
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export interface ColumnConfig {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface CrudTableProps {
  columns: ColumnConfig[];
  data: any[];
  loading: boolean;
  onEdit: (row: any) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (id: string, active: boolean) => void;
  onAdd: () => void;
  title: string;
  hasActive?: boolean;
}

export function CrudTable({ columns, data, loading, onEdit, onDelete, onToggleActive, onAdd, title, hasActive = true }: CrudTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-card-foreground">{title}</h2>
        <Button onClick={onAdd} size="sm" className="rounded-xl gap-1.5">
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>
      <div className="rounded-2xl border border-border overflow-hidden shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {columns.map(c => <TableHead key={c.key} className="font-heading text-xs">{c.label}</TableHead>)}
              {hasActive && <TableHead className="font-heading text-xs w-20">Status</TableHead>}
              <TableHead className="font-heading text-xs w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
            ) : data.map(row => (
              <TableRow key={row.id}>
                {columns.map(c => (
                  <TableCell key={c.key} className="text-sm">
                    {c.render ? c.render(row[c.key], row) : row[c.key]}
                  </TableCell>
                ))}
                {hasActive && (
                  <TableCell>
                    <Badge
                      variant={row.active ? 'default' : 'secondary'}
                      className="cursor-pointer rounded-full text-xs"
                      onClick={() => onToggleActive?.(row.id, row.active)}
                    >
                      {row.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(row.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
