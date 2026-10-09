import jsPDF from 'jspdf';
import autoTable, { type RowInput, type CellDef } from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface ExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  element: HTMLElement;
  /** Largura (px) usada na captura em imagem (só quando não há tabela). */
  captureWidth?: number;
  /** Tamanho da fonte (pt) das tabelas no PDF. */
  fontSize?: number;
}

const isHidden = (el: Element) => getComputedStyle(el).display === 'none';

/** Texto limpo da célula, sem botões/ícones de ação. */
function cellText(cell: HTMLElement): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, svg, [data-pdf-hide]').forEach((n) => n.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Recuo visual (padding-left) convertido em níveis, para manter a hierarquia do DRE. */
function indentLevel(cell: HTMLElement): number {
  const pad = parseFloat(cell.style.paddingLeft || getComputedStyle(cell).paddingLeft || '0');
  return Math.max(0, Math.round((pad - 12) / 18));
}

function tableToRows(table: HTMLTableElement) {
  const visibleCells = (tr: HTMLTableRowElement) =>
    Array.from(tr.cells).filter((c) => !isHidden(c)) as HTMLElement[];
  const head = Array.from(table.tHead?.rows ?? [])
    .filter((tr) => !isHidden(tr))
    .map((tr) => visibleCells(tr).map(cellText));
  const body: RowInput[] = [];
  Array.from(table.tBodies).forEach((tb) =>
    Array.from(tb.rows).forEach((tr) => {
      if (isHidden(tr)) return;
      const cells = visibleCells(tr);
      if (!cells.length) return;
      const bold = parseInt(getComputedStyle(tr).fontWeight, 10) >= 600
        || parseInt(getComputedStyle(cells[0]).fontWeight, 10) >= 600;
      body.push(cells.map((c, i): CellDef => ({
        content: (i === 0 ? '   '.repeat(indentLevel(c)) : '') + cellText(c),
        styles: {
          fontStyle: bold ? 'bold' : 'normal',
          halign: i === 0 ? 'left' : 'right',
          fillColor: bold ? [243, 244, 246] : undefined,
        },
      })));
    })
  );
  return { head, body };
}

export async function exportToPdf({ title, subtitle, filename, element, captureWidth = 1000, fontSize = 10 }: ExportOptions) {
  const tables = Array.from(element.querySelectorAll('table')).filter((t) => !isHidden(t));
  const maxCols = Math.max(0, ...tables.map((t) => Math.max(0, ...Array.from(t.rows).map((r) => r.cells.length))));
  const landscape = maxCols > 4 || (!tables.length && captureWidth > 1100);
  const pdf = new jsPDF(landscape ? 'l' : 'p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = subtitle ? 22 : 16;
  const footerHeight = 10;
  const generatedAt = new Date().toLocaleString('pt-BR');

  const drawHeader = () => {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin, margin + 6);
    if (subtitle) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120);
      pdf.text(subtitle, margin, margin + 13);
      pdf.setTextColor(0);
    }
  };
  const drawFooters = () => {
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`Gerado em ${generatedAt}`, margin, pageHeight - 4);
      pdf.text(`Página ${i}/${total}`, pageWidth - margin - 20, pageHeight - 4);
      pdf.setTextColor(0);
    }
  };

  if (tables.length) {
    // Tabela em texto de verdade: letra legível em qualquer tamanho de relatório.
    let startY = margin + headerHeight;
    tables.forEach((t) => {
      const { head, body } = tableToRows(t);
      autoTable(pdf, {
        head, body, startY,
        margin: { top: margin + headerHeight, bottom: margin + footerHeight, left: margin, right: margin },
        styles: { fontSize, cellPadding: 1.6, overflow: 'linebreak', textColor: 20 },
        headStyles: { fillColor: [233, 30, 99], textColor: 255, fontStyle: 'bold', halign: 'right' },
        columnStyles: { 0: { cellWidth: 'auto', halign: 'left' } },
        didParseCell: (d) => { if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left'; },
        didDrawPage: drawHeader,
      });
      startY = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 6;
    });
    drawFooters();
    pdf.save(filename);
    return;
  }

  // Sem tabela: captura em imagem (gráficos, painéis).
  const canvas = await html2canvas(element, {
    scale: 2.5,
    windowWidth: captureWidth,
    onclone: (_doc, el) => {
      el.style.width = `${captureWidth}px`;
      el.style.maxWidth = `${captureWidth}px`;
      el.style.overflow = 'visible';
      el.querySelectorAll<HTMLElement>('button, [data-pdf-hide]').forEach(n => { n.style.display = 'none'; });
    },
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  const usableHeight = pageHeight - margin - headerHeight - footerHeight;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const totalPages = Math.ceil(imgHeight / usableHeight);
  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();
    drawHeader();
    const sourceY = (i * usableHeight * canvas.width) / imgWidth;
    const sourceH = (usableHeight * canvas.width) / imgWidth;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(sourceH, canvas.height - sourceY);
    slice.getContext('2d')!.drawImage(canvas, 0, sourceY, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin + headerHeight, imgWidth, (slice.height * imgWidth) / canvas.width);
  }
  drawFooters();
  pdf.save(filename);
}
