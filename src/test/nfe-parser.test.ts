// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseNfeXml, isValidAccessKey } from '@/lib/nfeParser';

const KEY = '35261012345678000199550010000012341000012345';
const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${KEY}">
<ide><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-10-15T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>Moinho Farinha</xNome></emit>
<dest><CNPJ>98765432000100</CNPJ><xNome>Lets Cookies</xNome></dest>
<det nItem="1"/><det nItem="2"/>
<total><ICMSTot><vNF>1500.50</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-11-15</dVenc><vDup>750.25</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-15</dVenc><vDup>750.25</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

describe('parseNfeXml', () => {
  it('lê chave, emitente, total e parcelas', () => {
    const n = parseNfeXml(xml);
    expect(n.accessKey).toBe(KEY);
    expect(n.issuerName).toBe('Moinho Farinha');
    expect(n.total).toBe(1500.5);
    expect(n.issueDate).toBe('2026-10-15');
    expect(n.duplicates).toHaveLength(2);
    expect(n.duplicates[1].dueDate).toBe('2026-12-15');
    expect(n.itemCount).toBe(2);
  });
  it('recusa arquivo que não é NF-e', () => {
    expect(() => parseNfeXml('<foo/>')).toThrow();
  });
  it('valida chave de 44 dígitos', () => {
    expect(isValidAccessKey(KEY)).toBe(true);
    expect(isValidAccessKey('123')).toBe(false);
  });
});
