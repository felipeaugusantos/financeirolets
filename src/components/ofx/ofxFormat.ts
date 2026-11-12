import { todayLocalISO } from '@/lib/utils';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const br = (iso: string) => iso.split('-').reverse().join('/');
export const NONE = '__none__';

export function firstDayOfMonth(): string {
  const t = todayLocalISO();
  return `${t.slice(0, 7)}-01`;
}

export const confidenceStyle: Record<string, string> = {
  alta: 'bg-secondary/15 text-secondary border-secondary/30',
  media: 'bg-accent/15 text-accent border-accent/30',
  baixa: 'bg-muted text-muted-foreground border-border',
};

export const basisLabel: Record<string, string> = {
  exato: 'valor exato',
  liquido: 'líquido/impostos',
  taxa: 'taxa de adquirente',
  juros: 'juros ou multa',
  aproximado: 'arredondamento',
  bruto: 'valor bruto',
};
