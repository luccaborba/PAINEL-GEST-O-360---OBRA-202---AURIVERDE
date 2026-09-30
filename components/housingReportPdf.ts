import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { housingReportData, type ContractRow, type HousingRow, type Resident } from './housingReport';

const brDate=(value:string|null)=>value?value.split('-').reverse().join('/'):'—';
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function createHousingReportPdf(homes:HousingRow[],contracts:ContractRow[],residents:Resident[],projectCode:string,referenceDate:string,logo:Uint8Array):jsPDF{
 const {rows,week,total}=housingReportData(homes,contracts,residents,referenceDate);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a2'});
 const headers=['N','Contrato','Situação do CT - Ativo ou desmobilizado','Fornecedor*','Data de Início CT','Data de Término CT','Periodo da Medição','Valor Mensal','Capacidade de Alojados','Quantidade Alojados','Qual Equipe alojada ?'];
 autoTable(doc,{
  startY:32,margin:{left:10,right:10,top:32,bottom:14},
  head:[headers],
  body:rows.map(row=>[String(row.number),row.contract,row.status,row.supplier,brDate(row.start),brDate(row.end),row.measurement,money(row.amount),row.capacity===null?'—':String(row.capacity),String(row.occupied),row.team]),
  foot:[['Total','','','','','','',money(total),'','','']],
  theme:'grid',
  styles:{font:'helvetica',fontSize:10,textColor:[38,38,38],lineColor:[208,208,208],lineWidth:0.15,cellPadding:2.2,valign:'middle',overflow:'linebreak'},
  headStyles:{fillColor:[246,190,145],textColor:[47,38,30],fontStyle:'bold',fontSize:10,minCellHeight:25,halign:'center'},
  footStyles:{fillColor:[246,190,145],textColor:[47,38,30],fontStyle:'bold',fontSize:11},
  columnStyles:{
   0:{cellWidth:15,halign:'center'},1:{cellWidth:39},2:{cellWidth:44,halign:'center'},3:{cellWidth:68},4:{cellWidth:30,halign:'center'},5:{cellWidth:30,halign:'center'},6:{cellWidth:48,halign:'center'},7:{cellWidth:35,halign:'right'},8:{cellWidth:33,halign:'center'},9:{cellWidth:34,halign:'center'},10:{cellWidth:140}
  },
  didDrawPage:()=>{doc.addImage(logo,'PNG',10,5,34,17);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(47,38,30);doc.text(`OBRA ${projectCode} · CONTRATOS DE LOCAÇÃO DE IMÓVEIS`,50,12);doc.setFontSize(13);doc.text(week,50,20);}
 });
 return doc;
}
