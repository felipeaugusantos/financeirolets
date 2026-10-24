import { describe, it, expect } from 'vitest';
import { recipeCost, productionPlan, productPackageCost, orderLinesTotals } from '@/lib/factoryRules';

const ings = [
  { id: 'farinha', name: 'Farinha', unit: 'g', package_size: 1000, package_cost: 5 },
  { id: 'choc', name: 'Chocolate', unit: 'g', package_size: 1000, package_cost: 40 },
];
const recipe = { product_id: 'trad', yield_units: 20, items: [{ ingredient_id: 'farinha', quantity: 1000 }, { ingredient_id: 'choc', quantity: 500 }] };

describe('Ficha técnica', () => {
  it('custo da receita e por unidade', () => {
    expect(recipeCost(recipe, ings)).toEqual({ total: 25, perUnit: 1.25 });
  });
  it('soma a previsão das unidades e calcula ingredientes e embalagens a comprar', () => {
    const p = productionPlan([{ unit_id: 'a', product_id: 'trad', quantity: 30 }, { unit_id: 'b', product_id: 'trad', quantity: 20 }, { unit_id: 'a', product_id: 'x', quantity: 5 }], [recipe], ings);
    expect(p.products.find(x => x.product_id === 'trad')).toMatchObject({ units: 50, batches: 2.5, cost: 62.5 });
    expect(p.products.find(x => x.product_id === 'x')?.missingRecipe).toBe(true);
    expect(p.shopping.find(s => s.ingredient_id === 'farinha')).toMatchObject({ quantity: 2500, packages: 3, cost: 12.5 });
    expect(p.totalCost).toBe(62.5);
  });
});

describe('Pedido com produtos', () => {
  it('custo da caixa vem da ficha técnica', () => {
    expect(productPackageCost({ id: 'trad', cookies_per_package: 6 }, [recipe], ings)).toBe(7.5);
    expect(productPackageCost({ id: 'sem', cookies_per_package: 6 }, [recipe], ings)).toBeNull();
  });
  it('soma caixas, cookies, total e margem', () => {
    expect(orderLinesTotals([{ packages: 10, cookies_per_package: 6, unit_price: 30, unit_cost: 7.5 }, { packages: 2, cookies_per_package: 12, unit_price: 50, unit_cost: 15 }]))
      .toEqual({ boxes: 12, cookies: 84, total: 400, cost: 105, margin: 295, marginPct: 73.75 });
  });
});
