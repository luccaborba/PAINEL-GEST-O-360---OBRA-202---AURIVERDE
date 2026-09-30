import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ReimbursementLine = {
  description: string;
  expense_on: string | null;
  supplier: string | null;
  amount: number;
};

export type ReimbursementGroup = {
  name: string;
  role: string | null;
  items: ReimbursementLine[];
  total: number;
};

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const month = (value: string) => new Date(`${value.slice(0, 7)}-02T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).toUpperCase();
const day = (value: string | null) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(2, 4)}` : '—';
const peach: [number, number, number] = [252, 211, 174];
const tableStyle = { font: 'courier' as const, fontSize: 8, cellPadding: 2, overflow: 'linebreak' as const, valign: 'middle' as const, lineColor: [60, 60, 60] as [number, number, number], lineWidth: .12 };

export function competencePdf(groups: ReimbursementGroup[], competence: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  doc.setDrawColor(0); doc.setFillColor(...peach); doc.rect(9, 9, 279, 11, 'FD');
  doc.setFont('courier', 'bold'); doc.setFontSize(12); doc.text('RELAÇÃO DESPESAS DE VIAGEM / REEMBOLSO', 148.5, 16, { align: 'center' });
  autoTable(doc, {
    startY: 20, margin: { left: 9, right: 9 }, theme: 'grid', showHead: 'never',
    body: [['COMPETÊNCIA', month(competence), 'COLABORADORES', String(groups.length), 'LANÇAMENTOS', String(count), 'TOTAL DA COMPETÊNCIA', money(total)]],
    styles: { ...tableStyle, minCellHeight: 9, fontSize: 7.2 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold', fillColor: [245, 245, 245] }, 1: { cellWidth: 51 }, 2: { cellWidth: 31, fontStyle: 'bold', fillColor: [245, 245, 245] }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 29, fontStyle: 'bold', fillColor: [245, 245, 245] }, 5: { cellWidth: 18, halign: 'center' }, 6: { cellWidth: 45, fontStyle: 'bold', fillColor: [245, 245, 245] }, 7: { cellWidth: 59, halign: 'right' } },
  });
  autoTable(doc, {
    startY: 34, margin: { left: 9, right: 9, bottom: 14 }, theme: 'grid',
    head: [['ITEM', 'COLABORADOR', 'FUNÇÃO', 'LANÇAMENTOS', 'TOTAL']],
    body: [...groups.map((group, index) => [String(index + 1).padStart(2, '0'), group.name, group.role || '—', String(group.items.length), money(group.total)]), ['', '', '', 'TOTAL', money(total)]],
    styles: { ...tableStyle, minCellHeight: 8 },
    headStyles: { fillColor: peach, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', minCellHeight: 9 },
    columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 1: { cellWidth: 99 }, 2: { cellWidth: 86 }, 3: { cellWidth: 32, halign: 'center' }, 4: { cellWidth: 47, halign: 'right', fontStyle: 'bold' } },
    didParseCell(data) { if (data.section === 'body' && data.row.index === groups.length) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [245, 245, 245]; } },
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) { doc.setPage(page); doc.setFont('courier', 'normal'); doc.setFontSize(7); doc.text(`Página ${page}`, 287, 204, { align: 'right' }); }
  return doc;
}

export function collaboratorPdf(group: ReimbursementGroup, competence: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setDrawColor(0); doc.setFillColor(...peach); doc.rect(9, 9, 279, 17, 'FD');
  doc.setFont('courier', 'bold'); doc.setFontSize(13); doc.text('RELAÇÃO DESPESAS DE VIAGEM / REEMBOLSO', 148.5, 20, { align: 'center' });
  doc.setFontSize(9); doc.text(`MÊS DE COMPETÊNCIA: ${month(competence)}`, 148.5, 32, { align: 'center' });
  autoTable(doc, { startY: 37, margin: { left: 9, right: 9 }, theme: 'grid', showHead: 'never', body: [['NOME:', group.name, 'FUNÇÃO', group.role || '—']], styles: { ...tableStyle, minCellHeight: 12, fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 16, fillColor: peach }, 1: { cellWidth: 137 }, 2: { cellWidth: 18, fillColor: peach }, 3: { cellWidth: 108 } } });
  autoTable(doc, {
    startY: 59, margin: { left: 9, right: 9, bottom: 14 }, theme: 'grid',
    head: [['ITEM', 'DESCRIÇÃO', 'DATA', 'FORNECEDOR', 'VALOR']],
    body: [...group.items.map((item, index) => [String(index + 1).padStart(2, '0'), item.description, day(item.expense_on), item.supplier || '—', money(item.amount)]), ['', '', '', 'TOTAL', money(group.total)]],
    styles: { ...tableStyle, minCellHeight: 9 }, headStyles: { fillColor: peach, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', minCellHeight: 10 },
    columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 1: { cellWidth: 140 }, 2: { cellWidth: 22, halign: 'center' }, 3: { cellWidth: 77 }, 4: { cellWidth: 26, halign: 'right' } },
    didParseCell(data) { if (data.section === 'body' && data.row.index === group.items.length) data.cell.styles.fontStyle = 'bold'; },
  });
  return doc;
}
