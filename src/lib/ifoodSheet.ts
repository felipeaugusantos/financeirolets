// Leitura da planilha financeira exportada do Portal do Parceiro iFood (CSV/Excel).
// Reconhece o cabeçalho pelos nomes mais comuns das colunas; não grava nada.
export interface IfoodSheetOrder {
  orderId: string;
  orderedAt: string | null; // AAAA-MM-DD
  status: string;
  gross: number;
  commission: number;
  paymentFee: number;
  deliveryFee: number;
  merchantPromo: number;
  ifoodPromo: number;
  net: number;
  payoutDate: string | null;
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const ALIASES: Record<keyof IfoodSheetOrder, string[]> = {
  orderId: ['id do pedido', 'numero do pedido', 'n do pedido', 'pedido', 'id pedido', 'codigo do pedido'],
  orderedAt: ['data do pedido', 'data pedido', 'data', 'data da venda'],
  status: ['status', 'status do pedido', 'situacao'],
  gross: ['valor bruto', 'valor dos itens', 'total do pedido', 'valor total', 'faturamento', 'valor do pedido'],
  commission: ['comissao', 'comissao ifood', 'taxa de comissao'],
  paymentFee: ['taxa de transacao', 'taxa de pagamento', 'taxa transacao', 'taxa de servico'],
  deliveryFee: ['taxa de entrega', 'entrega'],
  merchantPromo: ['promocao loja', 'promocao da loja', 'incentivo loja', 'desconto loja', 'promocoes loja'],
  ifoodPromo: ['promocao ifood', 'incentivo ifood', 'desconto ifood', 'promocoes ifood'],
  net: ['valor liquido', 'liquido', 'repasse', 'valor do repasse', 'valor a receber'],
  payoutDate: ['data do repasse', 'data prevista', 'data de pagamento', 'previsao de repasse', 'data repasse'],
};

export function parseMoney(v: unknown): number {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  let s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : 0;
}

export function parseSheetDate(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseIfoodSheet(rows: unknown[][]): { orders: IfoodSheetOrder[]; missing: string[] } {
  const hIdx = rows.findIndex((r) => {
    const cells = r.map(norm);
    return cells.some((c) => ALIASES.orderId.includes(c)) && cells.some((c) => ALIASES.gross.includes(c) || ALIASES.net.includes(c));
  });
  if (hIdx < 0) return { orders: [], missing: ['cabeçalho com pedido e valor'] };
  const header = rows[hIdx].map(norm);
  const col = {} as Record<keyof IfoodSheetOrder, number>;
  for (const k of Object.keys(ALIASES) as (keyof IfoodSheetOrder)[]) {
    col[k] = ALIASES[k].map((a) => header.indexOf(a)).find((i) => i >= 0) ?? -1;
  }
  const missing = (['gross', 'net'] as const).filter((k) => col[k] < 0).map((k) => (k === 'gross' ? 'valor bruto' : 'valor líquido'));
  const orders: IfoodSheetOrder[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(hIdx + 1)) {
    const id = String(r[col.orderId] ?? '').trim();
    if (!id || seen.has(id) || /^total/i.test(id)) continue;
    seen.add(id);
    const g = (k: keyof IfoodSheetOrder) => (col[k] >= 0 ? Math.abs(parseMoney(r[col[k]])) : 0);
    const gross = g('gross');
    const commission = g('commission'), paymentFee = g('paymentFee'), merchantPromo = g('merchantPromo');
    orders.push({
      orderId: id,
      orderedAt: col.orderedAt >= 0 ? parseSheetDate(r[col.orderedAt]) : null,
      status: col.status >= 0 ? String(r[col.status] ?? '').trim() : 'CONCLUDED',
      gross, commission, paymentFee, merchantPromo,
      deliveryFee: g('deliveryFee'),
      ifoodPromo: g('ifoodPromo'),
      net: col.net >= 0 ? parseMoney(r[col.net]) : Math.round((gross - commission - paymentFee - merchantPromo) * 100) / 100,
      payoutDate: col.payoutDate >= 0 ? parseSheetDate(r[col.payoutDate]) : null,
    });
  }
  return { orders, missing };
}
