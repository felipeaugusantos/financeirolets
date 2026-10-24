
import { productPackageCost, orderLinesTotals } from '@/lib/factoryRules';
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
