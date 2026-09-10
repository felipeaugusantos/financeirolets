import jsPDF from 'jspdf';
import { KIND_LABEL, formatReleaseDate, type Release } from '@/data/releases';

/**
 * Documento de liberação para a equipe: resumo em linguagem de cliente +
 * seção técnica por versão. Texto vetorial (sem html2canvas) para ficar leve
 * e pesquisável.
 */
export function exportReleaseNotesPdf(releases: Release[], filename = 'novidades-lets-finance.pdf') {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const write = (
    text: string,
    opts: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number]; indent?: number; gap?: number } = {}
  ) => {
    const { size = 10, style = 'normal', color = [30, 30, 30], indent = 0, gap = 1.5 } = opts;
    pdf.setFontSize(size);
    pdf.setFont('helvetica', style);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(text, maxWidth - indent) as string[];
    const lineHeight = size * 0.45;
    lines.forEach((line) => {
      ensure(lineHeight + gap);
      pdf.text(line, margin + indent, y);
      y += lineHeight + gap;
    });
  };

  // Capa / cabeçalho
  pdf.setFillColor(233, 30, 99);
  pdf.rect(0, 0, pageWidth, 26, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text("Let's Finance — Documento de Liberação", margin, 16);
  y = 36;

  write(
    `Gerado em ${new Date().toLocaleString('pt-BR')} • ${releases.length} liberação(ões) documentada(s).`,
    { size: 9, color: [110, 110, 110] }
  );
  y += 3;

  releases.forEach((release, idx) => {
    ensure(24);
    if (idx > 0) y += 4;

    pdf.setDrawColor(0, 184, 200);
    pdf.setLineWidth(0.6);
    pdf.line(margin, y - 4, pageWidth - margin, y - 4);

    write(`Versão ${release.version} — publicada em ${formatReleaseDate(release.date)}`, {
      size: 13,
      style: 'bold',
      color: [20, 20, 20],
    });
    write(release.summary, { size: 10, style: 'italic', color: [90, 90, 90] });
    y += 2;

    write('O que mudou para o cliente', { size: 11, style: 'bold', color: [233, 30, 99] });
    release.items.forEach((item) => {
      write(`• [${item.area} · ${KIND_LABEL[item.kind]}] ${item.title}`, { size: 10, style: 'bold' });
      write(item.detail, { size: 9.5, indent: 4, color: [70, 70, 70] });
      y += 1;
    });

    const tech = release.items.filter((i) => i.tech);
    if (tech.length > 0) {
      y += 2;
      write('Seção técnica (equipe)', { size: 11, style: 'bold', color: [0, 140, 152] });
      tech.forEach((item) => {
        write(`• ${item.title}`, { size: 9.5, style: 'bold' });
        write(item.tech as string, { size: 9, indent: 4, color: [70, 70, 70] });
      });
    }
    y += 4;
  });

  // Rodapé com paginação
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Página ${p} de ${total}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    pdf.text("Let's Finance — uso interno", margin, pageHeight - 8);
  }

  pdf.save(filename);
}
