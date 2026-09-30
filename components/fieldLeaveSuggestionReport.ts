import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PrintHistory, PrintLeave, PrintPerson } from './fieldLeavePrint';

type Filters={sectors:string[];months:string[]};
type Row={group:string;name:string;overdue:boolean;cells:string[];amount:number|null};
const upper=(s:string|null|undefined)=>String(s||'').trim().toLocaleUpperCase('pt-BR');
const fmt=(iso:string|null|undefined)=>iso?`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`:'—';
const addMonths=(iso:string,n:number)=>{const [y,m,d]=iso.slice(0,10).split('-').map(Number);if(!y||!m||!d)return '';const x=new Date(Date.UTC(y,m-1+n,1,12));const last=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0,12)).getUTCDate();x.setUTCDate(Math.min(d,last));return x.toISOString().slice(0,10)};
const addDays=(iso:string,n:number)=>{const x=new Date(`${iso}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const fifth=(iso:string,n:number)=>{const first=addMonths(iso.slice(0,7)+'-01',n);if(!first)return '';const [y,m]=first.split('-').map(Number);let count=0;for(let i=1;i<=15;i++){const d=new Date(Date.UTC(y,m-1,i,12));if(d.getUTCDay()!==0&&d.getUTCDay()!==6&&++count===5)return d.toISOString().slice(0,10)}return ''};
const dates=(start:string,end:string)=>`${fmt(start)} A ${fmt(end)}`;
const rule=(km:number)=>km>1000?{months:6,days:7,period:'6x6'}:km>500?{months:3,days:5,period:'3x3'}:{months:2,days:3,period:'2x2'};
const brl=(n:number)=>n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const positive=(s:string|null|undefined)=>['SIM','S','TRUE','1'].includes(upper(s));
async function logoData(){const r=await fetch('/ccl-logo-folga.png');if(!r.ok)throw new Error('Logo da CCL não localizada.');const blob=await r.blob(),fr=new FileReader();return await new Promise<string>((resolve,reject)=>{fr.onload=()=>resolve(String(fr.result));fr.onerror=reject;fr.readAsDataURL(blob)})}

export async function suggestionReport(people:PrintPerson[],leaves:PrintLeave[],history:PrintHistory[],projectLabel:string,filters:Filters){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),rows:Row[]=[],pending:string[][]=[];
 for(const p of people){
  if(['DESLIGADO','INATIVO','ABANDONO'].includes(upper(p.status))||['PJ','TERCEIRO'].some(type=>upper(p.contract_type).includes(type))||['NÃO','NAO','N','FALSE','0'].includes(upper(p.entitled_to_leave))||!positive(p.entitled_to_leave)&&!positive(p.uses_lodging))continue;
  const group=upper(p.department||p.team||p.sector||'SEM SETOR / EQUIPE');if(!filters.sectors.includes(group))continue;
  const km=Number(p.distance_km||0);if(!km){pending.push([p.registration||'—',upper(p.name),'SEM KM CADASTRADO']);continue}
  const r=rule(km),last=[...leaves.filter(l=>l.collaborator_id===p.id&&l.starts_on).map(l=>({start:l.starts_on!,end:l.ends_on||l.starts_on!,source:'FOLGA DE CAMPO'})),...history.filter(h=>h.collaborator_id===p.id&&h.starts_on).map(h=>({start:h.starts_on,end:h.ends_on||h.starts_on,source:h.source}))].sort((a,b)=>b.start.localeCompare(a.start))[0],base=last?.start||p.hired_on;
  if(!base){pending.push([p.registration||'—',upper(p.name),'SEM ADMISSÃO / HISTÓRICO']);continue}
  const start=last?addMonths(last.start,r.months):fifth(base,r.months);if(!start){pending.push([p.registration||'—',upper(p.name),'ERRO NO CÁLCULO']);continue}
  const overdue=start<today;if(!filters.months.includes(overdue?'ATRASADAS':start.slice(0,7)))continue;
  const end=last?addMonths(last.end,r.months):addDays(start,r.days-1);
  const program=leaves.filter(l=>l.collaborator_id===p.id&&l.starts_on&&l.starts_on>=today).sort((a,b)=>a.starts_on!.localeCompare(b.starts_on!))[0];
  const amount=program?.reimbursement_amount&&program.reimbursement_amount>0?Number(program.reimbursement_amount):null;
  rows.push({group,name:upper(p.name),overdue,amount,cells:[p.registration||'—',upper(p.name),upper(p.role||'—'),fmt(p.hired_on),`${upper(p.travel_city)||'—'} / ${upper(p.travel_state)||'—'}`,`${km.toLocaleString('pt-BR')} KM`,r.period,`${r.months} MESES / ${r.days} DIAS`,last?dates(last.start,last.end):'ADMISSÃO',dates(start,end),program?dates(program.starts_on!,program.ends_on||program.starts_on!):'—',overdue?'ATRASADA':program?'PROGRAMADA':'SUGERIDA',amount==null?'—':`R$ ${brl(amount)}`]});
 }
 rows.sort((a,b)=>Number(b.overdue)-Number(a.overdue)||a.group.localeCompare(b.group,'pt-BR')||a.name.localeCompare(b.name,'pt-BR'));
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'}),W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),image=await logoData();
 const sectorSummary=filters.sectors.length===1?filters.sectors[0]:`${filters.sectors.length} SETORES SELECIONADOS`;
 const labelPeriod=filters.months.map(m=>m==='ATRASADAS'?'ATRASADAS':`${m.slice(5)}/${m.slice(0,4)}`).join(' | ');
 const headed=new Set<number>();function heading(){const page=doc.getCurrentPageInfo().pageNumber;if(headed.has(page))return;headed.add(page);doc.setCharSpace(0);doc.setTextColor(15);doc.addImage(image,'PNG',8,6,39,19);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('SOLICITAÇÃO DE FOLGA DE CAMPO',W/2,14,{align:'center'});doc.setFontSize(9);doc.text('PROGRAMAÇÃO E SUGESTÃO DE BAIXADAS',W/2,20,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`CENTRO DE CUSTO: 202     ${upper(projectLabel)}`,8,32,{maxWidth:W-16});doc.text(`SETOR / EQUIPE: ${sectorSummary}     PERÍODO: ${labelPeriod}`,8,37,{maxWidth:W-16});doc.setDrawColor(80);doc.line(8,40,W-8,40)}
 heading();let y=44;const widths=[13,47,45,18,38,19,13,21,38,38,38,25,23];
 const groups=[...new Set(rows.map(r=>r.group))];for(const group of groups){if(y>H-47){doc.addPage();heading();y=44}doc.setFillColor(232,232,232);doc.rect(8,y,W-16,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.3);doc.text(group,10,y+5);y+=8;
  autoTable(doc,{startY:y,margin:{left:8,right:8,top:44,bottom:15},head:[['MAT.','COLABORADOR','FUNÇÃO','ADMISSÃO','CIDADE / UF','KM','CICLO','PERÍODO / DIAS','ÚLTIMA BAIXADA','PERÍODO IDEAL','PERÍODO PROGRAMADO','SITUAÇÃO','VALOR']],body:rows.filter(r=>r.group===group).map(r=>r.cells),theme:'grid',showHead:'everyPage',tableWidth:widths.reduce((a,b)=>a+b,0),styles:{font:'helvetica',fontSize:7.2,cellPadding:1.5,textColor:[16,16,16],lineColor:[80,80,80],lineWidth:.12,valign:'middle',overflow:'linebreak'},headStyles:{fillColor:[244,163,64],textColor:[0,0,0],fontStyle:'bold',halign:'center',minCellHeight:8},columnStyles:Object.fromEntries(widths.map((cellWidth,i)=>[i,{cellWidth,halign:[0,3,5,6,7,9,10,11,12].includes(i)?'center':'left'}])),didDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)heading()},didParseCell:d=>{if(d.section==='body'&&d.column.index===11&&d.cell.raw==='ATRASADA'){d.cell.styles.textColor=[165,32,32];d.cell.styles.fontStyle='bold'}}});y=(doc as jsPDF&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+7;
 }
 if(!rows.length){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('NENHUMA SUGESTÃO PARA OS FILTROS SELECIONADOS.',W/2,56,{align:'center'})}
 if(pending.length){if(y>H-55){doc.addPage();heading();y=44}doc.setFillColor(232,232,232);doc.rect(8,y,W-16,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('PENDÊNCIAS CADASTRAIS',10,y+5);autoTable(doc,{startY:y+8,margin:{left:8,right:8,top:44,bottom:16},head:[['MAT.','COLABORADOR','MOTIVO']],body:pending,theme:'grid',styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[244,163,64],textColor:[0,0,0]}})}
 const pages=doc.getNumberOfPages(),cost=rows.reduce((sum,r)=>sum+(r.amount||0),0),valued=rows.filter(r=>r.amount!=null).length;for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(65);doc.text(`${rows.length} SUGESTÕES · ${rows.filter(r=>r.overdue).length} ATRASADAS · ${pending.length} PENDÊNCIAS · VALOR SOMENTE DAS ${valued} FOLGAS JÁ PROGRAMADAS: R$ ${brl(cost)}`,8,H-9,{maxWidth:W-45});doc.text(`PÁGINA ${i}/${pages}`,W-8,H-9,{align:'right'})}
 doc.save(`RELATORIO_SUGESTAO_BAIXADAS_${today}.pdf`);
}
