'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import PortalManagement from '@/components/PortalManagement';

type Status = 'ATIVO' | 'AFASTADO' | 'DESLIGADO' | 'INATIVO' | 'ABANDONO' | 'TRANSFERIDO';
type YesNo = 'SIM' | 'NÃO';
type Form = {
  registration: string; name: string; role: string | null; department: string | null;
  hired_on: string | null; terminated_on: string | null; status: Status;
  cpf: string | null; contract_type: string | null; sector: string | null; foreman: string | null; job_level: string | null;
  aso_expires_on: string | null; work_schedule: string | null; shift_start: string | null;
  shift_end: string | null; break_start: string | null; break_end: string | null;
  shift_details: string | null; license_number: string | null; license_category: string | null;
  license_expires_on: string | null; salary: number | null; bonus: number | null;
  state: string | null; city: string | null; travel_state: string | null; travel_city: string | null;
  phone: string | null; email: string | null; distance_km: number | null;
  entitled_to_leave: YesNo; last_leave_on: string | null; next_leave_on: string | null;
  leave_periodicity: string | null; leave_cost: number | null; transport_allowance: number | null;
  benefits: number | null; uses_lodging: YesNo; lodging: string | null;
};
type Collaborator = Form & { id: string; project_id: string };
const blank: Form = {
  registration: '', name: '', role: '', department: '', hired_on: null, terminated_on: null, status: 'ATIVO',
  cpf: null, contract_type: null, sector: null, foreman: null, job_level: null, aso_expires_on: null,
  work_schedule: null, shift_start: null, shift_end: null, break_start: null, break_end: null,
  shift_details: null, license_number: null, license_category: null, license_expires_on: null,
  salary: null, bonus: null, state: null, city: null, travel_state: null, travel_city: null,
  phone: null, email: null, distance_km: null, entitled_to_leave: 'NÃO', last_leave_on: null,
  next_leave_on: null, leave_periodicity: null, leave_cost: null, transport_allowance: null,
  benefits: null, uses_lodging: 'NÃO', lodging: null
};
const fields = Object.keys(blank) as (keyof Form)[];
const numericFields: (keyof Form)[] = ['salary', 'bonus', 'distance_km', 'leave_cost', 'transport_allowance', 'benefits'];
const cpfMask = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
const phoneMask = (value: string) => { const digits = value.replace(/\D/g, '').slice(0, 11); if (digits.length <= 2) return digits ? `(${digits}` : ''; const prefix = `(${digits.slice(0, 2)}) `; return prefix + (digits.length <= 10 ? digits.slice(2).replace(/^(\d{4})(\d)/, '$1-$2') : digits.slice(2).replace(/^(\d{5})(\d)/, '$1-$2')); };
const viewSections: { title: string; fields: { key: keyof Form; label: string; kind?: 'date' | 'money' }[] }[] = [
  { title: 'Identificação', fields: [{ key: 'registration', label: 'Matrícula' }, { key: 'name', label: 'Nome' }, { key: 'cpf', label: 'CPF' }, { key: 'contract_type', label: 'Tipo de contrato' }, { key: 'hired_on', label: 'Admissão', kind: 'date' }, { key: 'terminated_on', label: 'Desligamento', kind: 'date' }, { key: 'status', label: 'Status' }] },
  { title: 'Função e jornada', fields: [{ key: 'sector', label: 'Setor' }, { key: 'foreman', label: 'Encarregado' }, { key: 'department', label: 'Equipe' }, { key: 'role', label: 'Função / Cargo' }, { key: 'job_level', label: 'Nível' }, { key: 'aso_expires_on', label: 'Vencimento ASO', kind: 'date' }, { key: 'work_schedule', label: 'Jornada / Escala' }, { key: 'shift_start', label: 'Entrada' }, { key: 'shift_end', label: 'Saída' }, { key: 'break_start', label: 'Início do intervalo' }, { key: 'break_end', label: 'Fim do intervalo' }, { key: 'shift_details', label: 'Detalhes da jornada' }] },
  { title: 'Documentos e valores', fields: [{ key: 'license_number', label: 'CNH' }, { key: 'license_category', label: 'Categoria CNH' }, { key: 'license_expires_on', label: 'Vencimento CNH', kind: 'date' }, { key: 'salary', label: 'Salário', kind: 'money' }, { key: 'bonus', label: 'Gratificação', kind: 'money' }, { key: 'transport_allowance', label: 'Vale-transporte', kind: 'money' }, { key: 'benefits', label: 'Benefícios', kind: 'money' }] },
  { title: 'Localização e contato', fields: [{ key: 'state', label: 'Estado (UF)' }, { key: 'city', label: 'Cidade' }, { key: 'phone', label: 'Telefone / WhatsApp' }, { key: 'email', label: 'E-mail' }] },
  { title: 'Folga de campo', fields: [{ key: 'entitled_to_leave', label: 'Tem direito a baixada?' }, { key: 'travel_state', label: 'UF da baixada' }, { key: 'travel_city', label: 'Cidade da baixada' }, { key: 'distance_km', label: 'Distância da obra (km)' }, { key: 'leave_periodicity', label: 'Periodicidade' }, { key: 'last_leave_on', label: 'Última baixada', kind: 'date' }, { key: 'next_leave_on', label: 'Próxima baixada', kind: 'date' }, { key: 'leave_cost', label: 'Custo da baixada', kind: 'money' }] },
  { title: 'Alojamento', fields: [{ key: 'uses_lodging', label: 'Usa alojamento?' }, { key: 'lodging', label: 'Alojamento' }] }
];
const uppercase = (value: string) => value.trim().toLocaleUpperCase('pt-BR');
const tableColumns = [
  { key: 'registration', label: 'MAT.' }, { key: 'name', label: 'NOME' },
  { key: 'role', label: 'FUNÇÃO' }, { key: 'sector', label: 'SETOR ENC.' },
  { key: 'hired_on', label: 'ADMISSÃO' }, { key: 'experience', label: 'EXPERIÊNCIA' },
  { key: 'status', label: 'STATUS' }, { key: 'department', label: 'DEPARTAMENTO' },
  { key: 'lodging', label: 'ALOJAMENTO' }, { key: 'license_expires_on', label: 'CNH / VALIDADE' },
  { key: 'salary', label: 'SALÁRIO' }
] as const;
type TableColumn = typeof tableColumns[number]['key'];
const defaultColumns: TableColumn[] = ['registration', 'name', 'role', 'sector', 'hired_on', 'experience', 'status'];
const showDate = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
function brazilToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function experienceLabel(row: Collaborator): string {
  if (!row.hired_on || row.contract_type?.toUpperCase() !== 'CLT') return '—';
  const start = new Date(`${row.hired_on}T12:00:00Z`);
  const days = Math.round((Date.parse(`${brazilToday()}T12:00:00Z`) - start.getTime()) / 86400000);
  if (days < 0) return '—';
  if (days < 45) return `45D · ${45 - days} DIA(S) · ATÉ ${showDate(new Date(start.getTime() + 45 * 86400000).toISOString().slice(0, 10))}`;
  if (days < 90) return `90D · ${90 - days} DIA(S) · ATÉ ${showDate(new Date(start.getTime() + 90 * 86400000).toISOString().slice(0, 10))}`;
  return '90D · EXPERIÊNCIA CONCLUÍDA';
}
const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const cityCache = new Map<string, string[]>();
function leaveRule(distance: number | null): { periodicity: string; days: number } | null {
  if (distance === null || !Number.isFinite(distance) || distance < 0) return null;
  if (distance <= 500) return { periodicity: '2X2', days: 3 };
  if (distance <= 1000) return { periodicity: '3X3', days: 5 };
  return { periodicity: '6X6', days: 7 };
}

