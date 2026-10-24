
/** Custo de fábrica de 1 embalagem do produto: custo por cookie da ficha × cookies por embalagem. */
export function productPackageCost(product: { id: string; cookies_per_package: number }, recipes: Recipe[], ingredients: Ingredient[]) {
  const rec = recipes.find(r => r.product_id === product.id);
  if (!rec) return null;
  return r2(recipeCost(rec, ingredients).perUnit * Number(product.cookies_per_package || 1));
}

export interface OrderLine { packages: number; cookies_per_package: number; unit_price: number; unit_cost: number }
/** Totais do pedido a partir das linhas: caixas, cookies, valor, custo de fábrica e margem. */
export function orderLinesTotals(lines: OrderLine[]) {
  const boxes = lines.reduce((s, l) => s + Number(l.packages), 0);
  const cookies = lines.reduce((s, l) => s + Number(l.packages) * Number(l.cookies_per_package), 0);
  const total = r2(lines.reduce((s, l) => s + Number(l.packages) * Number(l.unit_price), 0));
  const cost = r2(lines.reduce((s, l) => s + Number(l.packages) * Number(l.unit_cost), 0));
  return { boxes, cookies, total, cost, margin: r2(total - cost), marginPct: total ? r2(((total - cost) / total) * 100) : 0 };
}
