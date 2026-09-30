'use client';

import { systemConfirm } from '@/lib/systemConfirm';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {calculateDay,datesForCompetence,localCompetence,parseProductionClock,productionClock,type ScheduleKind,type TimeEntry} from './timeAttendanceMath';

type Status='PRESENTE'|'FALTA'|'FOLGA'|'ATESTADO'|'12X36';
type Person={id:string;registration:string;name:string;sector:string|null;foreman:string|null;department:string|null;status:string;hired_on:string|null;terminated_on:string|null};
type Schedule={collaborator_id:string;kind:ScheduleKind;anchor_date:string|null};
type Stored=TimeEntry&{id:string;collaborator_id:string};
type Draft={status:Status|'',entry_time:string,break_start:string,break_end:string,exit_time:string,production:string};
type Punch='entry_time'|'break_start'|'break_end'|'exit_time';
const blank:Draft={status:'',entry_time:'',break_start:'',break_end:'',exit_time:'',production:''};
const labels:Record<Status,string>={PRESENTE:'Presença',FALTA:'Falta',FOLGA:'Folga',ATESTADO:'Atestado','12X36':'12×36'};
const statuses=Object.keys(labels) as Status[];
const absence=(status:string)=>['FALTA','FOLGA','ATESTADO'].includes(status);
const br=(day:string)=>day.split('-').reverse().join('/');
const hhmm=(minutes:number)=>productionClock(minutes);
const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
function normalizeClock(value:string){
 const clean=value.trim();
 if(clock.test(clean))return clean;
 const separated=/^(\d{1,2}):([0-5]\d)$/.exec(clean);
 if(separated){const result=`${separated[1].padStart(2,'0')}:${separated[2]}`;return clock.test(result)?result:clean;}
 if(!/^\d{1,4}$/.test(clean))return clean;
 const hours=clean.length<=2?clean:clean.slice(0,-2);
 const minutes=clean.length<=2?'00':clean.slice(-2);
 const formatted=`${hours.padStart(2,'0')}:${minutes}`;
 return clock.test(formatted)?formatted:clean;
}

