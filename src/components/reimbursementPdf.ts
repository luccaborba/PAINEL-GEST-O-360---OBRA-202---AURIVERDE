import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ReimbursementLine = { description: string; expense_on: string | null; supplier: string | null; amount: number };
export type ReimbursementGroup = { name: string; role: string | null; items: ReimbursementLine[]; total: number };
// RGB da marca CCL em public/ccl-logo-folga.png.
const orange: [number, number, number] = [244, 163, 64];
const black: [number, number, number] = [10, 10, 10];
const money = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const amount = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const month = (v: string) => new Date(`${v.slice(0, 7)}-02T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).toUpperCase();
const day = (v: string | null) => v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : '';

// A grade, margens e tipografia são as do relatório sintético do v1.
export function competencePdf(groups: ReimbursementGroup[], competence: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 26;
  const total = groups.reduce((sum, g) => sum + g.total, 0), count = groups.reduce((sum, g) => sum + g.items.length, 0);
  doc.setDrawColor(...black); doc.setLineWidth(.65); doc.setFillColor(...orange); doc.rect(margin, 24, width - margin * 2, 31, 'FD');
  doc.setTextColor(...black); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('RELAÇÃO DESPESAS DE VIAGEM / REEMBOLSO', width / 2, 44, { align: 'center' });
  let x = margin;
  const cells: Array<[string, number, boolean, 'left' | 'center' | 'right']> = [
    ['COMPETÊNCIA', 92, true, 'left'], [month(competence), 150, false, 'left'],
    ['COLABORADORES', 95, true, 'center'], [String(groups.length), 55, false, 'center'],
    ['LANÇAMENTOS', 88, true, 'center'], [String(count), 55, false, 'center'],
    ['TOTAL DA COMPETÊNCIA', 120, true, 'right'], [money(total), width - 2 * margin - 655, false, 'right'],
  ];
  for (const [label, cellWidth, bold, align] of cells) {
    const shade = bold ? 245 : 255; doc.setFillColor(shade, shade, shade); doc.rect(x, 55, cellWidth, 25, 'FD');
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.2);
    doc.text(label, align === 'right' ? x + cellWidth - 5 : align === 'center' ? x + cellWidth / 2 : x + 5, 71, { align }); x += cellWidth;
  }
  autoTable(doc, {
    startY: 92, margin: { left: margin, right: margin, bottom: 30 },
    head: [['ITEM', 'COLABORADOR', 'FUNÇÃO', 'LANÇAMENTOS', 'TOTAL']],
    body: groups.map((g, i) => [String(i + 1).padStart(2, '0'), g.name.toLocaleUpperCase('pt-BR'), (g.role || '').toLocaleUpperCase('pt-BR'), String(g.items.length), money(g.total)]),
    foot: [['', '', '', 'TOTAL', money(total)]], theme: 'grid', showHead: 'everyPage', showFoot: 'lastPage', rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontStyle: 'normal', fontSize: 8, textColor: black, lineColor: [105, 105, 105], lineWidth: .35, cellPadding: { top: 4, right: 5, bottom: 4, left: 5 }, valign: 'middle', overflow: 'linebreak', minCellHeight: 22 },
    headStyles: { fillColor: orange, textColor: black, fontStyle: 'bold', halign: 'center', lineColor: black, lineWidth: .55, minCellHeight: 24 },
    footStyles: { fillColor: [245, 245, 245], textColor: black, fontStyle: 'bold', lineColor: black, lineWidth: .6, minCellHeight: 25 },
    columnStyles: { 0: { cellWidth: 42, halign: 'center' }, 1: { cellWidth: 278 }, 2: { cellWidth: 245 }, 3: { cellWidth: 90, halign: 'center' }, 4: { cellWidth: 133, halign: 'right' } },
    didParseCell: hook => { if (hook.section === 'body' && hook.column.index === 4) hook.cell.styles.fontStyle = 'bold'; if (hook.section === 'foot' && hook.column.index >= 3) hook.cell.styles.halign = 'right'; },
    didDrawPage: () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90); doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 12, { align: 'right' }); },
  });
  return doc;
}

// Relação individual baseada nas coordenadas e proporções do PDF do v1.
export function collaboratorPdf(group: ReimbursementGroup, competence: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const left = 10, full = width - 20, at = (v: number) => left + v / 998 * full;
  const xs = [left, at(48), at(554), at(613), at(923), left + full], widths = xs.slice(1).map((x, i) => x - xs[i]);
  function fit(label: string, maxWidth: number) { let size = 9.2; doc.setFontSize(size); while (size > 7 && doc.getTextWidth(label) > maxWidth) { size -= .2; doc.setFontSize(size); } }
  function header() {
    doc.setTextColor(...black); doc.setDrawColor(...black); doc.setLineWidth(1.2); doc.setFillColor(...orange);
    doc.rect(left, 30, full, 48, 'FD'); doc.setFont('helvetica', 'bold'); doc.setFontSize(15.5);
    doc.text('RELAÇÃO DESPESAS DE VIAGEM / REEMBOLSO', width / 2, 60, { align: 'center' });
    doc.setFontSize(9); doc.text(`MÊS DE COMPETÊNCIA: ${month(competence)}`, width / 2, 94, { align: 'center' });
    doc.setFillColor(...orange); doc.rect(left, 107, at(48) - left, 34, 'F'); doc.rect(at(554), 107, at(613) - at(554), 34, 'F');
    doc.rect(left, 107, full, 34); [at(48), at(554), at(613)].forEach(x => doc.line(x, 107, x, 141));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.text('NOME:', left + 4, 129); doc.text('FUNÇÃO', at(554) + 5, 129);
    const name = group.name.toLocaleUpperCase('pt-BR'), role = (group.role || '').toLocaleUpperCase('pt-BR');
    fit(name, at(554) - at(48) - 10); doc.text(name, at(48) + 5, 129);
    fit(role, left + full - at(613) - 10); doc.text(role, at(613) + 5, 129);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setFillColor(...orange); doc.rect(left, 170, full, 32, 'FD');
    ['ITEM', 'DESCRIÇÃO', 'DATA', 'FORNECEDOR', 'VALOR'].forEach((v, i) => doc.text(v, (xs[i] + xs[i + 1]) / 2, 190, { align: 'center' }));
  }
  header(); let y = 202;
  group.items.forEach((line, index) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4);
    const description = doc.splitTextToSize((line.description || '').toLocaleUpperCase('pt-BR'), widths[1] - 10) as string[];
    const supplier = doc.splitTextToSize((line.supplier || '').toLocaleUpperCase('pt-BR'), widths[3] - 10) as string[];
    const lines = Math.max(1, description.length, supplier.length), rowH = lines === 1 ? 25 : lines === 2 ? 36 : Math.max(47, lines * 11 + 12);
    if (y + rowH + 34 > height - 8) { doc.addPage(); header(); y = 202; }
    doc.setDrawColor(...black); doc.setLineWidth(.45); [left, ...xs.slice(1, -1), left + full].forEach(x => doc.line(x, y, x, y + rowH));
    if (y === 202) doc.line(left, y, left + full, y);
    else { doc.setDrawColor(120); doc.setLineWidth(.25); doc.setLineDashPattern([1.2, 1.2], 0); doc.line(left, y, left + full, y); doc.setLineDashPattern([], 0); }
    doc.setTextColor(...black); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4);
    const center = y + rowH / 2 + 2.7, step = 10.4;
    doc.text(String(index + 1).padStart(2, '0'), (xs[0] + xs[1]) / 2, center, { align: 'center' });
    doc.text(description, xs[1] + 5, center - (description.length - 1) * step / 2, { lineHeightFactor: 1.24 });
    doc.text(day(line.expense_on), (xs[2] + xs[3]) / 2, center, { align: 'center' });
    doc.text(supplier, xs[3] + 5, center - (supplier.length - 1) * step / 2, { lineHeightFactor: 1.24 });
    doc.text('R$', xs[4] + 5, center); doc.text(amount(line.amount), xs[5] - 5, center, { align: 'right' }); y += rowH;
  });
  if (y + 28 > height - 8) { doc.addPage(); header(); y = 202; }
  if (group.items.length) { doc.setDrawColor(...black); doc.setLineWidth(.6); doc.line(left, y, left + full, y); }
  doc.setDrawColor(...black); doc.setLineWidth(1.2); doc.rect(xs[4], y, widths[4], 28);
  doc.setTextColor(...black); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  doc.text('R$', xs[4] + 5, y + 18); doc.text(amount(group.total), xs[5] - 5, y + 18, { align: 'right' });
  return doc;
}
