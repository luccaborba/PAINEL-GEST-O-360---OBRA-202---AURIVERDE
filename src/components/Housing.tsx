'use client';
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHousingReport, type ContractRow, type HousingRow, type Resident } from './housingReport';
import { createHousingReportPdf } from './housingReportPdf';

type Home = { id: string; project_id: string; contract_code: string; description: string; supplier: string | null; capacity: number; capacity_confirmed: boolean; lease_start: string | null; lease_end: string | null; payment_day: number | null; document_title: string | null; monthly_cost: number; reported_occupied: number | null; allocated_cost: number | null; status: string; address: string | null; water_contract: string | null; energy_contract: string | null; internet_contract: string | null; measurement_start_day: number | null };
type Edit = Pick<Home, 'contract_code' | 'description' | 'supplier' | 'capacity' | 'monthly_cost' | 'status' | 'address' | 'water_contract' | 'energy_contract' | 'internet_contract' | 'measurement_start_day' | 'capacity_confirmed' | 'lease_start' | 'lease_end' | 'payment_day'>;
const initial: Edit = { contract_code: '', description: '', supplier: '', capacity: 0, capacity_confirmed: false, lease_start: null, lease_end: null, payment_day: null, monthly_cost: 0, status: 'ATIVO', address: '', water_contract: '', energy_contract: '', internet_contract: '', measurement_start_day: null };
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function Housing({ sb, projectId, projectLabel, canCreate, canEdit, canDelete, canExport }: { sb: SupabaseClient; projectId: string; projectLabel: string; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean }) {
  const [rows, setRows] = useState<Home[]>([]); const [residents, setResidents] = useState<{ lodging: string | null }[]>([]); const [showInactive, setShowInactive] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Home | null>(null); const [editing, setEditing] = useState<string | null>(null); const [form, setForm] = useState<Edit>(initial);
  const refresh = useCallback(async () => { setLoading(true); const [homes, people] = await Promise.all([sb.from('cx_housing').select('*').eq('project_id', projectId).order('description'), sb.from('cx_collaborators').select('lodging').eq('project_id', projectId).eq('status', 'ATIVO').eq('uses_lodging', 'SIM').range(0, 999)]); setRows((homes.data || []) as Home[]); setResidents((people.data || []) as { lodging: string | null }[]); if (homes.error || people.error) setMessage(`Não foi possível carregar os alojamentos: ${homes.error?.message || people.error?.message}`); setLoading(false); }, [sb, projectId]);
  useEffect(() => { void refresh(); setSelected(null); setEditing(null); }, [refresh]);
  useEffect(() => { if (!selected && editing === null) return; const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = old; }; }, [selected, editing]);
  const editingOpen = editing !== null;
  function beginEdit(row: Home) { setForm({ contract_code: row.contract_code, description: row.description, supplier: row.supplier, capacity: row.capacity, capacity_confirmed: row.capacity_confirmed, lease_start: row.lease_start, lease_end: row.lease_end, payment_day: row.payment_day, monthly_cost: row.monthly_cost, status: row.status, address: row.address, water_contract: row.water_contract, energy_contract: row.energy_contract, internet_contract: row.internet_contract, measurement_start_day: row.measurement_start_day }); setSelected(null); setEditing(row.id); setMessage(''); }
  function beginNew() { setForm(initial); setSelected(null); setEditing('new'); setMessage(''); }
  function close() { if (busy) return; setEditing(null); setSelected(null); }
  useEffect(() => { if (!selected && !editingOpen) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close(); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [selected, editingOpen, busy]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || (editing === 'new' ? !canCreate : !canEdit)) return;
    setBusy(true); setMessage('');
    const payload = { ...form, contract_code: form.contract_code.trim().toUpperCase(), description: form.description.trim().toUpperCase(), supplier: form.supplier?.trim().toUpperCase() || null, address: form.address?.trim().toUpperCase() || null, water_contract: form.water_contract?.trim().toUpperCase() || null, energy_contract: form.energy_contract?.trim().toUpperCase() || null, internet_contract: form.internet_contract?.trim().toUpperCase() || null, measurement_start_day: form.measurement_start_day || null, payment_day: form.payment_day || null, capacity: form.capacity_confirmed ? Number(form.capacity) : 0 };
    const result = editing === 'new' ? await sb.from('cx_housing').insert({ ...payload, project_id: projectId }) : await sb.from('cx_housing').update(payload).eq('id', editing).eq('project_id', projectId);
    if (result.error) setMessage(`Não foi possível salvar: ${result.error.message}`);
    else { setEditing(null); await refresh(); setMessage('Alojamento salvo.'); }
    setBusy(false);
  }
  async function remove(row: Home) {
    if (!canDelete || busy || !window.confirm(`Excluir ${row.description}?`)) return;
    setBusy(true); const result = await sb.from('cx_housing').delete().eq('id', row.id).eq('project_id', projectId);
    if (result.error) setMessage(`Não foi possível excluir: ${result.error.message}`); else { await refresh(); setMessage('Alojamento excluído.'); } setBusy(false);
  }
  function occupied(row: Home) { return residents.filter(person => person.lodging?.trim().toUpperCase() === row.contract_code.toUpperCase()).length; }
  async function toggleStatus(row: Home) {
    if (!canEdit || busy) return;
    const next = row.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    const linked = occupied(row);
    const prompt = next === 'INATIVO' ? `Inativar ${row.description}? ${linked ? `${linked} colaborador(es) continuarão vinculados ao imóvel e precisarão de revisão.` : 'O imóvel sairá do dashboard de alojamentos.'}` : `Reativar ${row.description}? O imóvel voltará ao dashboard.`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setMessage('');
    const { data, error } = await sb.from('cx_housing').update({ status: next, updated_at: new Date().toISOString() }).eq('project_id', projectId).eq('id', row.id).select('id');
    if (error || !data?.length) setMessage(`Não foi possível ${next === 'ATIVO' ? 'reativar' : 'inativar'}: ${error?.message || 'acesso negado'}`);
    else { await refresh(); setMessage(next === 'ATIVO' ? 'Imóvel reativado e incluído no dashboard.' : 'Imóvel inativado e retirado do dashboard.'); }
    setBusy(false);
  }
  async function exportReport(format:'xlsx'|'pdf') {
    if(!canExport||busy)return;
    setBusy(true);setMessage('');
    try {
      async function allRows(table:'cx_housing'|'cx_contracts'|'cx_collaborators',columns:string){
        const result:Record<string,unknown>[]=[];
        for(let from=0;;from+=1000){
          const {data,error}=await sb.from(table).select(columns).eq('project_id',projectId).range(from,from+999);
          if(error)throw error;
          result.push(...((data||[]) as unknown as Record<string,unknown>[]));
          if(!data||data.length<1000)break;
        }
        return result;
      }
      const [homes,contracts,people]=await Promise.all([
        allRows('cx_housing','contract_code,description,supplier,monthly_cost,capacity,capacity_confirmed,status,measurement_start_day,lease_start,lease_end'),
        allRows('cx_contracts','code,contract_type,starts_on,ends_on,supplier'),
        allRows('cx_collaborators','lodging,status,uses_lodging')
      ]);
      const active=(homes as HousingRow[]).filter(home=>home.status==='ATIVO'&&!home.contract_code.toUpperCase().startsWith('OBRA-'));
      if(!active.length)throw new Error('Não há contratos de alojamento ativos nesta obra para o relatório.');
      const projectCode=projectLabel.split('·')[0].trim();
      const reportDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const logoResponse=await fetch('/ccl-logo-contratos-v1.png');if(!logoResponse.ok)throw new Error('Não foi possível carregar a logo CCL.');
      const logo=new Uint8Array(await logoResponse.arrayBuffer());
      const filename=`alojamentos-obra-${projectCode}-${reportDate}.${format}`;
      if(format==='pdf')createHousingReportPdf(homes as HousingRow[],contracts as ContractRow[],people as Resident[],projectCode,reportDate,logo).save(filename);
      else {
        const bytes=createHousingReport(homes as HousingRow[],contracts as ContractRow[],people as Resident[],projectCode,reportDate,logo);
        const file=new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
    }catch(error){setMessage(`Não foi possível gerar o relatório: ${error instanceof Error?error.message:String(error)}`);}
    finally{setBusy(false);}
  }
  function input(field: keyof Edit, label: string, type = 'text', required = false) {
    return <label key={field}>{label}<input required={required} type={type} min={type === 'number' ? '0' : undefined} max={field === 'measurement_start_day' || field === 'payment_day' ? '31' : undefined} step={field === 'monthly_cost' ? '.01' : '1'} value={(form[field] as string | number | null) ?? ''} onChange={e => setForm(old => ({ ...old, [field]: type === 'number' ? e.target.value === '' ? null : Number(e.target.value) : type === 'date' ? e.target.value || null : e.target.value.toLocaleUpperCase('pt-BR') }))} /></label>;
  }
  return <><div className="heading"><div><span className="eyebrow">PESSOAS · {projectLabel}</span><h1>Alojamentos</h1><p>Cadastro dos imóveis da obra e seus contratos.</p></div>{canCreate && <button className="cx-primary" onClick={beginNew}>+ Novo alojamento</button>}</div>
    {canExport && <div className="panel cx-housing-report"><strong>RELATÓRIO DE ALOJAMENTOS</strong><span>Semana atual calculada automaticamente · domingo a sábado</span><button type="button" disabled={busy} onClick={()=>void exportReport('xlsx')}>⬇ Excel (.xlsx)</button><button type="button" disabled={busy} onClick={()=>void exportReport('pdf')}>⬇ PDF</button></div>}
    {message && !editingOpen && <div className="notice" role="status">{message}<button aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}
    <div className="panel cx-housing-list"><div className="cx-housing-list-head"><h2>IMÓVEIS DE ALOJAMENTO <span className="cx-rh-tag">{showInactive ? 'Contratos inativos' : 'Contratos ativos'}</span></h2><button className="cx-housing-filter" onClick={() => setShowInactive(old => !old)}>{showInactive ? 'Ver contratos ativos' : `Ver inativos (${rows.filter(row => row.status !== 'ATIVO').length})`}</button></div><div className="matrix-scroll"><table className="cx-housing-table"><thead><tr><th>Contrato</th><th>Descrição</th><th>Fornecedor</th><th>Valor mensal</th><th>Capacidade</th><th>Ocupados</th><th>Rateio / ocupante</th><th>Ocupação</th><th>Status</th><th>Ações</th></tr></thead><tbody>{rows.filter(row => showInactive ? row.status !== 'ATIVO' : row.status === 'ATIVO').map(row => { const count = occupied(row); const percentage = row.capacity_confirmed && row.capacity ? count / row.capacity * 100 : 0; return <tr key={row.id}><td>{row.contract_code}</td><td><button className="cx-housing-name" onClick={() => setSelected(row)}>{row.description}</button></td><td>{row.supplier || '—'}</td><td>{money(row.monthly_cost)}</td><td>{row.capacity_confirmed ? row.capacity : 'Pendente'}</td><td>{count}</td><td>{count ? money(Number(row.monthly_cost) / count) : '—'}</td><td>{row.capacity_confirmed && row.capacity > 0 ? <div className="cx-occupancy"><span className="cx-occupancy-track"><span style={{ width: `${Math.min(100,percentage)}%`, background: percentage >= 100 ? '#f0555a' : '#f5c518' }} /></span>{percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</div> : '—'}</td><td>{row.status}</td><td><div className="cx-housing-actions">{canEdit && <><button disabled={busy} onClick={() => beginEdit(row)}>✏️ Editar</button><button disabled={busy} className="cx-toggle-status" onClick={() => void toggleStatus(row)}>{row.status === 'ATIVO' ? '⏸ Inativar' : '▶ Reativar'}</button></>}{canDelete && <button disabled={busy} className="cx-delete" title="Excluir imóvel" aria-label={`Excluir ${row.description}`} onClick={() => void remove(row)}>🗑</button>}</div></td></tr>; })}</tbody></table></div>{!loading && !rows.some(row => showInactive ? row.status !== 'ATIVO' : row.status === 'ATIVO') && <div className="empty">Nenhum imóvel {showInactive ? 'inativo' : 'ativo'} nesta obra.</div>}</div>
    {selected && <div className="cx-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="panel cx-modal cx-housing-view" role="dialog" aria-modal="true" aria-labelledby="housing-view-title"><div className="cx-dialog-head"><div><span className="eyebrow">ALOJAMENTO · {projectLabel}</span><h2 id="housing-view-title">{selected.description}</h2></div><button className="cx-dialog-close" aria-label="Fechar" onClick={close}>×</button></div><dl className="cx-view-grid">{([['Contrato',selected.contract_code],['Fornecedor',selected.supplier],['Endereço',selected.address],['Capacidade',selected.capacity_confirmed ? selected.capacity : 'Pendente de informação'],['Valor mensal',money(selected.monthly_cost)],['Início da vigência',selected.lease_start],['Fim da vigência',selected.lease_end],['Dia do pagamento',selected.payment_day],['Documento identificado',selected.document_title],['Status',selected.status],['Ocupação registrada no v1',selected.reported_occupied],['Custo rateado no v1',selected.allocated_cost === null ? null : money(selected.allocated_cost)],['Contrato de água',selected.water_contract],['Contrato de energia',selected.energy_contract],['Contrato de internet',selected.internet_contract],['Dia inicial da medição',selected.measurement_start_day]] as [string,string | number | null][]).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl><div className="cx-form-actions"><button onClick={close}>Fechar</button>{canEdit && <button className="cx-primary" onClick={() => beginEdit(selected)}>Editar alojamento</button>}</div></div></div>}
    {editingOpen && <div className="cx-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="panel cx-modal cx-collab-form" role="dialog" aria-modal="true" aria-labelledby="housing-edit-title"><div className="cx-dialog-head"><h2 id="housing-edit-title">{editing === 'new' ? 'Novo alojamento' : 'Editar alojamento'}</h2><button type="button" className="cx-dialog-close" aria-label="Fechar" disabled={busy} onClick={close}>×</button></div>{message && <div className="notice" role="alert">{message}</div>}<form onSubmit={save}><fieldset className="cx-form-section"><legend>Cadastro do imóvel</legend><div className="cx-form-grid">{input('contract_code','Código do contrato *','text',true)}{input('description','Descrição *','text',true)}{input('supplier','Fornecedor')}{input('address','Endereço')}<label className="cx-housing-check"><input type="checkbox" checked={form.capacity_confirmed} onChange={e => setForm(old => ({ ...old, capacity_confirmed: e.target.checked, capacity: e.target.checked ? old.capacity : 0 }))} /> Capacidade confirmada</label>{form.capacity_confirmed && input('capacity','Capacidade *','number',true)}{input('monthly_cost','Valor mensal (R$) *','number',true)}<label>Status<select value={form.status} onChange={e => setForm(old => ({ ...old, status: e.target.value }))}><option>ATIVO</option><option>INATIVO</option></select></label>{input('measurement_start_day','Dia inicial da medição','number')}{input('lease_start','Início da vigência','date')}{input('lease_end','Fim da vigência','date')}{input('payment_day','Dia do pagamento','number')}{input('water_contract','Contrato de água')}{input('energy_contract','Contrato de energia')}{input('internet_contract','Contrato de internet')}</div></fieldset><div className="cx-form-actions"><button type="button" onClick={close} disabled={busy}>Cancelar</button><button className="cx-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alojamento'}</button></div></form></div></div>}
  </>;
}
