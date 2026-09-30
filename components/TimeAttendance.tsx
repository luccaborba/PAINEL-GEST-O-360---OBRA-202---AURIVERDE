'use client';
import { systemConfirm } from '@/lib/systemConfirm';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {calculateDay,datesForCompetence,decimalHours,duration,expectedMinutes,kindName,localCompetence,parseProductionClock,productionClock,type ScheduleKind,type TimeEntry} from './timeAttendanceMath';
import {createTimeMirror} from './timeAttendancePdf';
import BatchTimeAttendance from './BatchTimeAttendance';

type Person={id:string;registration:string;name:string;role:string|null;department:string|null};
type Schedule={kind:ScheduleKind;anchor_date:string|null};
type Entry=TimeEntry&{id:string};
type Draft=Omit<TimeEntry,'work_date'|'schedule_kind'>;
const blank:Draft={entry_time:null,break_start:null,break_end:null,exit_time:null,holiday:false,production_minutes:0,note:''};
const dateBR=(value:string)=>value.split('-').reverse().join('/');

type TimeProps={sb:SupabaseClient;projectId:string;projectLabel:string;userId:string;canCreate:boolean;canEdit:boolean;canDelete:boolean;canApprove:boolean;canExport:boolean};
export default function TimeAttendance(props:TimeProps){
 const [mode,setMode]=useState<'batch'|'individual'>('batch');
 return <><div className="cx-time-mode"><button className={mode==='batch'?'cx-primary':''} onClick={()=>setMode('batch')}>Lançamento diário por grupo</button><button className={mode==='individual'?'cx-primary':''} onClick={()=>setMode('individual')}>Espelho individual</button></div>{mode==='batch'?<BatchTimeAttendance {...props}/>:<IndividualTimeAttendance {...props}/>}</>;
}
function IndividualTimeAttendance({sb,projectId,projectLabel,userId,canCreate,canEdit,canDelete,canApprove,canExport}:TimeProps){
 const [competence,setCompetence]=useState(localCompetence);
 const [people,setPeople]=useState<Person[]>([]);const [personId,setPersonId]=useState('');
 const [schedule,setSchedule]=useState<Schedule|null>(null);const [entries,setEntries]=useState<Entry[]>([]);const [closed,setClosed]=useState(false);
 const [holidayDates,setHolidayDates]=useState<string[]>([]);
 const [editingDate,setEditingDate]=useState<string|null>(null);const [draft,setDraft]=useState<Draft>(blank);
 const [productionInput,setProductionInput]=useState('0:00');
 const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [message,setMessage]=useState('');
 const person=people.find(p=>p.id===personId);
 const period=useMemo(()=>datesForCompetence(competence),[competence]);
 const index=useMemo(()=>new Map(entries.map(entry=>[entry.work_date,entry])),[entries]);
 const rows=period.dates.map(date=>({date,entry:index.get(date),calc:calculateDay(index.get(date),schedule?.kind||'OBRA',schedule?.anchor_date||null,date,holidayDates.includes(date))}));
 const totals=rows.reduce((result,row)=>{if(row.entry){result.worked+=row.calc.worked;result.expected+=row.calc.expected;result.extra+=row.calc.extra;result.production+=row.calc.production;}return result;},{worked:0,expected:0,extra:0,production:0});
 const loadPeople=useCallback(async()=>{
  const items:Person[]=[];
  for(let start=0;;start+=1000){const {data,error}=await sb.from('cx_collaborators').select('id,registration,name,role,department').eq('project_id',projectId).order('name').range(start,start+999);if(error){setMessage(error.message);return;}items.push(...(data||[]) as Person[]);if(!data||data.length<1000)break;}
  setPeople(items);setPersonId(old=>items.some(p=>p.id===old)?old:items[0]?.id||'');
 },[sb,projectId]);
 useEffect(()=>{void loadPeople();setPersonId('');setSchedule(null);setEntries([]);},[loadPeople]);
 const refresh=useCallback(async()=>{
  if(!personId)return;
  setLoading(true);setMessage('');
  const [sh,en,pe,ho]=await Promise.all([
   sb.from('cx_time_schedules').select('kind,anchor_date').eq('project_id',projectId).eq('collaborator_id',personId).maybeSingle(),
   sb.from('cx_time_entries').select('id,work_date,entry_time,break_start,break_end,exit_time,holiday,production_minutes,note,schedule_kind,attendance_status,worked_minutes_override,extra_minutes_override').eq('project_id',projectId).eq('collaborator_id',personId).eq('competence',competence).order('work_date'),
   sb.from('cx_time_signoffs').select('closed_at').eq('project_id',projectId).eq('collaborator_id',personId).eq('competence',competence).maybeSingle(),
   sb.from('cx_time_holidays').select('holiday_date').eq('project_id',projectId).eq('competence',competence)
  ]);
  const failure=sh.error||en.error||pe.error||ho.error;
  if(failure)setMessage(`Não foi possível carregar o ponto: ${failure.message}`);
  setSchedule(sh.data as Schedule|null);setEntries((en.data||[]) as Entry[]);setClosed(!!pe.data?.closed_at);setHolidayDates((ho.data||[]).map(row=>row.holiday_date));setLoading(false);
 },[sb,projectId,personId,competence]);
 useEffect(()=>{void refresh();},[refresh]);
 async function saveSchedule(kind:ScheduleKind,anchor:string|null){
  if(busy||closed||!personId||!(schedule?canEdit:canCreate))return;
  if(kind==='VIGIA_12X36'&&!anchor){setMessage('Informe o primeiro plantão da escala 12×36.');return;}
  setBusy(true);setMessage('');
  const {error}=await sb.from('cx_time_schedules').upsert({project_id:projectId,collaborator_id:personId,kind,anchor_date:kind==='VIGIA_12X36'?anchor:null,updated_at:new Date().toISOString()},{onConflict:'project_id,collaborator_id'});
  if(error)setMessage(error.message);else {setSchedule({kind,anchor_date:kind==='VIGIA_12X36'?anchor:null});setMessage('Jornada cadastrada.');}
  setBusy(false);
 }
 function openDay(date:string){if(closed||!schedule)return;const current=index.get(date);if(current&&!canEdit||!current&&!canCreate)return;if(current?.worked_minutes_override!=null&&!current.entry_time){setMessage('Este lançamento resumido pode ser editado na grade diária por grupo.');return;}setDraft(current?{entry_time:current.entry_time?.slice(0,5)||null,break_start:current.break_start?.slice(0,5)||null,break_end:current.break_end?.slice(0,5)||null,exit_time:current.exit_time?.slice(0,5)||null,holiday:holidayDates.includes(date),production_minutes:current.production_minutes,note:current.note}:{...blank,holiday:holidayDates.includes(date)});setProductionInput(productionClock(current?.production_minutes||0));setEditingDate(date);setMessage('');}
 function fillPlanned(){if(!editingDate||!schedule)return;const expected=expectedMinutes(editingDate,schedule.kind,schedule.anchor_date,draft.holiday);if(!expected)return;setDraft(old=>schedule.kind==='VIGIA_12X36'?{...old,entry_time:'18:00',exit_time:'06:00',break_start:null,break_end:null}:expected===240?{...old,entry_time:'07:00',exit_time:'11:00',break_start:null,break_end:null}:{...old,entry_time:'07:00',exit_time:'16:00',break_start:schedule.kind==='OBRA'?'11:00':'12:00',break_end:schedule.kind==='OBRA'?'12:00':'13:00'});}
 async function saveDay(event:React.FormEvent){
  event.preventDefault();if(!editingDate||!schedule||busy||closed)return;
  const existing=index.get(editingDate);if(existing&&!canEdit||!existing&&!canCreate)return;
  if(parseProductionClock(productionInput)===null){setMessage('Informe a produção em horas:minutos, por exemplo 2:45 (até 24:00).');return;}
  const times=[draft.entry_time,draft.break_start,draft.break_end,draft.exit_time];
  if((!!times[0])!==(!!times[3])||(!!times[1])!==(!!times[2])||((!!times[1]||!!times[2])&&!times[0])){setMessage('Preencha entrada e saída juntas; o intervalo precisa das duas marcações.');return;}
  if(schedule.kind==='VIGIA_12X36'&&(draft.break_start||draft.break_end)){setMessage('A escala de vigia cadastrada não possui intervalo.');return;}
  const trial=calculateDay({...draft,work_date:editingDate,schedule_kind:schedule.kind},schedule.kind,schedule.anchor_date,editingDate);
  if(trial.issue==='Horário inválido'||trial.issue==='Intervalo fora da jornada'){setMessage(trial.issue);return;}
  setBusy(true);setMessage('');
  const payload={entry_time:draft.entry_time||null,exit_time:draft.exit_time||null,break_start:draft.break_start||null,break_end:draft.break_end||null,holiday:holidayDates.includes(editingDate),production_minutes:Number(draft.production_minutes),note:draft.note.trim(),schedule_kind:schedule.kind,worked_minutes_override:null,extra_minutes_override:null,attendance_status:schedule.kind==='VIGIA_12X36'?'12X36':'PRESENTE'};
  if(!existing){
   const periodSave=await sb.from('cx_time_periods').upsert({project_id:projectId,competence},{onConflict:'project_id,competence',ignoreDuplicates:true});
   if(periodSave.error){setBusy(false);setMessage(`Não foi possível abrir a competência: ${periodSave.error.message}`);return;}
  }
  const result=existing?await sb.from('cx_time_entries').update(payload).eq('id',existing.id).eq('project_id',projectId).select('id'):
    await sb.from('cx_time_entries').insert({...payload,project_id:projectId,collaborator_id:personId,work_date:editingDate,competence}).select('id');
  if(result.error||!result.data?.length)setMessage(`Não foi possível salvar: ${result.error?.message||'acesso negado'}`);
  else {setEditingDate(null);await refresh();setMessage('Lançamento salvo com histórico de alterações.');}
  setBusy(false);
 }
 async function deleteDay(){
  if(!editingDate||!canDelete||closed||busy)return;const existing=index.get(editingDate);if(!existing||!await systemConfirm(`Excluir lançamento de ${dateBR(editingDate)}?`))return;
  setBusy(true);const {error}=await sb.from('cx_time_entries').delete().eq('id',existing.id).eq('project_id',projectId);if(error)setMessage(error.message);else{setEditingDate(null);await refresh();setMessage('Lançamento excluído; alteração registrada no histórico.');}setBusy(false);
 }
 async function closePeriod(){
  if(!canApprove||busy||closed||!schedule)return;
  const missing=rows.filter(row=>!row.entry&&row.calc.expected>0).length;
  if(!await systemConfirm(`Fechar o espelho de ${person?.name} para ${competence.slice(0,7)}? ${missing} dia(s) previstos ainda sem lançamento. Depois não será possível editar o ponto desta pessoa na competência.`))return;
  setBusy(true);setMessage('');
  const opened=await sb.from('cx_time_periods').upsert({project_id:projectId,competence},{onConflict:'project_id,competence',ignoreDuplicates:true});
  if(opened.error){setMessage(opened.error.message);setBusy(false);return;}
  const {data,error}=await sb.from('cx_time_signoffs').insert({project_id:projectId,collaborator_id:personId,competence,closed_by:userId}).select('competence');
  if(error||!data?.length)setMessage(`Não foi possível fechar: ${error?.message||'espelho já fechado'}`);else{await refresh();setMessage('Espelho individual fechado. O PDF final está disponível.');}setBusy(false);
 }
 async function printMirror(){if(!canExport||!schedule||!person||!entries.length)return;try{const response=await fetch('/ccl-logo-contratos-v1.png');if(!response.ok)throw Error('Logo CCL indisponível');const logo=new Uint8Array(await response.arrayBuffer());createTimeMirror({project:projectLabel,competence,name:person.name,registration:person.registration,kind:schedule.kind,anchorDate:schedule.anchor_date,entries,holidayDates,logo,preview:!closed}).save(`${closed?'espelho':'previa-espelho'}-ponto-${person.registration}-${competence.slice(0,7)}.pdf`);}catch(error){setMessage(`PDF não gerado: ${error instanceof Error?error.message:String(error)}`);}}
 function timeInput(key:'entry_time'|'exit_time'|'break_start'|'break_end',label:string){return <label>{label}<input type="time" value={draft[key]||''} onChange={event=>setDraft(old=>({...old,[key]:event.target.value||null}))}/></label>;}
 return <><div className="heading"><div><span className="eyebrow">PESSOAS · {projectLabel}</span><h1>Ponto e Jornada</h1><p>Lançamento manual e espelho de ponto. Competência de 21 a 20.</p></div></div>
  {message&&<div className="notice" role="status">{message}<button aria-label="Fechar aviso" onClick={()=>setMessage('')}>×</button></div>}
  <div className="panel cx-time-toolbar"><label>Competência<input type="month" value={competence.slice(0,7)} onChange={event=>event.target.value&&setCompetence(event.target.value+'-01')}/></label><label>Colaborador<select value={personId} onChange={event=>setPersonId(event.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.registration} · {p.name}</option>)}</select></label><div><strong>{dateBR(period.start)} a {dateBR(period.end)}</strong><small>{closed?'Espelho individual fechado':'Em conferência'}</small></div>{canApprove&&!closed&&<button type="button" disabled={busy||loading||!schedule} onClick={()=>void closePeriod()}>Fechar espelho</button>}{canExport&&<button type="button" disabled={!entries.length||!schedule||busy||loading} onClick={()=>void printMirror()}>🖨 {closed?'Espelho final PDF':'Prévia PDF'}</button>}</div>
  {person&&<div className="panel cx-time-schedule"><div><strong>Jornada · {person.name}</strong><small>{schedule?kindName[schedule.kind]:'Configure a jornada antes de lançar o ponto.'}</small></div>{!closed&&(canCreate||canEdit)&&<ScheduleForm key={personId} schedule={schedule} busy={busy} onSave={(kind,anchor)=>void saveSchedule(kind,anchor)}/>}</div>}
  <div className="metrics cx-time-metrics"><article className="metric"><span>HORAS TRABALHADAS</span><strong>{duration(totals.worked)}</strong></article><article className="metric"><span>HORAS EXTRAS</span><strong>{duration(totals.extra)}</strong></article><article className="metric"><span>PRODUÇÃO</span><strong>{totals.production} min</strong><small>{decimalHours(totals.production)} h (decimal)</small></article><article className="metric"><span>DIAS PARA CONFERIR</span><strong>{rows.filter(row=>row.calc.expected>0&&!row.entry).length}</strong></article></div>
  <div className="panel"><h2>MARCAÇÕES · {person?.registration||'SELECIONE UM COLABORADOR'}</h2><div className="matrix-scroll"><table className="cx-time-table"><thead><tr><th>DATA</th><th>PREVISTO</th><th>ENTRADA</th><th>INTERVALO</th><th>SAÍDA</th><th>TRABALHADO</th><th>EXTRA</th><th>PRODUÇÃO</th><th>CONFERÊNCIA</th></tr></thead><tbody>{rows.map(({date,entry,calc})=><tr key={date}><td><button type="button" className="cx-time-date" title="Abrir lançamento" disabled={!schedule||closed||(entry?!canEdit:!canCreate)} onClick={()=>openDay(date)}>{dateBR(date)}</button></td><td>{schedule?duration(calc.expected):'—'}</td><td>{entry?.entry_time?.slice(0,5)||'—'}</td><td>{entry?.break_start?`${entry.break_start.slice(0,5)} - ${entry.break_end?.slice(0,5)}`:'—'}</td><td>{entry?.exit_time?.slice(0,5)||'—'}</td><td>{entry?duration(calc.worked):'—'}</td><td>{entry?`${duration(calc.extra)}${calc.extraRate?' · '+calc.extraRate:''}`:'—'}</td><td>{entry?`${entry.production_minutes} min · ${decimalHours(entry.production_minutes)} h`:'—'}</td><td className={calc.issue?'cx-time-issue':''}>{entry?calc.issue||entry.note||'Conferido':calc.expected?'Sem lançamento':'Descanso'}</td></tr>)}</tbody></table></div>{loading&&<p>Carregando lançamentos…</p>}</div>
  {editingDate&&<div className="cx-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setEditingDate(null);}}><div className="panel cx-modal cx-time-modal" role="dialog" aria-modal="true" aria-label={`Ponto ${dateBR(editingDate)}`}><div className="cx-dialog-head"><div><span className="eyebrow">PONTO · {dateBR(editingDate)}</span><h2>{person?.name}</h2></div><button type="button" className="cx-dialog-close" onClick={()=>setEditingDate(null)}>×</button></div><form onSubmit={event=>void saveDay(event)}><div className="cx-time-fields">{timeInput('entry_time','Entrada')}{timeInput('break_start','Saída para intervalo')}{timeInput('break_end','Retorno do intervalo')}{timeInput('exit_time','Saída')}<label>Produção (h:mm)<input type="text" inputMode="numeric" placeholder="2:45" value={productionInput} onChange={event=>{setProductionInput(event.target.value);setDraft(old=>({...old,production_minutes:parseProductionClock(event.target.value)??NaN}));}}/></label>{holidayDates.includes(editingDate)&&<span>Feriado cadastrado na competência · horas extras a 100%</span>}<label className="cx-time-note">Ocorrência / justificativa<textarea value={draft.note} maxLength={1000} onChange={event=>setDraft(old=>({...old,note:event.target.value}))}/></label></div><p>Produção: {Number.isFinite(draft.production_minutes)?`${draft.production_minutes} min = ${decimalHours(draft.production_minutes)} h decimais`:'Informe horas:minutos, por exemplo 2:45.'}</p><div className="cx-form-actions"><button type="button" onClick={fillPlanned}>Preencher jornada prevista</button>{canDelete&&index.has(editingDate)&&<button type="button" disabled={busy} onClick={()=>void deleteDay()}>Excluir</button>}<button type="button" onClick={()=>setEditingDate(null)}>Cancelar</button><button className="cx-primary" disabled={busy}>{busy?'Salvando…':'Salvar dia'}</button></div></form></div></div>}
 </>;
}

function ScheduleForm({schedule,busy,onSave}:{schedule:Schedule|null;busy:boolean;onSave:(kind:ScheduleKind,anchor:string|null)=>void}){
 const [kind,setKind]=useState<ScheduleKind>(schedule?.kind||'OBRA');const [anchor,setAnchor]=useState(schedule?.anchor_date||'');
 useEffect(()=>{setKind(schedule?.kind||'OBRA');setAnchor(schedule?.anchor_date||'');},[schedule?.kind,schedule?.anchor_date]);
 return <div className="cx-time-config"><select aria-label="Jornada" value={kind} onChange={event=>setKind(event.target.value as ScheduleKind)}><option value="OBRA">Obra · 07h–16h · almoço 11h–12h</option><option value="ADMINISTRATIVO">Administrativo · 07h–16h · almoço 12h–13h</option><option value="VIGIA_12X36">Vigia · 18h–06h · escala 12×36</option></select>{kind==='VIGIA_12X36'&&<label>Primeiro plantão<input type="date" required value={anchor} onChange={event=>setAnchor(event.target.value)}/></label>}<button type="button" disabled={busy} onClick={()=>onSave(kind,anchor||null)}>Salvar jornada</button></div>;
}
