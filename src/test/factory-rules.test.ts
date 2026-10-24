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

import { purchaseToIngredient } from '@/lib/factoryRules';
describe('Custo real pela compra', () => {
  it('conta de R$ 250 por 50 kg de farinha = R$ 0,005 por grama', () => {
    expect(purchaseToIngredient(250, 50000)).toEqual({ package_size: 50000, package_cost: 250, costPerUnit: 0.005 });
    expect(purchaseToIngredient(250, 0)).toBeNull();
  });
});

import { batchRealCost, batchesSummary } from '@/lib/factoryRules';
describe('Fornadas', () => {
  it('custo real conta as perdas e divide pelos cookies bons', () => {
    expect(batchRealCost(1.25, 90, 10)).toEqual({ total: 125, perGoodUnit: 1.3889 });
  });
  it('resumo só soma fornadas concluídas', () => {
    expect(batchesSummary([
      { status: 'concluida', produced_units: 90, lost_units: 10, real_cost: 125, planned_units: 100 },
      { status: 'produzindo', produced_units: 0, lost_units: 0, real_cost: 0, planned_units: 50 },
    ])).toEqual({ done: 1, open: 1, produced: 90, lost: 10, cost: 125, lossPct: 10, perUnit: 1.3889 });
  });
});
