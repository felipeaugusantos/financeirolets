import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { PreparedCardRow } from '@/lib/cardSheet';

const NONE = '__none__';
const SELECT_CLASS = 'h-8 w-full min-w-[9rem] rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50';
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const cardText = (c: string) => (/^\d{4}$/.test(c) ? `•••• ${c}` : c);

export interface CardDraft {
  row: PreparedCardRow;
  exists: boolean;
  include: boolean;
  unit_id: string | null;
  category_id: string | null;
  cats: { id: string; name: string }[];
}

interface Props {
  drafts: CardDraft[];
  units: { id: string; name: string }[];
  onEdit: (key: string, patch: { include?: boolean; unit_id?: string | null; category_id?: string | null }) => void;
  onToggleAll: (include: boolean) => void;
}

/** Tabela do pré-lançamento da fatura: só exibe e repassa ajustes; nada é gravado aqui. */
export default function CardDraftTable({ drafts, units, onEdit, onToggleAll }: Props) {
  return (
            <div className="min-h-0 flex-1 px-6 py-3 text-sm">
              <div className="h-full overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 px-2 w-8">
                        <Checkbox
                          aria-label="Marcar todas"
                          checked={drafts.some(d => !d.exists) && drafts.filter(d => !d.exists).every(d => d.include)}
                          onCheckedChange={v => onToggleAll(!!v)}
                        />
                      </th>
                      <th className="py-2 px-2 font-medium">Data</th>
                      <th className="py-2 px-2 font-medium">Descrição</th>
                      <th className="py-2 px-2 font-medium text-right">Valor</th>
                      <th className="py-2 px-2 font-medium">Unidade</th>
                      <th className="py-2 px-2 font-medium">Categoria</th>
                      <th className="py-2 px-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map(d => {
                      const key = d.row.hashKey;
                      const falta = d.include && (!d.unit_id || !d.category_id);
                      return (
                        <tr key={key} className={`border-b border-border/60 last:border-0 ${d.exists ? 'opacity-50' : ''}`}>
                          <td className="py-1.5 px-2">
                            <Checkbox
                              disabled={d.exists}
                              checked={d.include}
                              onCheckedChange={v => onEdit(key, { include: !!v })}
                              aria-label={`Incluir ${d.row.description}`}
                            />
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">{br(d.row.posted_at)}</td>
                          <td className="py-1.5 px-2">
                            <span className="block truncate max-w-[260px]">{d.row.description}</span>
                            <span className="text-[10px] text-muted-foreground">{cardText(d.row.card ?? '')}</span>
                          </td>
                          <td className={`py-1.5 px-2 text-right font-medium whitespace-nowrap ${d.row.amount >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                            {brl(d.row.amount)}
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              aria-label={`Unidade de ${d.row.description}`}
                              disabled={!d.include}
                              className={SELECT_CLASS}
                              value={d.unit_id ?? NONE}
                              onChange={e => onEdit(key, { unit_id: e.target.value === NONE ? null : e.target.value })}
                            >
                              <option value={NONE}>Sem unidade</option>
                              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              aria-label={`Categoria de ${d.row.description}`}
                              disabled={!d.include}
                              className={SELECT_CLASS}
                              value={d.category_id ?? NONE}
                              onChange={e => onEdit(key, { category_id: e.target.value === NONE ? null : e.target.value })}
                            >
                              <option value={NONE}>Sem categoria</option>
                              {d.cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            {d.exists
                              ? <Badge variant="outline" className="text-[10px]">Já importada</Badge>
                              : !d.include
                                ? <Badge variant="outline" className="text-[10px]">Ignorada</Badge>
                                : falta
                                  ? <Badge variant="outline" className="text-[10px] text-destructive">Falta unidade/categoria</Badge>
                                  : <Badge className="text-[10px]">Pronta</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
  );
}
