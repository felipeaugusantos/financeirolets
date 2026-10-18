// Leitura de XML de NF-e/NFC-e (modelos 55 e 65). Apenas leitura — não grava nada.
export interface NfeDuplicate {
  number: string;
  dueDate: string | null;
  amount: number;
}

export interface ParsedNfe {
  accessKey: string;
  model: string;
  number: string;
  series: string;
  issueDate: string | null;
  issuerName: string;
  issuerDocument: string;
  recipientName: string;
  recipientDocument: string;
  total: number;
  duplicates: NfeDuplicate[];
  itemCount: number;
}

const txt = (root: Element | Document | null | undefined, tag: string): string =>
  root?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

export function parseNfeXml(xml: string): ParsedNfe {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido');
  const inf = doc.getElementsByTagName('infNFe')[0];
  if (!inf) throw new Error('O arquivo não é uma NF-e/NFC-e');

  const ide = inf.getElementsByTagName('ide')[0];
  const emit = inf.getElementsByTagName('emit')[0];
  const dest = inf.getElementsByTagName('dest')[0];
  const accessKey = (inf.getAttribute('Id') ?? '').replace(/^NFe/, '') || txt(doc, 'chNFe');
  const issue = txt(ide, 'dhEmi') || txt(ide, 'dEmi');

  const duplicates = Array.from(inf.getElementsByTagName('dup')).map((d) => ({
    number: txt(d, 'nDup'),
    dueDate: txt(d, 'dVenc') || null,
    amount: Number(txt(d, 'vDup')) || 0,
  }));

  return {
    accessKey,
    model: txt(ide, 'mod'),
    number: txt(ide, 'nNF'),
    series: txt(ide, 'serie'),
    issueDate: issue ? issue.slice(0, 10) : null,
    issuerName: txt(emit, 'xNome'),
    issuerDocument: txt(emit, 'CNPJ') || txt(emit, 'CPF'),
    recipientName: txt(dest, 'xNome'),
    recipientDocument: txt(dest, 'CNPJ') || txt(dest, 'CPF'),
    total: Number(txt(inf.getElementsByTagName('ICMSTot')[0], 'vNF')) || 0,
    duplicates,
    itemCount: inf.getElementsByTagName('det').length,
  };
}

export function isValidAccessKey(key: string): boolean {
  return /^\d{44}$/.test(key);
}
