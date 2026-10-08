import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  element: HTMLElement;
  /** Largura (px) usada na captura. Menor = texto maior no PDF. */
  captureWidth?: number;
  /** Tamanho base da fonte na captura (px). */
  fontSize?: number;
}

export async function exportToPdf({ title, subtitle, filename, element, captureWidth = 1000, fontSize = 15 }: ExportOptions) {
  const canvas = await html2canvas(element, {
    scale: 2.5,
    windowWidth: captureWidth,
    // Captura numa largura fixa e com fonte maior: na tela larga o relatório
    // era reduzido para caber no A4 e o texto ficava minúsculo.
    onclone: (_doc, el) => {
      el.style.width = `${captureWidth}px`;
      el.style.maxWidth = `${captureWidth}px`;
      el.style.overflow = 'visible';
      el.style.fontSize = `${fontSize}px`;
      el.querySelectorAll<HTMLElement>('table, th, td').forEach(n => { n.style.fontSize = `${fontSize}px`; });
      el.querySelectorAll<HTMLElement>('td, th').forEach(n => { n.style.paddingTop = '6px'; n.style.paddingBottom = '6px'; });
      el.querySelectorAll<HTMLElement>('button, [data-pdf-hide]').forEach(n => { n.style.display = 'none'; });
    },
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  // Relatórios largos (muitas colunas) saem em paisagem para manter o texto legível.
  const pdf = new jsPDF(canvas.width / canvas.height > 1.3 || captureWidth > 1100 ? 'l' : 'p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = subtitle ? 22 : 16;
  const footerHeight = 10;
  const usableHeight = pageHeight - margin - headerHeight - footerHeight;

  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const addHeader = (page: number, total: number) => {
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
    // Footer
    pdf.setFontSize(7);
    pdf.setTextColor(150);
    pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, pageHeight - 4);
    pdf.text(`Página ${page}/${total}`, pageWidth - margin - 20, pageHeight - 4);
    pdf.setTextColor(0);
  };

  const totalPages = Math.ceil(imgHeight / usableHeight);

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();
    addHeader(i + 1, totalPages);

    const sourceY = (i * usableHeight * canvas.width) / imgWidth;
    const sourceH = (usableHeight * canvas.width) / imgWidth;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.min(sourceH, canvas.height - sourceY);
    const ctx = sliceCanvas.getContext('2d')!;
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);

    const sliceData = sliceCanvas.toDataURL('image/png');
    const sliceImgH = (sliceCanvas.height * imgWidth) / canvas.width;
    pdf.addImage(sliceData, 'PNG', margin, margin + headerHeight, imgWidth, sliceImgH);
  }

  pdf.save(filename);
}
