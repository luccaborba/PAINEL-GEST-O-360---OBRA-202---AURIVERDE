import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { strToU8, zipSync } from 'fflate';

const xml = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function columnName(index: number): string {
  let result = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result;
}
export function listWorkbook(project: string, search: string, headers: readonly string[], rows: string[][]): Uint8Array {
  const grid = [['COLABORADORES - ' + project], ['Pesquisa: ' + (search || 'Todos')], ['Total: ' + rows.length], [], [...headers], ...rows];
  const sheetRows = grid.map((row, i) => `<row r="${i + 1}">${row.map((value, j) => `<c r="${columnName(j)}${i + 1}" t="inlineStr" s="${i === 4 ? 1 : 0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('');
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, content: string) => { files[name] = strToU8(content); };
  add('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  add('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Colaboradores" sheetId="1" r:id="rId1"/></sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  add('xl/styles.xml', '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFCC00"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>');
  const lastColumn = columnName(headers.length - 1);
  add('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${headers.map((h, i) => `<col min="${i + 1}" max="${i + 1}" width="${h === 'NOME' ? 42 : h === 'FUNÇÃO' ? 38 : 23}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A5:${lastColumn}${grid.length}"/></worksheet>`);
  return zipSync(files, { level: 6 });
}
export async function exportFilteredCollaborators(format: 'pdf' | 'xlsx', project: string, search: string, headers: readonly string[], rows: string[][]) {
  const date = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const filename = `COLABORADORES_OBRA_${project.split('·')[0].trim().replace(/[^a-zA-Z0-9_-]/g, '')}_${date.replace(/\//g, '-')}`;
  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: headers.length > 8 ? 'a3' : 'a4' });
    const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
    autoTable(doc, { startY: 37, margin: { top: 37, bottom: 18, left: 10, right: 10 }, head: [[...headers]], body: rows, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [245, 197, 24], textColor: [20, 20, 20] }, alternateRowStyles: { fillColor: [247, 248, 250] } });
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page); doc.setFillColor(245, 197, 24); doc.rect(0, 0, width, 32, 'F'); doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('RELAÇÃO DE COLABORADORES', 10, 10); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(project, 10, 17); doc.text(`Pesquisa: ${search || 'Todos'} | Total: ${rows.length} | Emissão: ${date}`, 10, 24, { maxWidth: width - 20 }); doc.setFontSize(8); doc.text('CONSTRU-X | DP/RH', 10, height - 8); doc.text(`Página ${page}/${doc.getNumberOfPages()}`, width - 10, height - 8, { align: 'right' });
    }
    doc.save(filename + '.pdf'); return;
  }
  const bytes = listWorkbook(project, search, headers, rows);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = filename + '.xlsx'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
