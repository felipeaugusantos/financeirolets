import { describe, it, expect } from 'vitest';
import { discoverySchema, fromCnpj, fromPlace, duplicateCompany, companyImport } from '../../supabase/functions/crm-discovery/rules';

const candidate = fromCnpj({ cnpj: '12345678000195', razao_social: 'Empresa SA', nome_fantasia: 'Empresa', logradouro: 'Rua A', numero: '10', municipio: 'Ribeirão Preto', uf: 'SP', ddd_telefone_1: '16999999999', email: 'contato@empresa.com', cnae_fiscal_descricao: 'Escritórios', qsa: [{ nome_socio: 'Não importar' }] });
const unit = '11111111-1111-4111-8111-111111111111';
describe('Descoberta comercial sem lançamentos financeiros', () => {
  it('consulta CNPJ formatado como cadastro único de 14 dígitos', () => {
    expect(discoverySchema.parse({ mode: 'cnpj', cnpj: '12.345.678/0001-95', unitId: unit })).toEqual({ mode: 'cnpj', cnpj: '12345678000195', unitId: unit });
    expect(discoverySchema.safeParse({ mode: 'cnpj', cnpj: '123', unitId: unit }).success).toBe(false);
  });
  it('exige localização, segmento limitado e unidade válida', () => {
    expect(discoverySchema.safeParse({ mode: 'location', segment: 'Clínicas', location: '', unitId: unit }).success).toBe(false);
    expect(discoverySchema.safeParse({ mode: 'location', segment: 'a'.repeat(101), location: 'São Paulo', unitId: unit }).success).toBe(false);
    expect(discoverySchema.safeParse({ mode: 'location', segment: 'Clínicas', location: 'São Paulo', unitId: 'invalid' }).success).toBe(false);
  });
  it('preenche nome, CNPJ, endereço e contatos sem importar dados pessoais dos sócios', () => {
    expect(candidate).toMatchObject({ name: 'Empresa', document: '12345678000195', address: 'Rua A, 10, Ribeirão Preto, SP', phone: '16999999999', email: 'contato@empresa.com', source: 'brasilapi' });
    expect(candidate).not.toHaveProperty('qsa');
  });
  it('Google Maps não inventa CNPJ ou e-mail', () => {
    expect(fromPlace({ id: 'place1', displayName: { text: 'Clínica' }, formattedAddress: 'Rua B' })).toMatchObject({ external_id: 'google:place1', name: 'Clínica', document: null, email: null });
    expect(fromPlace({ id: 'place1' })).toBeNull();
  });
  it('deduplica por CNPJ ou identificador público dentro da mesma carteira e unidade', () => {
    const row = { id: 'existing', unit_id: unit, owner_id: 'owner', document: '12.345.678/0001-95', external_id: null };
    expect(duplicateCompany(candidate, [row], unit, 'owner')?.id).toBe('existing');
    expect(duplicateCompany(candidate, [row], unit, 'other')).toBeUndefined();
    expect(duplicateCompany(candidate, [{ ...row, document: null, external_id: candidate.external_id }], unit, 'owner')?.id).toBe('existing');
  });
  it('importa somente empresa com interesse coffee break e situação novo; não gera receita ou oportunidade', () => {
    const row = companyImport(candidate, unit, 'owner', 'coffee_break');
    expect(row).toMatchObject({ unit_id: unit, owner_id: 'owner', interest: 'coffee_break', status: 'novo', external_id: 'cnpj:12345678000195' });
    expect(Object.keys(row).sort()).toEqual(['address','document','email','external_id','interest','name','notes','owner_id','phone','segment','source','status','unit_id']);
    expect(() => companyImport(candidate, unit, 'owner', 'franquia')).toThrow();
  });
});