import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface RomaneioOrder { id: string; unit: string; customer: string; deliveryDate: string | null; items: { product: string; packages: number; cookiesPerPackage: number }[] }
export interface RomaneioStop { unit: string; orders: RomaneioOrder[]; packages: number; cookies: number }

/** Agrupa os pedidos por unidade/loja de destino, somando caixas e cookies. */
export function groupRomaneio(orders: RomaneioOrder[]): RomaneioStop[] {
  const map = new Map<string, RomaneioStop>();
  for (const o of orders) {
    const s = map.get(o.unit) ?? { unit: o.unit, orders: [], packages: 0, cookies: 0 };
    s.orders.push(o);
    for (const it of o.items) { s.packages += Number(it.packages) || 0; s.cookies += (Number(it.packages) || 0) * (Number(it.cookiesPerPackage) || 0); }
    map.set(o.unit, s);
  }
  return [...map.values()].sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR'));
}

const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export function buildRomaneioPdf(date: string, orders: RomaneioOrder[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const pink: [number, number, number] = [233, 30, 99];
  const stops = groupRomaneio(orders);
  stops.forEach((s, i) => {
    if (i) doc.addPage();
    doc.setFillColor(...pink); doc.rect(0, 0, W, 64, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text("Let's Cookies", 40, 40);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text(`Romaneio de entrega · ${br(date)}`, W - 40, 40, { align: 'right' });
    doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(`Destino: ${s.unit}`, 40, 98);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(`${s.orders.length} pedido(s) · ${s.packages} caixa(s) · ${s.cookies} cookies · parada ${i + 1} de ${stops.length}`, 40, 118);
    autoTable(doc, {
      startY: 134,
      head: [['Cliente', 'Entrega', 'Produto', 'Caixas', 'Cookies', 'Conferido']],
      body: s.orders.flatMap(o => (o.items.length ? o.items : [{ product: 'sem produtos', packages: 0, cookiesPerPackage: 0 }]).map((it, k) => [k ? '' : o.customer, k ? '' : br(o.deliveryDate), it.product, String(it.packages), String(it.packages * it.cookiesPerPackage), '[   ]'])),
      foot: [['', '', 'Total', String(s.packages), String(s.cookies), '']],
      styles: { fontSize: 10, cellPadding: 5 }, headStyles: { fillColor: pink },
      footStyles: { fillColor: [250, 240, 245], textColor: [40, 40, 40], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
      margin: { left: 40, right: 40 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let y = ((doc as any).lastAutoTable?.finalY ?? 300) + 50;
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 80; }
    const sig = (x: number, label: string) => { doc.line(x, y, x + 150, y); doc.setFontSize(9); doc.text(label, x, y + 12); };
    sig(40, 'Expedição (fábrica)'); sig(220, 'Motorista'); sig(400, 'Recebido por (loja)');
    doc.text('Horário de saída: ____:____     Horário de chegada: ____:____', 40, y + 40);
  });
  if (!stops.length) { doc.setFontSize(12); doc.text(`Nenhum pedido para entrega em ${br(date)}.`, 40, 60); }
  return doc;
}
