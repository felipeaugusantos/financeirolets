import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  element: HTMLElement;
}

export async function exportToPdf({ title, subtitle, filename, element }: ExportOptions) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
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