export default function Collaborators({ sb, projectId, projectLabel, canCreate, canEdit, canDelete, canManagePortal }: {
  sb: SupabaseClient; projectId: string; projectLabel: string;
  canCreate: boolean; canEdit: boolean; canDelete: boolean; canManagePortal: boolean;
}) {
  const [rows, setRows] = useState<Collaborator[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Form>({ ...blank });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [viewingRow, setViewingRow] = useState<Collaborator | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [travelCities, setTravelCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<TableColumn[]>(defaultColumns);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{row: Collaborator; status: 'INATIVO' | 'DESLIGADO' | 'ATIVO'} | null>(null);
  const [terminationDate, setTerminationDate] = useState(brazilToday);
  useEffect(() => {
    const key = `cx-collaborator-columns:${projectId}`;
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) || 'null');
      setVisibleColumns(Array.isArray(saved) ? tableColumns.map(column => column.key).filter(column => saved.includes(column)) : defaultColumns);
    } catch { setVisibleColumns(defaultColumns); }
    setColumnsOpen(false);
  }, [projectId]);
  function toggleColumn(column: TableColumn) {
    setVisibleColumns(previous => {
      const next = tableColumns.map(item => item.key).filter(key => key === column ? !previous.includes(key) : previous.includes(key));
      if (!next.length) return previous;
      window.localStorage.setItem(`cx-collaborator-columns:${projectId}`, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    const uf = form.travel_state;
    if (!uf) { setTravelCities([]); setCitiesError(''); return; }
    const cached = cityCache.get(uf);
    if (cached) { setTravelCities(cached); setCitiesLoading(false); setCitiesError(''); return; }
    const controller = new AbortController();
    setCitiesLoading(true); setCitiesError(''); setTravelCities([]);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Falha ao consultar municípios');
        return response.json() as Promise<{ nome: string }[]>;
      })
      .then(municipalities => {
        const cities = municipalities.map(item => item.nome);
        if (uf === 'DF') cities.push('Taguatinga');
        cities.sort((a, b) => a.localeCompare(b, 'pt-BR'));
        cityCache.set(uf, cities);
        setTravelCities(cities); setCitiesLoading(false);
      })
      .catch(error => {
        if (error.name === 'AbortError') return;
        setCitiesError('Não foi possível carregar as cidades. Tente selecionar a UF novamente.');
        setCitiesLoading(false);
      });
    return () => controller.abort();
  }, [form.travel_state]);

  const reload = useCallback(async () => {
    if (!projectId) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await sb.from('cx_collaborators').select('*')
      .eq('project_id', projectId).order('name');
    setRows((data || []) as Collaborator[]);
    setMessage(error ? `Não foi possível carregar colaboradores: ${error.message}` : '');
    setLoading(false);
  }, [sb, projectId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { setEditingId(null); setForm({ ...blank }); setFormOpen(false); setViewingRow(null); setSearch(''); }, [projectId]);
  useEffect(() => {
    if (!formOpen && !viewingRow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('.cx-dialog-close')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) { setFormOpen(false); setViewingRow(null); setEditingId(null); }
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [formOpen, viewingRow, busy]);

  function closeDialog() {
    if (busy) return;
    setFormOpen(false); setViewingRow(null); setEditingId(null);
    previousFocus.current?.focus();
  }

  function startCreate() {
    previousFocus.current = document.activeElement as HTMLElement;
    setForm({ ...blank }); setEditingId(null); setMessage(''); setFormOpen(true);
  }

  function startView(row: Collaborator) {
    previousFocus.current = document.activeElement as HTMLElement;
    setMessage(''); setViewingRow(row);
  }

  const filtered = useMemo(() => {
    const q = uppercase(search);
    return rows.filter(r => !q || [r.registration, r.name, r.role, r.department, r.status]
      .some(value => value?.toLocaleUpperCase('pt-BR').includes(q)));
  }, [rows, search]);

  function startEdit(row: Collaborator) {
    if (!viewingRow) previousFocus.current = document.activeElement as HTMLElement;
    const next = { ...blank };
    for (const field of fields) (next as Record<string, unknown>)[field] = row[field] ?? blank[field];
    setForm(next); setEditingId(row.id); setViewingRow(null); setFormOpen(true); setMessage('');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || busy || (editingId ? !canEdit : !canCreate)) return;
    if (form.cpf && form.cpf.replace(/\D/g, '').length !== 11) { setMessage('O CPF precisa ter 11 dígitos.'); return; }
    if (form.phone && ![10, 11].includes(form.phone.replace(/\D/g, '').length)) { setMessage('O telefone precisa ter DDD e 10 ou 11 dígitos.'); return; }
    setBusy(true); setMessage('');
    const payload = { ...form, registration: uppercase(form.registration), name: uppercase(form.name) };
    for (const field of fields) {
      if (typeof payload[field] === 'string' && !['email', 'cpf', 'phone', 'license_number'].includes(field)) {
        (payload as Record<string, unknown>)[field] = uppercase(payload[field] as string) || null;
      }
    }
    payload.email = form.email?.trim().toLowerCase() || null;
    payload.cpf = form.cpf?.replace(/\D/g, '') || null;
    payload.phone = form.phone?.replace(/\D/g, '') || null;
    payload.license_number = form.license_number?.trim() || null;
    payload.registration = uppercase(form.registration);
    payload.name = uppercase(form.name);
    payload.leave_periodicity = payload.entitled_to_leave === 'SIM' ? leaveRule(payload.distance_km)?.periodicity || null : null;
    if (payload.entitled_to_leave === 'NÃO') {
      payload.last_leave_on = null; payload.next_leave_on = null;
      payload.leave_cost = null;
    }
    if (payload.uses_lodging === 'NÃO') payload.lodging = null;
    const response = editingId
      ? await sb.from('cx_collaborators').update(payload).eq('id', editingId).eq('project_id', projectId).select('id').single()
      : await sb.from('cx_collaborators').insert({ ...payload, project_id: projectId }).select('id').single();
    if (response.error) setMessage(`Não foi possível salvar: ${response.error.message}`);
    else { setForm({ ...blank }); setEditingId(null); setFormOpen(false); await reload(); setMessage('Colaborador salvo com sucesso.'); previousFocus.current?.focus(); }
    setBusy(false);
  }

  async function remove(row: Collaborator) {
    if (!canDelete || busy || !window.confirm(`Excluir ${row.name}? Esta ação não pode ser desfeita.`)) return;
    setBusy(true); setMessage('');
    const { error, data } = await sb.from('cx_collaborators').delete()
      .eq('id', row.id).eq('project_id', projectId).select('id');
    if (error || !data?.length) setMessage(`Não foi possível excluir: ${error?.message || 'acesso negado'}`);
    else { await reload(); setMessage('Colaborador excluído.'); }
    setBusy(false);
  }

  async function changeStatus(row: Collaborator, action: 'INATIVO' | 'DESLIGADO' | 'ATIVO') {
    if (!canEdit || busy) return;
    if (action === 'DESLIGADO' && (!terminationDate || terminationDate > brazilToday() || !!row.hired_on && terminationDate < row.hired_on)) { setMessage('Informe uma data de desligamento válida.'); return; }
    const verb = action === 'INATIVO' ? 'inativar' : action === 'DESLIGADO' ? 'desligar' : 'reativar';
    setBusy(true); setMessage('');
    const payload = action === 'DESLIGADO'
      ? { status: action, terminated_on: terminationDate }
      : { status: action, terminated_on: action === 'ATIVO' ? null : row.terminated_on };
    const { data, error } = await sb.from('cx_collaborators').update(payload)
      .eq('id', row.id).eq('project_id', projectId).select('id');
    if (error || !data?.length) setMessage(`Não foi possível ${verb} o colaborador: ${error?.message || 'acesso negado'}`);
    else { setPendingStatus(null); await reload(); setMessage(`Colaborador ${action === 'ATIVO' ? 'reativado' : action === 'DESLIGADO' ? 'desligado' : 'inativado'} com sucesso.`); }
    setBusy(false);
  }

  function tableCell(row: Collaborator, key: TableColumn) {
    switch (key) {
      case 'registration': return row.registration;
      case 'name': return <button className="cx-name-button" type="button" onClick={() => canEdit ? startEdit(row) : startView(row)} title={canEdit ? 'Editar colaborador' : 'Visualizar colaborador'}>{row.name}</button>;
      case 'sector': return row.sector || row.department || '—';
      case 'hired_on': return showDate(row.hired_on);
      case 'experience': return <span className={`cx-collab-experience ${experienceLabel(row).includes('CONCLUÍDA') ? 'completed' : 'upcoming'}`}>{experienceLabel(row)}</span>;
      case 'status': return <span className={`cx-collab-status ${row.status.toLowerCase()}`}>{row.status}</span>;
      case 'license_expires_on': return showDate(row.license_expires_on);
      case 'salary': return row.salary == null ? '—' : row.salary.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      default: return row[key] || '—';
    }
  }

  function input(field: keyof Form, label: string, type = 'text', required = false) {
    const value = form[field];
    return <label key={field}>{label}<input type={type} required={required} min={numericFields.includes(field) ? '0' : undefined}
      step={numericFields.includes(field) ? '0.01' : undefined} inputMode={field === 'cpf' || field === 'phone' ? 'numeric' : undefined} maxLength={field === 'cpf' ? 14 : field === 'phone' ? 15 : undefined} placeholder={field === 'cpf' ? '000.000.000-00' : field === 'phone' ? '(00) 00000-0000' : undefined} value={field === 'cpf' ? cpfMask(String(value || '')) : field === 'phone' ? phoneMask(String(value || '')) : value ?? ''}
      onChange={e => setForm(previous => ({ ...previous, [field]: numericFields.includes(field)
        ? e.target.value === '' ? null : Number(e.target.value)
        : field === 'cpf' ? e.target.value.replace(/\D/g, '').slice(0, 11) || null
        : field === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 11) || null
        : e.target.value === '' ? null : type === 'text' && field !== 'email'
          ? e.target.value.toLocaleUpperCase('pt-BR') : e.target.value }))} /></label>;
  }
  function select(field: keyof Form, label: string, options: string[]) {
    return <label key={field}>{label}<select value={form[field] ?? ''} onChange={e => setForm(previous => ({ ...previous, [field]: e.target.value || null }))}>
      <option value="">Selecione</option>{options.map(option => <option key={option} value={option}>{option}</option>)}
    </select></label>;
  }
  function section(title: string, children: React.ReactNode) {
    return <fieldset className="cx-form-section"><legend>{title}</legend><div className="cx-form-grid">{children}</div></fieldset>;
  }

  return <>
    <div className="heading"><div><span className="eyebrow">PESSOAS · {projectLabel}</span>
      <h1>Colaboradores</h1><p>Cadastro por obra, com acesso controlado por permissão.</p></div>
      {canCreate && <button className="cx-primary" onClick={startCreate}>+ Novo colaborador</button>}
    </div>
    {message && !formOpen && <div className="notice" role="status">{message}<button aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}
    {formOpen && <div className="cx-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeDialog(); }}><div ref={dialogRef} className="panel cx-modal cx-collab-form" role="dialog" aria-modal="true" aria-labelledby="cx-dialog-title"><div className="cx-dialog-head"><h2 id="cx-dialog-title">{editingId ? 'Editar colaborador' : 'Novo colaborador'}</h2><button type="button" className="cx-dialog-close" aria-label="Fechar janela" disabled={busy} onClick={closeDialog}>×</button></div>
      <p>Obra: <strong>{projectLabel}</strong></p>
      {message && <div className="notice" role="alert">{message}</div>}
      <form onSubmit={save}>
        {section('Identificação', <>{input('registration', 'Matrícula *', 'text', true)}{input('name', 'Nome *', 'text', true)}{input('cpf', 'CPF')}{select('contract_type', 'Tipo de contrato', ['CLT', 'PJ', 'ESTÁGIO', 'TEMPORÁRIO', 'TERCEIRIZADO'])}{input('hired_on', 'Admissão', 'date')}{input('terminated_on', 'Desligamento', 'date')}{select('status', 'Status', ['ATIVO', 'AFASTADO', 'DESLIGADO', 'INATIVO', 'ABANDONO', 'TRANSFERIDO'])}</>)}
        {section('Função e jornada', <>{input('sector', 'Setor')}{input('foreman', 'Encarregado')}{input('department', 'Equipe')}{input('role', 'Função / Cargo')}{input('job_level', 'Nível')}{input('aso_expires_on', 'Vencimento ASO', 'date')}{input('work_schedule', 'Jornada / Escala')}{input('shift_start', 'Entrada', 'time')}{input('shift_end', 'Saída', 'time')}{input('break_start', 'Início do intervalo', 'time')}{input('break_end', 'Fim do intervalo', 'time')}{input('shift_details', 'Detalhes da jornada')}</>)}
        {section('Documentos e valores', <>{input('license_number', 'CNH')}{input('license_category', 'Categoria CNH')}{input('license_expires_on', 'Vencimento CNH', 'date')}{input('salary', 'Salário (R$)', 'number')}{input('bonus', 'Gratificação (R$)', 'number')}{input('transport_allowance', 'Vale-transporte (R$)', 'number')}{input('benefits', 'Benefícios (R$)', 'number')}</>)}
        {section('Localização e contato', <>{input('state', 'Estado (UF)')}{input('city', 'Cidade')}{input('phone', 'Telefone / WhatsApp', 'tel')}{input('email', 'E-mail', 'email')}</>)}
        {section('Folga de campo', <>
          {select('entitled_to_leave', 'Tem direito a baixada?', ['NÃO', 'SIM'])}
          <label>UF da baixada<select value={form.travel_state || ''} onChange={e => setForm(previous => ({ ...previous, travel_state: e.target.value || null, travel_city: null }))}>
            <option value="">Selecione a UF</option>{states.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select></label>
          <label>Cidade da baixada
            <select value={form.travel_city || ''} disabled={!form.travel_state || citiesLoading || !!citiesError} onChange={e => setForm(previous => ({ ...previous, travel_city: e.target.value || null }))}>
              <option value="">{citiesLoading ? 'Carregando…' : 'Selecione a cidade'}</option>
              {form.travel_city && !travelCities.some(city => uppercase(city) === uppercase(form.travel_city || '')) && <option value={form.travel_city}>{form.travel_city}</option>}
              {travelCities.map(city => <option key={city} value={uppercase(city)}>{city}</option>)}
            </select>{citiesError && <small role="alert">{citiesError}</small>}
          </label>
          {input('distance_km', form.entitled_to_leave === 'SIM' ? 'Distância da obra (km) *' : 'Distância da obra (km)', 'number', form.entitled_to_leave === 'SIM')}
          {form.entitled_to_leave === 'SIM' && <>
            <label>Periodicidade automática<input readOnly value={leaveRule(form.distance_km)?.periodicity || ''} placeholder="Informe a distância" /><small>Até 500 km: 2x2 · até 1.000 km: 3x3 · acima: 6x6</small></label>
            <label>Dias de folga<input readOnly value={leaveRule(form.distance_km)?.days || ''} placeholder="Informe a distância" /></label>
            {input('last_leave_on', 'Última baixada', 'date')}{input('next_leave_on', 'Próxima baixada', 'date')}{input('leave_cost', 'Custo da baixada (R$)', 'number')}
          </>}
        </>)}
        {section('Alojamento', <>{select('uses_lodging', 'Usa alojamento?', ['NÃO', 'SIM'])}{form.uses_lodging === 'SIM' && input('lodging', 'Alojamento')}</>)}
        <div className="cx-form-actions"><button type="button" disabled={busy} onClick={closeDialog}>Cancelar</button><button className="cx-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar colaborador'}</button></div>
      </form>
    </div></div>}
    {viewingRow && <div className="cx-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeDialog(); }}><div ref={dialogRef} className="panel cx-modal cx-collab-view" role="dialog" aria-modal="true" aria-labelledby="cx-view-title"><div className="cx-dialog-head"><div><span className="eyebrow">FICHA DO COLABORADOR · {projectLabel}</span><h2 id="cx-view-title">{viewingRow.name}</h2></div><button type="button" className="cx-dialog-close" aria-label="Fechar janela" onClick={closeDialog}>×</button></div>
      {viewSections.map(group => <section className="cx-view-section" key={group.title}><h3>{group.title}</h3><dl className="cx-view-grid">{group.fields.map(item => {
        const raw = viewingRow[item.key];
        const value = raw === null || raw === '' ? '—' : item.key === 'cpf' ? cpfMask(String(raw)) : item.key === 'phone' ? phoneMask(String(raw)) : item.kind === 'date' ? new Date(`${raw}T12:00:00`).toLocaleDateString('pt-BR') : item.kind === 'money' ? Number(raw).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(raw);
        return <div key={item.key}><dt>{item.label}</dt><dd>{value}</dd></div>;
      })}</dl></section>)}
      {canManagePortal && <PortalManagement sb={sb} collaboratorId={viewingRow.id} />}
      <div className="cx-form-actions"><button type="button" onClick={closeDialog}>Fechar</button></div>
    </div></div>}
    {pendingStatus && <div className="cx-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setPendingStatus(null); }}><div className="panel cx-modal cx-collab-confirm" role="dialog" aria-modal="true" aria-labelledby="cx-status-title"><div className="cx-dialog-head"><h2 id="cx-status-title">{pendingStatus.status === 'DESLIGADO' ? 'Desligar' : pendingStatus.status === 'INATIVO' ? 'Inativar' : 'Reativar'} colaborador</h2><button type="button" className="cx-dialog-close" disabled={busy} aria-label="Cancelar" onClick={() => setPendingStatus(null)}>×</button></div><p>Confirma a alteração do cadastro de <strong>{pendingStatus.row.name}</strong> para <strong>{pendingStatus.status}</strong>?</p>{pendingStatus.status === 'DESLIGADO' && <label className="cx-termination-date">Data do desligamento<input required type="date" min={pendingStatus.row.hired_on || undefined} max={brazilToday()} value={terminationDate} onChange={event => setTerminationDate(event.target.value)} /></label>}{message && <p role="alert" className="error">{message}</p>}<div className="cx-form-actions"><button type="button" disabled={busy} onClick={() => setPendingStatus(null)}>Cancelar</button><button type="button" className="cx-primary" disabled={busy || pendingStatus.status === 'DESLIGADO' && (!terminationDate || terminationDate > brazilToday() || !!pendingStatus.row.hired_on && terminationDate < pendingStatus.row.hired_on)} onClick={() => void changeStatus(pendingStatus.row, pendingStatus.status)}>{busy ? 'Salvando…' : 'Confirmar'}</button></div></div></div>}
    <div className="panel cx-collab-list"><div className="cx-list-head"><div><h2>COLABORADORES <span className="cx-collab-count">{rows.length}</span></h2><p>{loading ? 'Carregando…' : `${filtered.length} exibidos de ${rows.length}`}</p></div><div className="cx-collab-tools"><input aria-label="Buscar colaborador" placeholder="Buscar nome, matrícula, função…" value={search} onChange={e => setSearch(e.target.value)} /><div className="cx-column-picker"><button type="button" className="cx-column-toggle" aria-expanded={columnsOpen} onClick={() => setColumnsOpen(open => !open)}>▤ COLUNAS</button>{columnsOpen && <div className="cx-column-options" role="group" aria-label="Selecionar colunas">{tableColumns.map(column => <label key={column.key}><input type="checkbox" checked={visibleColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}</div>}</div></div></div>
      <div className="matrix-scroll"><table className="cx-collab-table"><thead><tr>{tableColumns.filter(column => visibleColumns.includes(column.key)).map(column => <th key={column.key}>{column.label}</th>)}<th>AÇÕES</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>
        {tableColumns.filter(column => visibleColumns.includes(column.key)).map(column => <td key={column.key}>{tableCell(row,column.key)}</td>)}
        <td><div className="cx-collab-actions">{canEdit && row.status === 'ATIVO' && <><button type="button" className="cx-collab-icon inactive" disabled={busy} aria-label={`Inativar ${row.name}`} data-tooltip="Inativar" onClick={() => setPendingStatus({row, status:'INATIVO'})}>✕</button><button type="button" className="cx-collab-icon terminated" disabled={busy} aria-label={`Desligar ${row.name}`} data-tooltip="Desligar" onClick={() => { setTerminationDate(brazilToday()); setPendingStatus({row, status:'DESLIGADO'}); }}>⏻</button></>}{canEdit && row.status === 'INATIVO' && <button type="button" className="cx-collab-icon activate" disabled={busy} aria-label={`Reativar ${row.name}`} data-tooltip="Reativar" onClick={() => setPendingStatus({row, status:'ATIVO'})}>▶</button>}</div></td>
      </tr>)}</tbody></table></div>
      {!loading && filtered.length === 0 && <div className="empty">{projectId ? 'Nenhum colaborador encontrado nesta obra.' : 'Selecione uma obra para visualizar colaboradores.'}</div>}
    </div>
  </>;
}
