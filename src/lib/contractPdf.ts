import jsPDF from 'jspdf';

export interface ContractParty { name: string; document?: string; address?: string; representative?: string }
export interface ContractData {
  contratante: ContractParty; contratado: ContractParty;
  eventTitle: string; eventDate: string; eventTime?: string | null; location: string;
  attendees?: number; value: number; paymentTerms: string; scope: string; extraClauses?: string; city: string; issueDate: string;
}
const br = (iso: string) => iso.split('-').reverse().join('/');
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const party = (p: ContractParty) => [p.name, p.document && `CPF/CNPJ ${p.document}`, p.address && `com endereço em ${p.address}`, p.representative && `neste ato representada por ${p.representative}`].filter(Boolean).join(', ');

export function contractClauses(d: ContractData): string[] {
  const c = [
    `CLÁUSULA 1 – OBJETO. O CONTRATADO prestará serviços de fornecimento para o evento "${d.eventTitle}", em ${br(d.eventDate)}${d.eventTime ? ` às ${d.eventTime}` : ''}, no local ${d.location}${d.attendees ? `, para ${d.attendees} pessoas` : ''}.`,
    `CLÁUSULA 2 – ESCOPO. ${d.scope || 'Conforme proposta comercial aceita pelo CONTRATANTE.'}`,
    `CLÁUSULA 3 – PREÇO E PAGAMENTO. O CONTRATANTE pagará ${money(d.value)}, na condição: ${d.paymentTerms}.`,
    'CLÁUSULA 4 – ALTERAÇÕES E CANCELAMENTO. Alterações de quantidade, data ou local devem ser comunicadas por escrito e estão sujeitas a disponibilidade e reajuste. Cancelamentos seguem as condições acordadas entre as partes.',
    'CLÁUSULA 5 – OBRIGAÇÕES. O CONTRATANTE garantirá acesso ao local no horário combinado; o CONTRATADO entregará os itens em condições adequadas de higiene e qualidade.',
  ];
  if (d.extraClauses?.trim()) c.push(`CLÁUSULA 6 – CONDIÇÕES ESPECÍFICAS. ${d.extraClauses.trim()}`);
  c.push(`CLÁUSULA ${c.length + 1} – FORO. Fica eleito o foro da comarca de ${d.city} para dirimir questões deste contrato.`);
  return c;
}

export function buildContractPdf(d: ContractData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = 60;
  const write = (t: string, bold = false, size = 10.5) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    for (const l of doc.splitTextToSize(t, W - 100)) { if (y > H - 60) { doc.addPage(); y = 60; } doc.text(l, 50, y); y += size * 1.45; }
    y += 6;
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS PARA EVENTO', W / 2, y, { align: 'center' }); y += 30;
  write(`CONTRATANTE: ${party(d.contratante)}.`);
  write(`CONTRATADO: ${party(d.contratado)}.`);
  write('As partes acima qualificadas celebram o presente contrato, mediante as cláusulas seguintes:');
  contractClauses(d).forEach((c) => write(c));
  write(`${d.city}, ${br(d.issueDate)}.`);
  if (y > H - 140) { doc.addPage(); y = 80; } y += 50;
  doc.line(50, y, 260, y); doc.line(W - 260, y, W - 50, y);
  doc.setFontSize(9.5);
  doc.text(['CONTRATANTE', d.contratante.name], 155, y + 14, { align: 'center' });
  doc.text(['CONTRATADO', d.contratado.name], W - 155, y + 14, { align: 'center' });
  return doc;
}
