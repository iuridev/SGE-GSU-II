import jsPDF from 'jspdf';

// Vertical space (mm) reserved for the letterhead header on each page
export const TIMBRADO_HEADER_H = 30;
// Vertical space (mm) reserved for the letterhead footer on each page
export const TIMBRADO_FOOTER_H = 12;

/**
 * Adds the institutional letterhead header to the current jsPDF page.
 * Call this at the start of each page before adding content.
 */
export function addTimbradoHeader(doc: jsPDF): void {
  const pageW = doc.internal.pageSize.getWidth();
  const prevFontSize = doc.getFontSize();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('SECRETARIA DE ESTADO DA EDUCAÇÃO', pageW / 2, 8, { align: 'center' });

  doc.setFontSize(8);
  doc.text('UNIDADE REGIONAL DE ENSINO – GUARULHOS SUL', pageW / 2, 13, { align: 'center' });
  doc.text('SERVIÇO DE OBRAS E MANUTENÇÃO ESCOLAR', pageW / 2, 17.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Seção de Fiscalização', pageW / 2, 21.5, { align: 'center' });

  doc.setFontSize(7);
  doc.text(
    'e-mail: gsu.seom@educacao.sp.gov.br   tel. (11) 2442-2286',
    pageW / 2, 25, { align: 'center' }
  );
  doc.text(
    'e-mail: gsu.sefisc@educacao.sp.gov.br   tel.(11) 2442-2169',
    pageW / 2, 28.5, { align: 'center' }
  );

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(14, 31, pageW - 14, 31);

  doc.setFontSize(prevFontSize);
}

/**
 * Adds the institutional letterhead footer to the current jsPDF page.
 * Call this at the end of each page after adding content.
 */
export function addTimbradoFooter(doc: jsPDF): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const prevFontSize = doc.getFontSize();

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(14, pageH - 10, pageW - 14, pageH - 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text(
    'Avenida Emílio Ribas, 940, Vila Tijuco – Guarulhos, São Paulo',
    pageW / 2, pageH - 6, { align: 'center' }
  );

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(prevFontSize);
}

/**
 * Adds timbrado header + footer to ALL pages in the document.
 * Use after all content has been added (reads doc.internal.pages.length).
 */
export function addTimbradoAllPages(doc: jsPDF): void {
  const totalPages: number = (doc.internal as any).getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // White bands ensure timbrado renders cleanly over any underlying image content
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, TIMBRADO_HEADER_H + 2, 'F');
    doc.rect(0, pageH - TIMBRADO_FOOTER_H, pageW, TIMBRADO_FOOTER_H, 'F');
    addTimbradoHeader(doc);
    addTimbradoFooter(doc);
  }
}

/**
 * Returns the HTML string for the letterhead header to embed inside
 * html2pdf JSX-based hidden div templates.
 * Optionally pass a logo URL to display the SP brasão.
 */
export function getTimbradoHeaderHtml(logoUrl?: string): string {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Brasão SP" style="width:70px;height:70px;object-fit:contain;flex-shrink:0;" />`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #000;margin-bottom:20px;font-family:Arial,sans-serif;">
      ${logoHtml}
      <div style="flex:1;text-align:center;">
        <div style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;">Secretaria de Estado da Educação</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;margin-top:2px;">Unidade Regional de Ensino – Guarulhos Sul</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;margin-top:2px;">Serviço de Obras e Manutenção Escolar</div>
        <div style="font-size:10px;margin-top:3px;">Seção de Fiscalização</div>
        <div style="font-size:9px;color:#444;margin-top:2px;font-style:italic;">e-mail: gsu.seom@educacao.sp.gov.br &nbsp;&nbsp; tel. (11) 2442-2286</div>
        <div style="font-size:9px;color:#444;margin-top:1px;font-style:italic;">e-mail: gsu.sefisc@educacao.sp.gov.br &nbsp;&nbsp; tel.(11) 2442-2169</div>
      </div>
    </div>
  `;
}

/**
 * Returns the HTML string for the letterhead footer.
 */
export function getTimbradoFooterHtml(): string {
  return `
    <div style="border-top:1px solid #000;padding-top:8px;margin-top:24px;text-align:center;font-size:9px;color:#444;font-style:italic;font-family:Arial,sans-serif;">
      Avenida Emílio Ribas, 940, Vila Tijuco – Guarulhos, São Paulo
    </div>
  `;
}
