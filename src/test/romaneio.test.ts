import { describe, it, expect } from 'vitest';
import { groupRomaneio } from '@/lib/romaneioPdf';
describe('romaneio', () => {
  it('agrupa por unidade somando caixas e cookies', () => {
    const s = groupRomaneio([
      { id: '1', unit: 'Loja B', customer: 'X', deliveryDate: null, items: [{ product: 'A', packages: 2, cookiesPerPackage: 6 }] },
      { id: '2', unit: 'Loja A', customer: 'Y', deliveryDate: null, items: [{ product: 'A', packages: 1, cookiesPerPackage: 6 }] },
      { id: '3', unit: 'Loja B', customer: 'Z', deliveryDate: null, items: [{ product: 'C', packages: 3, cookiesPerPackage: 4 }] },
    ]);
    expect(s.map(x => x.unit)).toEqual(['Loja A', 'Loja B']);
    expect(s[1]).toMatchObject({ packages: 5, cookies: 24 });
  });
});
