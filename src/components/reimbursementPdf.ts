import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ReimbursementLine = { description: string; expense_on: string | null; supplier: string | null; category?: string | null; amount: number };
export type ReimbursementGroup = { name: string; role: string | null; items: ReimbursementLine[]; total: number };
// RGB da marca CCL em public/ccl-logo-folga.png.
const orange: [number, number, number] = [244, 163, 64];
const black: [number, number, number] = [10, 10, 10];
const money = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const amount = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const month = (v: string) => new Date(`${v.slice(0, 7)}-02T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).toUpperCase();
const day = (v: string | null) => v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : '';
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');
const permitted = (line: ReimbursementLine): number | null => { const c=normalize(line.category||''), d=normalize(line.description||''); if(c==='CAFE'||d.includes('CAFE')) return 15; if(c==='REFEICAO'||d.includes('REFEICAO')||d.includes('ALMOCO')||d.includes('JANTAR')) return 40; return null; };
const payable = (line: ReimbursementLine) => { const limit=permitted(line); return limit==null?Number(line.amount||0):Math.min(Number(line.amount||0),limit); };

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
  const left = 18, full = width - 36;
  const xs = [left, left+38, left+300, left+365, left+505, left+600, left+695, left+full];
  const widths = xs.slice(1).map((x,i)=>x-xs[i]);
  function fit(label:string,maxWidth:number){let size=9;doc.setFontSize(size);while(size>7&&doc.getTextWidth(label)>maxWidth){size-=.2;doc.setFontSize(size)}}
  function header(){
    doc.setTextColor(...black); doc.setDrawColor(...black); doc.setLineWidth(.8);
    doc.setFillColor(...orange); doc.rect(left,22,full,34,'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text('PRESTAÇÃO DE CONTA INDIVIDUAL',width/2,44,{align:'center'});
    doc.setFontSize(8.5); doc.setFillColor(245,245,245); doc.rect(left,66,full,48,'FD');
    doc.text('COLABORADOR:',left+6,84); fit(group.name.toLocaleUpperCase('pt-BR'),300); doc.text(group.name.toLocaleUpperCase('pt-BR'),left+86,84);
    doc.setFontSize(8.5); doc.setFont('helvetica','bold'); doc.text('FUNÇÃO:',left+6,103); doc.setFont('helvetica','normal'); fit((group.role||'').toLocaleUpperCase('pt-BR'),300); doc.text((group.role||'').toLocaleUpperCase('pt-BR'),left+86,103);
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.text(`COMPETÊNCIA: ${month(competence)}`,width-24,84,{align:'right'});
    doc.setFillColor(...orange); doc.rect(left,126,full,25,'FD'); doc.setFontSize(9); doc.text('DETALHAMENTO DAS DESPESAS',width/2,143,{align:'center'});
    doc.setFillColor(245,245,245); doc.rect(left,151,full,30,'FD');
    const heads=['ITEM','DESCRIÇÃO DA DESPESA','DATA','FORNECEDOR','VALOR GASTO','VALOR PERMITIDO','VALOR A PAGAR'];
    heads.forEach((v,i)=>{doc.rect(xs[i],151,widths[i],30);doc.setFontSize(i>=4?7.2:8);doc.text(v,(xs[i]+xs[i+1])/2,170,{align:'center'})});
  }
  header(); let y=181;
  group.items.forEach((line,index)=>{
    const description=doc.splitTextToSize((line.description||'').toLocaleUpperCase('pt-BR'),widths[1]-8) as string[];
    const supplier=doc.splitTextToSize((line.supplier||'').toLocaleUpperCase('pt-BR'),widths[3]-8) as string[];
    const lines=Math.max(1,description.length,supplier.length), rowH=Math.max(24,lines*10+10);
    if(y+rowH+55>height-12){doc.addPage();header();y=181}
    doc.setDrawColor(100);doc.setLineWidth(.35);xs.forEach(x=>doc.line(x,y,x,y+rowH));doc.line(xs[xs.length-1],y,xs[xs.length-1],y+rowH);doc.line(left,y,left+full,y);doc.line(left,y+rowH,left+full,y+rowH);
    const center=y+rowH/2+3;doc.setFont('helvetica','normal');doc.setFontSize(7.8);
    doc.text(String(index+1).padStart(2,'0'),(xs[0]+xs[1])/2,center,{align:'center'});
    doc.text(description,xs[1]+4,center-(description.length-1)*5,{lineHeightFactor:1.2});
    doc.text(day(line.expense_on),(xs[2]+xs[3])/2,center,{align:'center'});
    doc.text(supplier,xs[3]+4,center-(supplier.length-1)*5,{lineHeightFactor:1.2});
    doc.text(amount(line.amount),xs[5]-5,center,{align:'right'});
    const limit=permitted(line); if(limit!=null) doc.text(amount(limit),xs[6]-5,center,{align:'right'});
    doc.setFont('helvetica','bold');doc.text(amount(payable(line)),xs[7]-5,center,{align:'right'}); y+=rowH;
  });
  if(y+44>height-12){doc.addPage();header();y=181}
  const spent=group.items.reduce((n,x)=>n+Number(x.amount||0),0), due=group.items.reduce((n,x)=>n+payable(x),0);
  doc.setFillColor(245,245,245);doc.setDrawColor(...black);doc.setLineWidth(.7);doc.rect(xs[4],y,xs[7]-xs[4],36,'FD');
  [xs[5],xs[6]].forEach(x=>doc.line(x,y,x,y+36)); doc.setFont('helvetica','bold');doc.setFontSize(7.5);
  doc.text('TOTAL GASTO',xs[4]+5,y+13);doc.text(amount(spent),xs[5]-5,y+27,{align:'right'});
  doc.text('LIMITES',xs[5]+5,y+13);doc.text('CONFORME ITEM',xs[6]-5,y+27,{align:'right'});
  doc.text('TOTAL A PAGAR',xs[6]+5,y+13);doc.setFontSize(9);doc.text(amount(due),xs[7]-5,y+27,{align:'right'});
  return doc;
}
