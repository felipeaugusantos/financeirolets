import { describe, it, expect } from 'vitest';
import { contractClauses } from '@/lib/contractPdf';
const base = { contratante: { name: 'ACME' }, contratado: { name: "Let's Cookies" }, eventTitle: 'Coffee', eventDate: '2026-11-25', location: 'Sede', value: 1500, paymentTerms: 'PIX', scope: '', city: 'São Paulo', issueDate: '2026-11-15' };
describe('contrato por evento', () => {
  it('inclui data, valor e pagamento', () => { const t = contractClauses(base).join(' '); expect(t).toContain('25/11/2026'); expect(t).toContain('1.500,00'); expect(t).toContain('PIX'); });
  it('foro é a última cláusula e condições extras entram antes', () => { const c = contractClauses({ ...base, extraClauses: 'Montagem 1h antes' }); expect(c[5]).toContain('Montagem'); expect(c[6]).toContain('CLÁUSULA 7 – FORO'); });
});
