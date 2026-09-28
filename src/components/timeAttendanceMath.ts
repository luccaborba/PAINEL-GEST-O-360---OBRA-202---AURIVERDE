export type ScheduleKind='OBRA'|'ADMINISTRATIVO'|'VIGIA_12X36';
export type TimeEntry={id?:string;work_date:string;entry_time:string|null;break_start:string|null;break_end:string|null;exit_time:string|null;holiday:boolean;production_minutes:number;note:string;schedule_kind:ScheduleKind;attendance_status?:'PRESENTE'|'FALTA'|'FOLGA'|'ATESTADO'|'12X36';worked_minutes_override?:number|null;extra_minutes_override?:number|null};
export const kindName:Record<ScheduleKind,string>={OBRA:'Equipe de obra',ADMINISTRATIVO:'Administrativo',VIGIA_12X36:'Vigia 12×36'};
export function datesForCompetence(competence:string){
 const [year,month]=competence.split('-').map(Number);
 if(!year||!month||month<1||month>12)throw Error('Competência inválida');
 const start=new Date(Date.UTC(year,month-2,21));const end=new Date(Date.UTC(year,month-1,20));
 const dates:string[]=[];for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));
 return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),dates};
}
export function localCompetence(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);
 const year=Number(parts.find(p=>p.type==='year')?.value);const month=Number(parts.find(p=>p.type==='month')?.value);const day=Number(parts.find(p=>p.type==='day')?.value);
 const next=new Date(Date.UTC(year,month-1+(day>=21?1:0),1));return next.toISOString().slice(0,7)+'-01';
}
const minutes=(time:string)=>{const [hours,mins]=time.slice(0,5).split(':').map(Number);return hours*60+mins;};
const utcDay=(date:string)=>new Date(`${date}T00:00:00Z`).getUTCDay();
export function expectedMinutes(date:string,kind:ScheduleKind,anchorDate:string|null,holiday=false){
 if(holiday)return 0;
 if(kind==='VIGIA_12X36'){
  if(!anchorDate)return 0;
  const days=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(anchorDate+'T00:00:00Z'))/86400000);
  return days%2===0?720:0;
 }
 const day=utcDay(date);return day===0?0:day===6?240:480;
}
export function calculateDay(entry:TimeEntry|undefined,kind:ScheduleKind,anchorDate:string|null,date:string,holidayOverride?:boolean){
 const holiday=holidayOverride??entry?.holiday??false;
 const expected=expectedMinutes(date,kind,anchorDate,holiday);
 const day=utcDay(date);
 const rate=(extra:number)=>extra?(holiday||day===0?'100%':day===6?'60%':'A conferir'):null;
 if(entry&&['FALTA','FOLGA','ATESTADO'].includes(entry.attendance_status||''))return {expected,worked:0,extra:0,production:0,issue:null,extraRate:null as string|null};
 if(entry?.worked_minutes_override!=null||entry?.extra_minutes_override!=null){
  const worked=entry.worked_minutes_override??0,extra=entry.extra_minutes_override??Math.max(0,worked-expected);
  return {expected,worked,extra,production:entry.production_minutes||0,issue:extra>120?'Mais de 2 horas extras':null,extraRate:rate(extra)};
 }
 if(!entry?.entry_time||!entry.exit_time)return {expected,worked:0,extra:0,production:entry?.production_minutes||0,issue:expected>0?'Sem marcações':null,extraRate:null as string|null};
 let start=minutes(entry.entry_time),end=minutes(entry.exit_time);if(end<=start)end+=1440;
 let breakMinutes=0;
 if(entry.break_start&&entry.break_end){let from=minutes(entry.break_start),to=minutes(entry.break_end);if(from<start)from+=1440;if(to<from)to+=1440;breakMinutes=to-from;if(from<start||to>end||breakMinutes<0)return {expected,worked:0,extra:0,production:entry.production_minutes,issue:'Intervalo fora da jornada',extraRate:null};}
 const worked=end-start-breakMinutes;
 if(worked>1440||worked<=0)return {expected,worked:0,extra:0,production:entry.production_minutes,issue:'Horário inválido',extraRate:null};
 const extra=Math.max(0,worked-expected);
 const extraRate=rate(extra);
 return {expected,worked,extra,production:entry.production_minutes,issue:extra>120?'Mais de 2 horas extras':null,extraRate};
}
export const duration=(minutesValue:number)=>`${Math.floor(minutesValue/60)}h${String(minutesValue%60).padStart(2,'0')}`;
export const decimalHours=(minutesValue:number)=>Number((minutesValue/60).toFixed(2)).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export const productionClock=(value:number)=>`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
export function parseProductionClock(value:string):number|null{
 const match=/^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
 if(!match)return null;
 const minutes=Number(match[1])*60+Number(match[2]);
 return minutes<=1440?minutes:null;
}
