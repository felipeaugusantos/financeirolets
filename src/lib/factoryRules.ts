// Ficha técnica, sugestão de produção e custo de pedidos. Só planejamento: não lança no financeiro.
export interface Ingredient { id: string; name: string; unit: string; package_size: number; package_cost: number }
export interface RecipeItem { ingredient_id: string; quantity: number }
export interface Recipe { product_id: string; yield_units: number; items: RecipeItem[] }
export interface Forecast { unit_id: string; product_id: string; quantity: number }

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Custo de 1 unidade de medida do ingrediente (ex.: R$ por grama). */
export const ingredientCostPerUnit = (i: Ingredient) => (Number(i.package_size) > 0 ? Number(i.package_cost) / Number(i.package_size) : 0);

/** Custo da receita inteira e de cada unidade produzida (receita ÷ rendimento). */
export function recipeCost(recipe: Recipe, ingredients: Ingredient[]) {
  const map = new Map(ingredients.map(i => [i.id, i]));
  const total = recipe.items.reduce((s, it) => { const ing = map.get(it.ingredient_id); return s + (ing ? ingredientCostPerUnit(ing) * Number(it.quantity) : 0); }, 0);
  const y = Number(recipe.yield_units) > 0 ? Number(recipe.yield_units) : 1;
  return { total: r2(total), perUnit: r4(total / y) };
}

/** Soma a previsão por produto, calcula receitas necessárias e ingredientes a separar/comprar. */
export function productionPlan(forecasts: Forecast[], recipes: Recipe[], ingredients: Ingredient[]) {
  const byProduct = new Map<string, number>();
  forecasts.forEach(f => byProduct.set(f.product_id, (byProduct.get(f.product_id) ?? 0) + Number(f.quantity)));
  const recipeMap = new Map(recipes.map(r => [r.product_id, r]));
  const needs = new Map<string, number>();
  const products = [...byProduct].map(([product_id, units]) => {
    const rec = recipeMap.get(product_id);
    if (!rec) return { product_id, units, batches: 0, cost: 0, missingRecipe: true };
    const y = Number(rec.yield_units) > 0 ? Number(rec.yield_units) : 1;
    const batches = units / y;
    rec.items.forEach(it => needs.set(it.ingredient_id, (needs.get(it.ingredient_id) ?? 0) + Number(it.quantity) * batches));
    return { product_id, units, batches: r2(batches), cost: r2(recipeCost(rec, ingredients).perUnit * units), missingRecipe: false };
  });
  const map = new Map(ingredients.map(i => [i.id, i]));
  const shopping = [...needs].map(([ingredient_id, qty]) => {
    const ing = map.get(ingredient_id);
    const packages = ing && Number(ing.package_size) > 0 ? Math.ceil(r4(qty / Number(ing.package_size))) : 0;
    return { ingredient_id, name: ing?.name ?? '—', unit: ing?.unit ?? '', quantity: r2(qty), packages, cost: r2(ing ? ingredientCostPerUnit(ing) * qty : 0) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { products, shopping, totalCost: r2(products.reduce((s, p) => s + p.cost, 0)) };
}

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

/** Custo real a partir de uma compra do Contas a Pagar: valor pago ÷ quantidade comprada (na medida do ingrediente). */
export function purchaseToIngredient(amount: number, quantityBought: number) {
  if (!(quantityBought > 0) || !(amount >= 0)) return null;
  return { package_size: quantityBought, package_cost: r2(amount), costPerUnit: r4(amount / quantityBought) };
}

/** Demanda dos pedidos para a fornada: cookies por unidade e produto (caixas × cookies por caixa). */
export function ordersDemand(orders: { unit_id: string; items: { product_id: string; packages: number; cookies_per_package: number }[] }[]): Forecast[] {
  const map = new Map<string, Forecast>();
  orders.forEach(o => o.items.forEach(it => {
    const k = `${o.unit_id}|${it.product_id}`;
    const f = map.get(k) ?? { unit_id: o.unit_id, product_id: it.product_id, quantity: 0 };
    f.quantity += Number(it.packages) * Number(it.cookies_per_package);
    map.set(k, f);
  }));
  return [...map.values()];
}

/** Custo real da fornada: ingredientes consumidos (boas + perdidas) ao custo atual da ficha; custo por cookie bom. */
export function batchRealCost(perUnit: number, produced: number, lost: number) {
  const total = r2(perUnit * (Number(produced) + Number(lost)));
  return { total, perGoodUnit: Number(produced) > 0 ? r4(total / Number(produced)) : 0 };
}

/** Resumo das fornadas: produzido, perdas, custo e % de perda (só concluídas contam). */
export function batchesSummary(batches: { status: string; produced_units: number; lost_units: number; real_cost: number; planned_units: number }[]) {
  const done = batches.filter(b => b.status === 'concluida');
  const produced = done.reduce((s, b) => s + Number(b.produced_units), 0);
  const lost = done.reduce((s, b) => s + Number(b.lost_units), 0);
  const cost = r2(done.reduce((s, b) => s + Number(b.real_cost), 0));
  return { done: done.length, open: batches.filter(b => b.status === 'planejada' || b.status === 'produzindo').length, produced, lost, cost,
    lossPct: produced + lost ? r2((lost / (produced + lost)) * 100) : 0, perUnit: produced ? r4(cost / produced) : 0 };
}
