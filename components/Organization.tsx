'use client';
import { useEffect,useMemo,useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Sector={id:string;name:string;active:boolean};
type Team={id:string;sector_id:string;name:string;active:boolean};
type Colab={id:string;registration:string|null;name:string;role:string|null;department:string|null;sector:string|null;sector_id:string|null;team_id:string|null;hired_on:string|null;status:string|null;foreman:string|null};
const norm=(v?:string|null)=>(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[m]||m));
function experience(hired?:string|null){if(!hired)return '—';const d=new Date(hired+'T12:00:00');if(Number.isNaN(+d))return '—';const end=new Date(d);end.setDate(end.getDate()+90);const now=new Date();if(now<=end){const days=Math.max(0,Math.ceil((+end-+now)/86400000));return `EM EXPERIÊNCIA · ${days}D`;}return 'EFETIVADO';}
export default function Organization({sb,projectId,projectLabel,canEdit}:{sb:SupabaseClient;projectId:string;projectLabel:string;canEdit:boolean}){
 const [sectors,setSectors]=useState<Sector[]>([]),[teams,setTeams]=useState<Team[]>([]),[cols,setCols]=useState<Colab[]>([]),[sector,setSector]=useState(''),[team,setTeam]=useState(''),[sectorId,setSectorId]=useState(''),[msg,setMsg]=useState('');
 const [filterSectors,setFilterSectors]=useState<string[]>([]),[filterTeams,setFilterTeams]=useState<string[]>([]),[filterRole,setFilterRole]=useState('');
 async function load(){const [a,b,c]=await Promise.all([sb.from('cx_sectors').select('id,name,active').eq('project_id',projectId).eq('active',true).order('name'),sb.from('cx_teams').select('id,sector_id,name,active').eq('project_id',projectId).eq('active',true).order('name'),sb.from('cx_collaborators').select('id,registration,name,role,department,sector,sector_id,team_id,hired_on,status,foreman').eq('project_id',projectId).eq('status','ATIVO').order('name')]);setSectors((a.data||[]) as Sector[]);setTeams((b.data||[]) as Team[]);setCols((c.data||[]) as Colab[]);if(a.error||b.error||c.error)setMsg(a.error?.message||b.error?.message||c.error?.message||'Erro')}
 useEffect(()=>{void load()},[projectId]);
 const sectorMap=useMemo(()=>new Map(sectors.map(x=>[x.id,x.name])),[sectors]); const teamMap=useMemo(()=>new Map(teams.map(x=>[x.id,x.name])),[teams]);
 const sectorOptions=useMemo(()=>sectors.slice().sort((a,b)=>a.name.localeCompare(b.name)),[sectors]);
 const roles=useMemo(()=>Array.from(new Set(cols.map(c=>c.role?.trim()).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b)),[cols]);
 const members=useMemo(()=>cols.filter(c=>(!filterSectors.length&&!filterTeams.length||filterTeams.length?filterTeams.includes(c.team_id||''):filterSectors.includes(c.sector_id||''))&&(!filterRole||norm(c.role)===norm(filterRole))),[cols,filterSectors,filterTeams,filterRole]);
 const cargoCounts=useMemo(()=>{const m=new Map<string,number>();members.forEach(c=>{const k=(c.role||'SEM FUNÇÃO').trim();m.set(k,(m.get(k)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));},[members]);
 const teamCounts=useMemo(()=>{const m=new Map<string,number>();members.forEach(c=>{const k=teamMap.get(c.team_id||'')||c.department||'NÃO INFORMADO';m.set(k,(m.get(k)||0)+1)});return [...m.entries()].sort((a,b)=>b[1]-a[1]);},[members,teamMap]);
 const inExp=members.filter(c=>experience(c.hired_on).startsWith('EM ')).length; const avg=teamCounts.length?members.length/teamCounts.length:0;
 const row=(c:Colab)=>[c.registration||'',c.name,c.role||'',teamMap.get(c.team_id||'')||c.department||'',sectorMap.get(c.sector_id||'')||c.sector||'',experience(c.hired_on)];
 async function addSector(){if(!sector.trim())return;const {error}=await sb.from('cx_sectors').insert({project_id:projectId,name:sector.trim().toUpperCase(),active:true});if(error)setMsg(error.code==='23505'?'Setor já cadastrado.':error.message);else{setSector('');setMsg('Setor cadastrado.');await load()}}
 async function addTeam(){if(!sectorId||!team.trim())return;const {error}=await sb.from('cx_teams').insert({project_id:projectId,sector_id:sectorId,name:team.trim().toUpperCase(),active:true});if(error)setMsg(error.code==='23505'?'Equipe já cadastrada neste setor.':error.message);else{setTeam('');setMsg('Equipe cadastrada.');await load()}}
 function reportFilter(){const selectedS=sectorOptions.filter(x=>filterSectors.includes(x.id)).map(x=>x.name);const selectedT=teams.filter(x=>filterTeams.includes(x.id)).map(x=>x.name);return [selectedS.length?`Setor: ${selectedS.join(', ')}`:'',selectedT.length?`Equipe: ${selectedT.join(', ')}`:'',filterRole?`Cargo: ${filterRole}`:''].filter(Boolean).join(' · ')||'Todos os setores (nenhum filtro aplicado)'}
 function toggleSector(id:string){const ids=teams.filter(t=>t.sector_id===id).map(t=>t.id);const all=ids.length>0&&ids.every(x=>filterTeams.includes(x));setFilterSectors(v=>all?v.filter(x=>x!==id):Array.from(new Set([...v,id])));setFilterTeams(v=>all?v.filter(x=>!ids.includes(x)):Array.from(new Set([...v,...ids])))}
 function toggleTeam(id:string,sectorId:string){setFilterTeams(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);setFilterSectors(v=>v.filter(x=>x!==sectorId))}
 function exportPdf(){const doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});const w=doc.internal.pageSize.getWidth();doc.setFillColor(20,21,23);doc.rect(0,0,w,60,'F');doc.setTextColor(245,197,24);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('Organograma Setor/Equipe — Relatório',30,27);doc.setTextColor(230);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text(`Construtora Centro Leste · ${projectLabel}`,30,44);doc.setTextColor(20);doc.setFontSize(10);doc.text(`Filtro aplicado: ${reportFilter()}`,30,78);doc.text(`Total de colaboradores: ${members.length}    |    Gerado em: ${new Date().toLocaleString('pt-BR')}`,30,93);autoTable(doc,{startY:110,head:[['Mat.','Nome','Função','Equipe','Setor','Experiência']],body:members.map(row),styles:{fontSize:8.5,cellPadding:4},headStyles:{fillColor:[31,56,100],textColor:255},alternateRowStyles:{fillColor:[245,245,245]},margin:{left:30,right:30}});doc.save(`organograma_setor_equipe_${new Date().toISOString().slice(0,10)}.pdf`)}
 function exportXls(){const data=[['Organograma Setor/Equipe — Relatório'],[`Construtora Centro Leste · ${projectLabel}`],[],['Filtro aplicado',reportFilter()],['Total de colaboradores',members.length],['Gerado em',new Date().toLocaleString('pt-BR')],[],['Por Cargo'],['Cargo','Quantidade'],...cargoCounts,[],['Colaboradores'],['Matrícula','Nome','Função','Equipe','Setor','Experiência'],...members.map(row)];const html=`<html><head><meta charset="utf-8"></head><body><table>${data.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',html],{type:'application/vnd.ms-excel'}));a.download=`organograma_setor_equipe_${new Date().toISOString().slice(0,10)}.xls`;a.click();URL.revokeObjectURL(a.href)}
 function exportVisual(){
  if(!filterSectors.length&&!filterTeams.length&&!filterRole){setMsg('Selecione um filtro de Setor/Equipe ou Cargo antes de gerar o organograma visual.');return}
  if(!members.length){setMsg('Nenhum colaborador encontrado com o filtro atual.');return}
  const doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a3'}),w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();
  const yellow:[number,number,number]=[245,197,24],dark:[number,number,number]=[20,21,23],line:[number,number,number]=[55,55,55];
  const box=(x:number,y:number,bw:number,bh:number,title:string,sub='',fill:[number,number,number]=[255,255,255])=>{doc.setFillColor(...fill);doc.setDrawColor(...line);doc.setLineWidth(1);doc.roundedRect(x,y,bw,bh,5,5,'FD');doc.setTextColor(...dark);doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text(doc.splitTextToSize(title,bw-12),x+bw/2,y+15,{align:'center'});if(sub){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(doc.splitTextToSize(sub,bw-12),x+bw/2,y+bh-9,{align:'center'})}};
  const header=()=>{doc.setFillColor(...dark);doc.rect(0,0,w,58,'F');doc.setTextColor(...yellow);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('ORGANOGRAMA — CASCATA HIERÁRQUICA',32,27);doc.setTextColor(235);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text(`Construtora Centro Leste · ${projectLabel} · ${reportFilter()}`,32,44,{maxWidth:w-64})};
  const footer=()=>{doc.setTextColor(100);doc.setFontSize(7);doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`,w-32,h-18,{align:'right'})};
  header();
  const groups=Array.from(new Set(members.map(c=>c.sector_id||'').filter(Boolean))).map(sid=>({sid,name:sectorMap.get(sid)||'SETOR',people:members.filter(c=>c.sector_id===sid)})).filter(g=>g.people.length);
  if(!groups.length)groups.push({sid:'',name:filterRole||'ORGANOGRAMA',people:members});
  const left=34,sectorW=165,teamW=185,roleW=190,namesW=Math.max(260,w-left-sectorW-teamW-roleW-105),gapX=42;
  const sectorX=left,teamX=sectorX+sectorW+gapX,roleX=teamX+teamW+gapX,namesX=roleX+roleW+gapX;
  let y=84;
  const newPage=()=>{footer();doc.addPage();header();y=84};
  for(const g of groups){
   const teamGroups=Array.from(new Set(g.people.map(c=>c.team_id||'SEM_EQUIPE'))).map(tid=>({tid,name:tid==='SEM_EQUIPE'?'SEM EQUIPE':teamMap.get(tid)||'EQUIPE',people:g.people.filter(c=>(c.team_id||'SEM_EQUIPE')===tid)}));
   let sectorDrawn=false;
   for(const tg of teamGroups){
    const rolesInTeam=Array.from(new Set(tg.people.map(c=>(c.role||'SEM FUNÇÃO').trim()))).sort();
    let teamDrawn=false;
    for(const role of rolesInTeam){
     const rp=tg.people.filter(c=>(c.role||'SEM FUNÇÃO').trim()===role);
     const nameLines=rp.map(c=>c.name);
     const rowH=Math.max(48,20+nameLines.length*10);
     if(y+rowH>h-40){newPage();sectorDrawn=false;teamDrawn=false}
     const cy=y+24;
     if(!sectorDrawn){box(sectorX,y,sectorW,48,g.name,`${g.people.length} colaborador(es)`,yellow);sectorDrawn=true}
     if(!teamDrawn){box(teamX,y,teamW,48,tg.name,`${tg.people.length} pessoa(s)`,[242,242,242]);doc.setDrawColor(...line);doc.setLineWidth(1.3);doc.line(sectorX+sectorW,y+24,teamX,y+24);teamDrawn=true}
     box(roleX,y,roleW,48,role,`${rp.length} pessoa(s)`,[255,249,219]);
     doc.setDrawColor(...line);doc.setLineWidth(1.1);doc.line(teamX+teamW,cy,roleX,cy);
     doc.line(roleX+roleW,cy,namesX,cy);
     doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.setTextColor(...dark);
     let ny=y+12;nameLines.forEach(n=>{doc.text(doc.splitTextToSize(n,namesW-10),namesX+5,ny);ny+=10});
     y+=rowH+12;
     if(y<h-40){doc.setDrawColor(190);doc.setLineWidth(.35);doc.line(roleX,y-6,w-34,y-6)}
    }
    teamDrawn=false;
   }
   y+=18;sectorDrawn=false;
  }
  footer();
  for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);doc.setTextColor(100);doc.setFontSize(7);doc.text(`Página ${i}/${doc.getNumberOfPages()}`,32,h-18)}
  doc.save(`organograma_visual_cascata_${new Date().toISOString().slice(0,10)}.pdf`)
 }

 return <section><div className="heading"><div><span className="eyebrow">DP/RH · {projectLabel}</span><h1>Organograma Setor/Equipe</h1><p>Estrutura organizacional por setor/equipe (encarregado responsável).</p></div></div>{msg&&<div className="notice">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
 <div className="metrics cx-org-kpis"><article className="metric"><span>COLABORADORES</span><strong>{members.length}</strong></article><article className="metric"><span>SETORES/EQUIPES</span><strong>{teamCounts.length}</strong></article><article className="metric"><span>CARGOS/FUNÇÕES</span><strong>{cargoCounts.length}</strong></article><article className="metric"><span>MAIOR SETOR/EQUIPE</span><strong>{teamCounts[0]?.[1]||0}</strong></article><article className="metric"><span>EM EXPERIÊNCIA</span><strong>{inExp}</strong></article><article className="metric"><span>MÉDIA POR SETOR</span><strong>{avg.toFixed(1)}</strong></article></div>
 <div className="panel cx-org-report-filters"><details className="cx-org-tree-select"><summary>{filterTeams.length||filterSectors.length?`SETOR / EQUIPE · ${filterTeams.length||filterSectors.length} SELECIONADO(S)`:'SELECIONAR SETOR / EQUIPE'}</summary><div className="cx-org-tree-menu">{sectorOptions.map(sec=>{const sts=teams.filter(t=>t.sector_id===sec.id);const all=sts.length>0&&sts.every(t=>filterTeams.includes(t.id));return <div className="cx-org-tree-sector" key={sec.id}><label className="cx-org-parent"><input type="checkbox" checked={all||filterSectors.includes(sec.id)} onChange={()=>toggleSector(sec.id)}/><span>{sec.name}</span></label><div className="cx-org-tree-teams">{sts.map(t=><label key={t.id}><input type="checkbox" checked={filterTeams.includes(t.id)} onChange={()=>toggleTeam(t.id,sec.id)}/><span>{t.name}</span></label>)}</div></div>})}</div></details><select value={filterRole} onChange={e=>setFilterRole(e.target.value)}><option value="">TODOS OS CARGOS</option>{roles.map(x=><option key={x}>{x}</option>)}</select><button className="cx-org-yellow-btn" onClick={()=>{setFilterSectors([]);setFilterTeams([]);setFilterRole('')}}>LIMPAR FILTRO</button><button className="cx-org-yellow-btn" onClick={exportPdf}>📄 EXPORTAR PDF</button><button className="cx-org-yellow-btn" onClick={exportXls}>📊 EXPORTAR XLS</button><button className="cx-org-yellow-btn" onClick={exportVisual}>🌳 EXPORTAR ORGANOGRAMA (PDF)</button></div>
 <div className="panel cx-org-members"><div className="panel-head"><div><h2>Colaboradores</h2><p>{members.length} colaborador(es){!filterSectors.length&&!filterTeams.length&&!filterRole?' — todos os ativos':''}</p></div></div><div className="table-scroll"><table><thead><tr><th>MAT.</th><th>NOME</th><th>FUNÇÃO</th><th>EQUIPE</th><th>SETOR</th><th>EXPERIÊNCIA</th></tr></thead><tbody>{members.map(c=><tr key={c.id}><td>{c.registration}</td><td><strong>{c.name}</strong></td><td>{c.role}</td><td>{teamMap.get(c.team_id||'')||c.department}</td><td>{sectorMap.get(c.sector_id||'')||c.sector}</td><td>{experience(c.hired_on)}</td></tr>)}</tbody></table></div></div>
 {canEdit&&<details className="panel cx-org-maint"><summary>CADASTRO DE SETORES E EQUIPES</summary><div className="cx-org-page-form"><label>Novo setor<input value={sector} onChange={e=>setSector(e.target.value.toUpperCase())}/><button type="button" onClick={()=>void addSector()}>+ CADASTRAR SETOR</button></label><label>Setor<select value={sectorId} onChange={e=>setSectorId(e.target.value)}><option value="">SELECIONE</option>{sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Nova equipe<input value={team} onChange={e=>setTeam(e.target.value.toUpperCase())}/><button type="button" disabled={!sectorId} onClick={()=>void addTeam()}>+ CADASTRAR EQUIPE</button></label></div></details>}
 </section>
}
