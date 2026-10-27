import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ProposalLine { name: string; packages: number; unitPrice: number }
const c2 = (v: number) => Math.round(v * 100) / 100;

/** Subtotal, desconto em % (0–100) e total da proposta. */
export function proposalTotals(lines: ProposalLine[], discountPct: number) {
  const subtotal = c2(lines.reduce((s, l) => s + c2(Math.max(0, l.packages) * Math.max(0, l.unitPrice)), 0));
  const pct = Math.min(100, Math.max(0, discountPct || 0));
  const discount = c2(subtotal * pct / 100);
  return { subtotal, discount, total: c2(subtotal - discount) };
}

export function proposalValidUntil(issueIso: string, days: number) {
  const d = new Date(`${issueIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export interface ProposalData {
  company: string; contact?: string | null; title: string; eventDate: string | null; eventTime?: string | null;
  attendees?: number | null; address?: string | null; lines: ProposalLine[]; discountPct: number;
  paymentTerms: string; validDays: number; notes?: string; seller?: string | null; issueDate: string;
}

export function buildProposalPdf(p: ProposalData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const pink: [number, number, number] = [233, 30, 99];
  doc.setFillColor(...pink); doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text("Let's Cookies", 40, 42);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text('Proposta comercial', W - 40, 42, { align: 'right' });

  doc.setTextColor(40, 40, 40); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(p.title, 40, 105);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  const info = [
    `Cliente: ${p.company}${p.contact ? ` · A/C ${p.contact}` : ''}`,
    `Evento: ${br(p.eventDate)}${p.eventTime ? ` às ${p.eventTime}` : ''}${p.attendees ? ` · ${p.attendees} pessoas` : ''}`,
    p.address ? `Local: ${p.address}` : '',
    `Emitida em ${br(p.issueDate)} · válida até ${br(proposalValidUntil(p.issueDate, p.validDays))}`,
  ].filter(Boolean);
  info.forEach((t, i) => doc.text(t, 40, 128 + i * 16));

  const t = proposalTotals(p.lines, p.discountPct);
  autoTable(doc, {
    startY: 128 + info.length * 16 + 14,
    head: [['Produto', 'Qtd.', 'Preço unit.', 'Total']],
    body: p.lines.map((l) => [l.name, String(l.packages), money(l.unitPrice), money(c2(l.packages * l.unitPrice))]),
    foot: [
      ['', '', 'Subtotal', money(t.subtotal)],
      ...(t.discount > 0 ? [['', '', `Desconto (${p.discountPct}%)`, `- ${money(t.discount)}`]] : []),
      ['', '', 'Total', money(t.total)],
    ],
    styles: { fontSize: 11, cellPadding: 6 },
    headStyles: { fillColor: pink },
    footStyles: { fillColor: [250, 240, 245], textColor: [40, 40, 40], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 300) + 28;
  doc.setFont('helvetica', 'bold'); doc.text('Condições', 40, y); doc.setFont('helvetica', 'normal');
  y += 16; doc.text(`Pagamento: ${p.paymentTerms}`, 40, y);
  if (p.notes) { y += 16; doc.splitTextToSize(p.notes, W - 80).forEach((ln: string) => { doc.text(ln, 40, y); y += 15; }); }
  y += 30; doc.setFontSize(10); doc.setTextColor(120, 120, 120);
  doc.text(`${p.seller ? `${p.seller} · ` : ''}Let's Cookies`, 40, y);
  return doc;
}
