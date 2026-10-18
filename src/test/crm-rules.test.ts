import { describe, expect, it } from 'vitest';
import { crmConversion, normalizeCompanyDocument, validateCrmStage } from '@/lib/crmRules';

describe('CRM commercial rules', () => {
  it('conversion excludes open opportunities: 3 won and 1 lost means 75%', () => {
    expect(crmConversion(3, 1)).toBe(0.75);
  });
  it('no closed opportunities means no conversion data', () => {
    expect(crmConversion(0, 0)).toBeNull();
  });
  it('loss requires a reason', () => {
    expect(validateCrmStage('perdida', '  ')).toBe(false);
    expect(validateCrmStage('perdida', 'Data indisponível')).toBe(true);
  });
  it('normalizes company document before duplicate comparison', () => {
    expect(normalizeCompanyDocument('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizeCompanyDocument('')).toBeNull();
  });
});