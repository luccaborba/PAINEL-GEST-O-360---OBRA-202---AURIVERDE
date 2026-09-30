import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {calculateDay,datesForCompetence,decimalHours,duration,kindName,type ScheduleKind,type TimeEntry} from './timeAttendanceMath';

export function createTimeMirror(input:{project:string;competence:string;name:string;registration:string;kind:ScheduleKind;anchorDate:string|null;entries:TimeEntry[];holidayDates?:string[];logo:Uint8Array;preview?:boolean}){
 const {start,end,dates}=datesForCompetence(input.competence);
 const index=new Map(input.entries.map(entry=>[entry.work_date,entry]));
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'});
 let totalWorked=0,totalExpected=0,totalExtra=0,totalProduction=0;
 const body=dates.map(date=>{
  const entry=index.get(date),holiday=input.holidayDates?.includes(date)??entry?.holiday??false,result=calculateDay(entry,input.kind,input.anchorDate,date,holiday);
  if(entry){totalWorked+=result.worked;totalExpected+=result.expected;totalExtra+=result.extra;totalProduction+=result.production;}
  const label=`${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`;
  const occurrence=[entry?.attendance_status&&entry.attendance_status!=='PRESENTE'?entry.attendance_status:'',entry?.worked_minutes_override!=null?'Lançamento diário por grupo':'',holiday?'Feriado':'',result.issue||'',entry?.note||''].filter(Boolean).join(' · ');
  const showClock=!['FALTA','FOLGA','ATESTADO'].includes(entry?.attendance_status||'');
  return [label,showClock?entry?.entry_time?.slice(0,5)||'—':'—',showClock?entry?.break_start?.slice(0,5)||'—':'—',showClock?entry?.break_end?.slice(0,5)||'—':'—',showClock?entry?.exit_time?.slice(0,5)||'—':'—',entry?duration(result.expected):'—',entry?duration(result.worked):'—',entry?duration(result.extra)+(result.extraRate?` (${result.extraRate})`:''):'—',entry?`${result.production} min / ${decimalHours(result.production)} h`:'—',entry?occurrence:(result.expected?'Sem marcações':'Descanso')];
 });
 autoTable(doc,{
  startY:39,margin:{top:39,left:12,right:12,bottom:18},
  head:[['Data','Entrada','Saída intervalo','Retorno intervalo','Saída','Previsto','Trabalhado','Extra','Produção','Ocorrência / justificativa']],
  body,
  foot:[['TOTAL','','','','',duration(totalExpected),duration(totalWorked),duration(totalExtra),`${totalProduction} min / ${decimalHours(totalProduction)} h`,'']],
  showFoot:'lastPage',theme:'grid',
  styles:{font:'helvetica',fontSize:9.4,minCellHeight:7.2,cellPadding:1.3,valign:'middle',lineColor:[212,216,220],textColor:[33,41,48]},
  headStyles:{fillColor:[247,189,137],textColor:[52,39,25],fontStyle:'bold',fontSize:9.4},
  footStyles:{fillColor:[247,189,137],textColor:[52,39,25],fontStyle:'bold'},
  columnStyles:{0:{cellWidth:27},1:{cellWidth:29},2:{cellWidth:32},3:{cellWidth:32},4:{cellWidth:27},5:{cellWidth:28},6:{cellWidth:30},7:{cellWidth:38},8:{cellWidth:48},9:{cellWidth:100}},
  didDrawPage:({pageNumber})=>{
   doc.addImage(input.logo,'PNG',12,7,27,14);
   doc.setFont('helvetica','bold');doc.setFontSize(15);doc.setTextColor(35,43,51);doc.text(input.preview?'PRÉVIA DO ESPELHO DE PONTO · CONSTRU-X':'ESPELHO DE PONTO · CONSTRU-X',45,12);
   doc.setFontSize(10);doc.text(`${input.project}  ·  ${input.registration} - ${input.name}`,45,19);
   doc.setFont('helvetica','normal');doc.text(`${kindName[input.kind]}  ·  Período ${start.split('-').reverse().join('/')} a ${end.split('-').reverse().join('/')}`,45,25);
   doc.setFontSize(8);doc.text(input.preview?'PRÉVIA · Competência aberta. Confirme os lançamentos antes do fechamento.':'Produção em minutos, convertida em horas apenas no total. As marcações reais permanecem visíveis.',12,34);
   doc.text(`Página ${pageNumber}`,doc.internal.pageSize.getWidth()-12,doc.internal.pageSize.getHeight()-7,{align:'right'});
  }
 });
 return doc;
}
