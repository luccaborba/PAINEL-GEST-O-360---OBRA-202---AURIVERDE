import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type PrintableAlert = { person: string; registration: string; role: string; department: string; type: '45D' | '90D' | 'CNH' | 'ASO'; date: string; days: number };
const orange: [number, number, number] = [244, 163, 64];
const black: [number, number, number] = [10, 10, 10];
const labels: Record<PrintableAlert['type'], string> = { '45D': 'EXPERIÊNCIA 45 DIAS', '90D': 'EXPERIÊNCIA 90 DIAS', CNH: 'CNH', ASO: 'ASO' };

export function alertCenterPdf(alerts: PrintableAlert[], projectCode: string, department: string, today: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 26;
  doc.setDrawColor(...black); doc.setLineWidth(.65); doc.setFillColor(...orange);
  doc.rect(margin, 24, width - margin * 2, 31, 'FD');
  doc.setTextColor(...black); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('CENTRAL DE ALERTAS · VENCIMENTOS', width / 2, 44, { align: 'center' });
  const metadata = [
    ['OBRA', projectCode || '—', 105],
    ['REFERÊNCIA', today.split('-').reverse().join('/'), 155],
    ['SETOR / EQUIPE', department || 'TODOS', 315],
    ['ALERTAS', String(alerts.length), width - margin * 2 - 575],
  ] as const;
  let x = margin;
  for (const [label, value, cellWidth] of metadata) {
    doc.setFillColor(245, 245, 245); doc.rect(x, 55, cellWidth, 25, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.text(label, x + 5, 71);
    const labelWidth = doc.getTextWidth(label) + 9;
    doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(value.toUpperCase(), cellWidth - labelWidth - 10)[0] || '—', x + labelWidth, 71);
    x += cellWidth;
  }
  autoTable(doc, {
    startY: 92, margin: { left: margin, right: margin, top: 92, bottom: 30 },
    head: [['MAT.', 'COLABORADOR', 'FUNÇÃO', 'SETOR / EQUIPE', 'ALERTA', 'VENCIMENTO', 'PRAZO']],
    body: alerts.map(a => [a.registration || '—', a.person.toUpperCase(), a.role.toUpperCase(), a.department.toUpperCase(), labels[a.type], a.date.split('-').reverse().join('/'), a.days === 0 ? 'CRÍTICO · HOJE' : a.days === 1 ? 'CRÍTICO · 1 DIA' : `EM ${a.days} DIAS`]),
    theme: 'grid', showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize: 8, textColor: black, lineColor: [105, 105, 105], lineWidth: .35, cellPadding: { top: 4, right: 5, bottom: 4, left: 5 }, valign: 'middle', overflow: 'linebreak', minCellHeight: 22 },
    headStyles: { fillColor: orange, textColor: black, fontStyle: 'bold', halign: 'center', lineColor: black, lineWidth: .55, minCellHeight: 24 },
    columnStyles: { 0: { cellWidth: 45, halign: 'center' }, 1: { cellWidth: 160 }, 2: { cellWidth: 125 }, 3: { cellWidth: 122 }, 4: { cellWidth: 120 }, 5: { cellWidth: 87, halign: 'center' }, 6: { cellWidth: 130, halign: 'center' } },
    didParseCell: hook => { if (hook.section === 'body' && hook.column.index === 6 && String(hook.cell.raw).startsWith('CRÍTICO')) hook.cell.styles.fontStyle = 'bold'; },
    didDrawPage: () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90); doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 12, { align: 'right' }); },
  });
  return doc;
}
