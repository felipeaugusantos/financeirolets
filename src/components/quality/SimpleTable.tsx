import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QualityTx } from '@/hooks/useDataQuality';
import { fmt, fmtDate } from './qualityFormat';

export function SimpleTable({ items, limit = 50 }: { items: QualityTx[]; limit?: number }) {
  if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento nesta condição.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Competência</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-[10px]">ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.slice(0, limit).map((t) => (
            <TableRow key={t.id}>
              <TableCell className="whitespace-nowrap">{fmtDate(t.competence_date)}</TableCell>
              <TableCell className="max-w-[280px] truncate">{t.description}</TableCell>
              <TableCell>{t.type}</TableCell>
              <TableCell>{t.status}</TableCell>
              <TableCell className="text-right">{fmt(t.net_amount)}</TableCell>
              <TableCell className="text-[10px] text-muted-foreground">{t.id.slice(0, 8)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length > limit && (
        <p className="p-3 text-xs text-muted-foreground">Mostrando {limit} de {items.length}. Use o CSV para a lista completa.</p>
      )}
    </div>
  );
}