export default function BatchTimeAttendance({sb,projectId,projectLabel,canCreate,canEdit}:{sb:SupabaseClient;projectId:string;projectLabel:string;canCreate:boolean;canEdit:boolean}){
 const [competence,setCompetence]=useState(localCompetence);
 const period=useMemo(()=>datesForCompetence(competence),[competence]);
 const [date,setDate]=useState(period.start);
 const [sector,setSector]=useState(''),[foreman,setForeman]=useState(''),[team,setTeam]=useState('');
 const [people,setPeople]=useState<Person[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]),[entries,setEntries]=useState<Stored[]>([]),[closed,setClosed]=useState<string[]>([]);
 const [holidays,setHolidays]=useState<{holiday_date:string;name:string}[]>([]),[opened,setOpened]=useState(false);
 const [holidayDate,setHolidayDate]=useState(period.start),[holidayName,setHolidayName]=useState('');
 const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[dirty,setDirty]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]),[errors,setErrors]=useState<Record<string,string>>({});
 const [certificates,setCertificates]=useState<Record<string,{id:string;original_name:string;storage_path:string}>>({});
 const [certificateFiles,setCertificateFiles]=useState<Record<string,File>>({});
 const [bulk,setBulk]=useState<Draft>(blank),[replace,setReplace]=useState(false),[undo,setUndo]=useState<{drafts:Record<string,Draft>;dirty:string[]}|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const byEntry=useMemo(()=>new Map(entries.map(e=>[e.collaborator_id,e])),[entries]);
 const bySchedule=useMemo(()=>new Map(schedules.map(s=>[s.collaborator_id,s])),[schedules]);
 const holidaySet=useMemo(()=>new Set(holidays.map(h=>h.holiday_date)),[holidays]);
 const closedSet=new Set(closed);
 const load=useCallback(async()=>{
  setLoading(true);setMessage('');const all:Person[]=[];
  for(let start=0;;start+=1000){const {data,error}=await sb.from('cx_collaborators').select('id,registration,name,sector,foreman,department,status,hired_on,terminated_on').eq('project_id',projectId).order('name').range(start,start+999);if(error){setMessage(error.message);setLoading(false);return;}all.push(...(data||[]) as Person[]);if(!data||data.length<1000)break;}
  const [sc,en,si,pe,ho,docs]=await Promise.all([
   sb.from('cx_time_schedules').select('collaborator_id,kind,anchor_date').eq('project_id',projectId),
   sb.from('cx_time_entries').select('id,collaborator_id,work_date,entry_time,break_start,break_end,exit_time,holiday,production_minutes,note,schedule_kind,attendance_status,worked_minutes_override,extra_minutes_override').eq('project_id',projectId).eq('work_date',date),
   sb.from('cx_time_signoffs').select('collaborator_id').eq('project_id',projectId).eq('competence',competence),
   sb.from('cx_time_periods').select('competence').eq('project_id',projectId).eq('competence',competence).maybeSingle(),
   sb.from('cx_time_holidays').select('holiday_date,name').eq('project_id',projectId).eq('competence',competence).order('holiday_date'),
   sb.from('cx_employee_documents').select('id,collaborator_id,original_name,storage_path').eq('kind','ATESTADO').eq('work_date',date)
  ]);
  const error=sc.error||en.error||si.error||pe.error||ho.error||docs.error;
  if(error){setMessage(`Não foi possível carregar o ponto: ${error.message}`);setLoading(false);return;}
  const stored=(en.data||[]) as Stored[];
  setPeople(all);setSchedules((sc.data||[]) as Schedule[]);setEntries(stored);setClosed((si.data||[]).map(x=>x.collaborator_id));setOpened(!!pe.data);setHolidays(ho.data||[]);
  setCertificates(Object.fromEntries((docs.data||[]).map(doc=>[doc.collaborator_id,doc])));setCertificateFiles({});
  const index=new Map(stored.map(e=>[e.collaborator_id,e]));
  setDrafts(Object.fromEntries(all.map(p=>{const e=index.get(p.id);return [p.id,e?{status:e.attendance_status||'PRESENTE',entry_time:e.entry_time?.slice(0,5)||'',break_start:e.break_start?.slice(0,5)||'',break_end:e.break_end?.slice(0,5)||'',exit_time:e.exit_time?.slice(0,5)||'',production:e.production_minutes?productionClock(e.production_minutes):''}: {...blank}];})));
  setDirty([]);setSelected([]);setErrors({});setUndo(null);setLoading(false);
 },[sb,projectId,competence,date]);
 useEffect(()=>{void load();},[load]);
 const sectors=[...new Set(people.map(p=>p.sector||'SEM SETOR'))].sort();
 const foremen=[...new Set(people.filter(p=>!sector||(p.sector||'SEM SETOR')===sector).map(p=>p.foreman||'SEM ENCARREGADO'))].sort();
 const teams=[...new Set(people.filter(p=>(!sector||(p.sector||'SEM SETOR')===sector)&&(!foreman||(p.foreman||'SEM ENCARREGADO')===foreman)).map(p=>p.department||'SEM EQUIPE'))].sort();
 const visible=people.filter(p=>(!sector||(p.sector||'SEM SETOR')===sector)&&(!foreman||(p.foreman||'SEM ENCARREGADO')===foreman)&&(!team||(p.department||'SEM EQUIPE')===team)&&(!p.hired_on||p.hired_on<=date)&&(!p.terminated_on||p.terminated_on>=date)&&!['INATIVO','DESLIGADO'].includes(p.status));
 const canWrite=(id:string)=>!closedSet.has(id)&&!busy&&(byEntry.has(id)?canEdit:canCreate);
 function change(id:string,patch:Partial<Draft>){setDrafts(old=>({...old,[id]:{...(old[id]||blank),...patch}}));setDirty(old=>old.includes(id)?old:[...old,id]);setErrors(old=>{const next={...old};delete next[id];return next;});setUndo(null);}
 async function switchDay(nextCompetence:string,nextDate:string){if(dirty.length&&!await systemConfirm('Há alterações não salvas. Descartar e mudar de data?'))return;setCompetence(nextCompetence);setDate(nextDate);setHolidayDate(datesForCompetence(nextCompetence).start);setCertificateFiles({});}
 function move(n:number){const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+n);const value=next.toISOString().slice(0,10);if(value>=period.start&&value<=period.end)switchDay(competence,value);}
 async function openPeriod(){if(!canCreate||opened)return;setBusy(true);const {error}=await sb.from('cx_time_periods').insert({project_id:projectId,competence});if(error)setMessage(error.message);else{setOpened(true);setMessage('Competência aberta. Cadastre os feriados antes de lançar o ponto.');}setBusy(false);}
 async function addHoliday(){if(!opened||!canCreate||!holidayName.trim())return;if(holidayDate<period.start||holidayDate>period.end){setMessage('Escolha uma data dentro da competência.');return;}setBusy(true);const {error}=await sb.from('cx_time_holidays').insert({project_id:projectId,competence,holiday_date:holidayDate,name:holidayName.trim()});if(error)setMessage(error.message);else{setHolidayName('');setHolidays(old=>[...old,{holiday_date:holidayDate,name:holidayName.trim()}].sort((a,b)=>a.holiday_date.localeCompare(b.holiday_date)));setMessage('Feriado cadastrado para toda a obra.');}setBusy(false);}
 async function removeHoliday(value:string){if(!canEdit||!await systemConfirm(`Excluir o feriado de ${br(value)} da competência?`))return;setBusy(true);const {error}=await sb.from('cx_time_holidays').delete().eq('project_id',projectId).eq('holiday_date',value);if(error)setMessage(error.message);else setHolidays(old=>old.filter(h=>h.holiday_date!==value));setBusy(false);}
 function evaluate(p:Person,d:Draft){const schedule=bySchedule.get(p.id),stored=byEntry.get(p.id);
  if(closedSet.has(p.id))return {error:'Espelho fechado.',calc:null};if(stored&&!canEdit||!stored&&!canCreate)return {error:'Sem permissão.',calc:null};
  if(!d.status)return {error:'Selecione a situação.',calc:null};
  if((d.status==='12X36')!==(schedule?.kind==='VIGIA_12X36'))return {error:'Configure a escala 12×36 no espelho individual.',calc:null};
  if(d.status==='ATESTADO'&&!certificates[p.id]&&!certificateFiles[p.id])return {error:'Anexe o atestado no dossiê para salvar.',calc:null};
  if(absence(d.status))return {error:'',calc:null};
  for(const key of ['entry_time','break_start','break_end','exit_time'] as Punch[])if(d[key]&&!clock.test(d[key]))return {error:'Horário inválido; use 00:00 a 23:59.',calc:null};
  if(!d.entry_time||!d.exit_time)return {error:'Informe entrada e saída.',calc:null};
  if(!!d.break_start!==!!d.break_end)return {error:'Preencha início e fim do intervalo.',calc:null};
  const production=d.production?parseProductionClock(d.production):0;if(production===null)return {error:'Produção: use h:mm, com minutos de 00 a 59.',calc:null};
  const entry:TimeEntry={work_date:date,entry_time:d.entry_time,break_start:d.break_start||null,break_end:d.break_end||null,exit_time:d.exit_time,holiday:holidaySet.has(date),production_minutes:production,note:'',schedule_kind:schedule?.kind||'OBRA',attendance_status:d.status,worked_minutes_override:null,extra_minutes_override:null};
  const calc=calculateDay(entry,entry.schedule_kind,schedule?.anchor_date||null,date,holidaySet.has(date));
  if(calc.issue==='Horário inválido'||calc.issue==='Intervalo fora da jornada')return {error:calc.issue,calc:null};
  return {error:'',calc};
 }
 async function applyBulk(){if(!selected.length)return;if(!bulk.status&&!bulk.entry_time&&!bulk.break_start&&!bulk.break_end&&!bulk.exit_time&&!bulk.production){setMessage('Preencha um campo para aplicar.');return;}
  const targets=selected.filter(id=>canWrite(id)&&(replace||!byEntry.has(id)));if(replace&&!await systemConfirm(`Substituir os campos preenchidos em ${targets.length} linha(s)?`))return;
  const next={...drafts};let changed=0;for(const id of targets){const before=drafts[id]||blank,after={...before};for(const field of ['status','entry_time','break_start','break_end','exit_time','production'] as (keyof Draft)[]){if(bulk[field]&&(replace||!after[field]))(after as Record<string,string>)[field]=bulk[field];}if(absence(after.status)){after.entry_time='';after.break_start='';after.break_end='';after.exit_time='';after.production='';}if(JSON.stringify(before)!==JSON.stringify(after)){next[id]=after;changed++;}}
  setUndo({drafts,dirty});setDrafts(next);setDirty(old=>[...new Set([...old,...targets.filter(id=>next[id]!==drafts[id])])]);setErrors({});setMessage(`Aplicado em ${changed} linha(s); ${selected.length-changed} ignorada(s).`);
 }
 async function save(){if(!opened){setMessage('Abra a competência e cadastre seus feriados antes de salvar.');return;}if(!dirty.length||busy)return;
  const invalid:Record<string,string>={};for(const p of people.filter(p=>dirty.includes(p.id))){const issue=evaluate(p,drafts[p.id]||blank).error;if(issue)invalid[p.id]=issue;}
  const ready=people.filter(p=>dirty.includes(p.id)&&!invalid[p.id]);setErrors(invalid);if(!ready.length){setMessage('Corrija as linhas com erro.');return;}
  setBusy(true);let count=0;for(const p of ready){const d=drafts[p.id],stored=byEntry.get(p.id),schedule=bySchedule.get(p.id);
   if(d.status==='ATESTADO'&&!certificates[p.id]){
    const file=certificateFiles[p.id];const {data:auth}=await sb.auth.getUser();
    if(!file||!auth.user){invalid[p.id]='Sessão expirada ou atestado não selecionado.';continue;}
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
    const path=`atestados/${p.id}/${crypto.randomUUID()}-${safeName}`;
    const uploaded=await sb.storage.from('cx-employee-private').upload(path,file,{contentType:file.type,upsert:false});
    if(uploaded.error){invalid[p.id]=`Atestado não enviado: ${uploaded.error.message}`;continue;}
    const document=await sb.from('cx_employee_documents').insert({collaborator_id:p.id,kind:'ATESTADO',period:competence,work_date:date,storage_path:path,original_name:file.name,uploaded_by:auth.user.id}).select('id').single();
    if(document.error){invalid[p.id]=`Arquivo enviado, mas o dossiê não foi atualizado: ${document.error.message}`;continue;}
    setCertificates(old=>({...old,[p.id]:{id:document.data.id,original_name:file.name,storage_path:path}}));
   }
   if(!schedule){const created=await sb.from('cx_time_schedules').insert({project_id:projectId,collaborator_id:p.id,kind:'OBRA',anchor_date:null});if(created.error){invalid[p.id]=created.error.message;continue;}}
   const missing=absence(d.status),payload={attendance_status:d.status,entry_time:missing?null:d.entry_time||null,break_start:missing?null:d.break_start||null,break_end:missing?null:d.break_end||null,exit_time:missing?null:d.exit_time||null,production_minutes:missing?0:parseProductionClock(d.production||'0:00'),holiday:holidaySet.has(date),note:stored?.note||'',schedule_kind:schedule?.kind||'OBRA',worked_minutes_override:null,extra_minutes_override:null};
   const result=stored?await sb.from('cx_time_entries').update(payload).eq('project_id',projectId).eq('id',stored.id).select('id'):await sb.from('cx_time_entries').insert({...payload,project_id:projectId,collaborator_id:p.id,work_date:date,competence}).select('id');
   if(result.error||!result.data?.length)invalid[p.id]=result.error?.message||'Acesso negado';else count++;
  }
  const retained=Object.fromEntries(Object.keys(invalid).map(id=>[id,drafts[id]]));await load();if(Object.keys(invalid).length){setDrafts(old=>({...old,...retained}));setDirty(Object.keys(invalid));setErrors(invalid);}setMessage(`${count} linha(s) salva(s).${Object.keys(invalid).length?' Corrija as linhas com erro.':''}`);setBusy(false);
 }
 const totals=visible.reduce((sum,p)=>{if(!errors[p.id]){const result=evaluate(p,drafts[p.id]||blank).calc;if(result){sum.worked+=result.worked;sum.extra+=result.extra;sum.production+=result.production;}}return sum;},{worked:0,extra:0,production:0});
 const field=(p:Person,d:Draft,key:Punch)=><input data-field={key} type="text" inputMode="numeric" placeholder="00:00" aria-label={`${key} de ${p.name}`} value={d[key]} disabled={!canWrite(p.id)||absence(d.status)} onChange={e=>change(p.id,{[key]:e.target.value})} onBlur={e=>{const formatted=normalizeClock(e.target.value);if(formatted!==e.target.value)change(p.id,{[key]:formatted});}}/>;
 function selectCertificate(id:string,file:File|undefined){if(!file){setCertificateFiles(old=>{const next={...old};delete next[id];return next;});return;}
  if(file.size>10*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type)){setCertificateFiles(old=>{const next={...old};delete next[id];return next;});setErrors(old=>({...old,[id]:'Envie PDF, JPG ou PNG de até 10 MB.'}));return;}
  setCertificateFiles(old=>({...old,[id]:file}));setDirty(old=>old.includes(id)?old:[...old,id]);setErrors(old=>{const next={...old};delete next[id];return next;});}
 async function downloadCertificate(id:string){const doc=certificates[id];if(!doc)return;const {data,error}=await sb.storage.from('cx-employee-private').download(doc.storage_path);if(error||!data){setMessage('Não foi possível abrir o atestado.');return;}const url=URL.createObjectURL(data);const anchor=document.createElement('a');anchor.href=url;anchor.download=doc.original_name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return <><div className="heading"><div><span className="eyebrow">PESSOAS · {projectLabel}</span><h1>Ponto › Lançamento diário</h1><p>Por grupo e dia · competência de {br(period.start)} a {br(period.end)}.</p></div></div>
 {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Fechar aviso">×</button></div>}
 <div className="panel cx-time-grid-toolbar"><label>COMPETÊNCIA<input type="month" value={competence.slice(0,7)} onChange={e=>{if(e.target.value){const c=e.target.value+'-01';switchDay(c,datesForCompetence(c).start);}}}/></label><label>DATA<div className="cx-time-date-nav"><button onClick={()=>move(-1)} disabled={date<=period.start}>◂</button><input type="date" min={period.start} max={period.end} value={date} onChange={e=>switchDay(competence,e.target.value)}/><button onClick={()=>move(1)} disabled={date>=period.end}>▸</button></div></label><label>SETOR<select value={sector} onChange={e=>{setSector(e.target.value);setForeman('');setTeam('');}}><option value="">TODOS</option>{sectors.map(s=><option key={s}>{s}</option>)}</select></label><label>ENCARREGADO<select value={foreman} onChange={e=>{setForeman(e.target.value);setTeam('');}}><option value="">TODOS</option>{foremen.map(s=><option key={s}>{s}</option>)}</select></label><label>EQUIPE<select value={team} onChange={e=>setTeam(e.target.value)}><option value="">TODAS</option>{teams.map(s=><option key={s}>{s}</option>)}</select></label><button disabled={loading||busy||dirty.length>0} onClick={()=>void load()}>Carregar grupo</button></div>
 <div className="panel cx-time-holidays"><strong>COMPETÊNCIA · FERIADOS</strong>{!opened?<button disabled={!canCreate||busy} onClick={()=>void openPeriod()}>Abrir competência</button>:<><span>Aberta · {br(period.start)} a {br(period.end)}</span><label>DATA<input type="date" min={period.start} max={period.end} value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></label><label>FERIADO<input value={holidayName} maxLength={120} placeholder="Nome do feriado" onChange={e=>setHolidayName(e.target.value)}/></label><button disabled={!canCreate||busy||holidayName.trim().length<2} onClick={()=>void addHoliday()}>Cadastrar feriado</button></>}{holidays.map(h=><span className="cx-time-holiday-chip" key={h.holiday_date}>{br(h.holiday_date)} · {h.name} {canEdit&&<button disabled={busy} onClick={()=>void removeHoliday(h.holiday_date)} aria-label={`Excluir ${h.name}`}>×</button>}</span>)}{holidaySet.has(date)&&<small>O dia selecionado é feriado: horas extras a 100%.</small>}</div>
 <div className="panel cx-time-grid-panel"><div className="cx-time-grid-summary"><span>{visible.length} colaboradores</span><span>{visible.filter(p=>!byEntry.has(p.id)&&!dirty.includes(p.id)).length} sem lançamento</span><span>✎ {dirty.length} alterados</span><span>✔ {visible.filter(p=>byEntry.has(p.id)&&!dirty.includes(p.id)).length} salvos</span><span>✖ {Object.keys(errors).length} com erro</span></div><div className="matrix-scroll cx-time-grid-scroll"><table className="cx-time-grid-table" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void save();}}}><thead><tr><th><input type="checkbox" tabIndex={-1} aria-label="Selecionar grupo visível" checked={!!visible.length&&visible.every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked?visible.map(p=>p.id):[])}/></th><th>MAT.</th><th>NOME</th><th>SITUAÇÃO</th><th>ENTRADA</th><th>INÍCIO INTERVALO</th><th>FIM INTERVALO</th><th>SAÍDA</th><th>TRABALHADO</th><th>EXTRA</th><th>PRODUÇÃO</th></tr></thead><tbody>{visible.map(p=>{const d=drafts[p.id]||blank,saved=byEntry.has(p.id),{calc}=evaluate(p,d);return <tr key={p.id} className={errors[p.id]?'cx-time-grid-error':dirty.includes(p.id)?'cx-time-grid-dirty':saved?'cx-time-grid-saved':''}><td><input type="checkbox" tabIndex={-1} aria-label={`Selecionar ${p.name}`} checked={selected.includes(p.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/></td><td>{p.registration}</td><td title={`${p.sector||''} · ${p.foreman||''} · ${p.department||''}`}>{p.name}{closedSet.has(p.id)?' 🔒':''}</td><td><select aria-label={`Situação de ${p.name}`} value={d.status} disabled={!canWrite(p.id)} onChange={e=>{const status=e.target.value as Status;change(p.id,absence(status)?{status,entry_time:'',break_start:'',break_end:'',exit_time:'',production:''}:{status});}}><option value="">Selecione</option>{statuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select>{d.status==='ATESTADO'&&<div className="cx-time-certificate"><label>ATESTADO NO DOSSIÊ<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={!canWrite(p.id)||!!certificates[p.id]} onChange={e=>selectCertificate(p.id,e.target.files?.[0])}/></label>{certificates[p.id]?<button type="button" onClick={()=>void downloadCertificate(p.id)}>Abrir anexo</button>:certificateFiles[p.id]?<small>{certificateFiles[p.id].name}</small>:<small>Anexo obrigatório</small>}</div>}{errors[p.id]&&<small className="cx-time-row-error" role="alert">{errors[p.id]}</small>}</td><td>{field(p,d,'entry_time')}</td><td>{field(p,d,'break_start')}</td><td>{field(p,d,'break_end')}</td><td>{field(p,d,'exit_time')}</td><td>{calc?hhmm(calc.worked):'—'}</td><td>{calc?`${hhmm(calc.extra)}${calc.extraRate?` · ${calc.extraRate}`:''}`:'—'}</td><td><input type="text" inputMode="numeric" placeholder="00:00" aria-label={`Produção de ${p.name}`} value={d.production} disabled={!canWrite(p.id)||absence(d.status)} onChange={e=>change(p.id,{production:e.target.value})}/></td></tr>;})}</tbody><tfoot><tr><th colSpan={8}>TOTAIS DO GRUPO</th><th>{hhmm(totals.worked)}</th><th>{hhmm(totals.extra)}</th><th>{hhmm(totals.production)}</th></tr></tfoot></table></div>{loading&&<p>Carregando colaboradores…</p>}{!loading&&!visible.length&&<p>Nenhum colaborador neste grupo para a data escolhida.</p>}
 {!!selected.length&&<div className="cx-time-bulk"><strong>{selected.length} selecionados · Aplicar em lote</strong><label>Situação<select value={bulk.status} onChange={e=>setBulk(old=>({...old,status:e.target.value as Status}))}><option value="">Não alterar</option>{statuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>{(['entry_time','break_start','break_end','exit_time'] as Punch[]).map(key=><label key={key}>{({entry_time:'Entrada',break_start:'Início intervalo',break_end:'Fim intervalo',exit_time:'Saída'} as Record<Punch,string>)[key]}<input type="text" inputMode="numeric" placeholder="00:00" value={bulk[key]} onChange={e=>setBulk(old=>({...old,[key]:e.target.value}))} onBlur={e=>setBulk(old=>({...old,[key]:normalizeClock(e.target.value)}))}/></label>)}<label>Produção<input placeholder="00:00" value={bulk.production} onChange={e=>setBulk(old=>({...old,production:e.target.value}))}/></label><label>Modo<select value={replace?'replace':'empty'} onChange={e=>setReplace(e.target.value==='replace')}><option value="empty">Só onde está vazio</option><option value="replace">Substituir</option></select></label><button onClick={applyBulk}>Aplicar às linhas</button><button disabled={!undo} onClick={()=>{if(undo){setDrafts(undo.drafts);setDirty(undo.dirty);setUndo(null);}}}>Desfazer</button><small>Campos em branco não alteram dados. Linhas salvas são ignoradas no modo padrão.</small></div>}</div>
 <div className="cx-time-savebar"><span>Pendente: {dirty.length} linha(s) · {Object.keys(errors).length} com erro</span><button className="cx-primary" disabled={busy||!dirty.length||!opened} onClick={()=>void save()}>{busy?'Salvando…':`Salvar ${dirty.length} linha(s)`}</button><button disabled={busy||!dirty.length} onClick={()=>void load()}>Descartar</button></div></>;
}
