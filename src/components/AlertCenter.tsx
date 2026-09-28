'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Person = { id: string; name: string; registration: string; role: string | null; department: string | null; status: string | null; contract_type: string | null; hired_on: string | null; terminated_on: string | null; license_number: string | null; license_expires_on: string | null; aso_expires_on: string | null };
type Alert = { id: string; person: string; registration: string; role: string; department: string; type: '45D' | '90D' | 'CNH' | 'ASO'; date: string; days: number };
type Settings = { experience_45: boolean; experience_90: boolean; cnh: boolean; aso: boolean };
const defaultSettings: Settings = { experience_45: true, experience_90: true, cnh: true, aso: false };
const DAY = 86400000;
function dayNumber(value: string): number {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}
function addDays(value: string, count: number): string {
  return new Date((dayNumber(value) + count) * DAY).toISOString().slice(0, 10);
}
function todayInBrazil(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const item = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${item('year')}-${item('month')}-${item('day')}`;
}
function buildAlerts(rows: Person[], today: string, settings: Settings): Alert[] {
  const results: Alert[] = [];
  for (const person of rows) {
    if (!['ATIVO', 'AFASTADO'].includes((person.status || '').toUpperCase()) || person.terminated_on) continue;
    const add = (type: Alert['type'], date: string | null, windowDays: number) => {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const days = dayNumber(date) - dayNumber(today);
      if (days < 0 || days > windowDays) return;
      results.push({ id: `${person.id}:${type}`, person: person.name, registration: person.registration, role: person.role || 'FUNÇÃO NÃO INFORMADA', department: person.department || 'SETOR NÃO INFORMADO', type, date, days });
    };
    if ((person.contract_type || '').toUpperCase() === 'CLT' && person.hired_on) {
      if (settings.experience_45) add('45D', addDays(person.hired_on, 45), 10);
      if (settings.experience_90) add('90D', addDays(person.hired_on, 90), 10);
    }
    if (settings.cnh && person.license_number) add('CNH', person.license_expires_on, 10);
    if (settings.aso) add('ASO', person.aso_expires_on, 10);
  }
  return results.sort((a, b) => a.days - b.days || a.person.localeCompare(b.person, 'pt-BR'));
}
const displayDate = (date: string) => date.split('-').reverse().join('/');
const typeName: Record<Alert['type'], string> = { '45D': 'Experiência 45 dias', '90D': 'Experiência 90 dias', CNH: 'CNH', ASO: 'ASO' };
export default function AlertCenter({ sb, projectId, projectCode, compact = false, navigation = false, onOpen }: { sb: SupabaseClient; projectId: string; projectCode?: string; compact?: boolean; navigation?: boolean; onOpen?: () => void }) {
  const [rows, setRows] = useState<Person[]>([]);
  const [today, setToday] = useState(todayInBrazil);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayInBrazil()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== projectId) return;
      void sb.from('cx_alert_settings').select('experience_45,experience_90,cnh,aso').eq('project_id', projectId).maybeSingle().then(({ data, error }) => {
        if (!error) setSettings(data || defaultSettings);
      });
    };
    window.addEventListener('cx-alert-settings-changed', refresh);
    return () => window.removeEventListener('cx-alert-settings-changed', refresh);
  }, [sb, projectId]);
  useEffect(() => {
    let current = true;
    setRows([]); setLoading(true); setError(''); setDepartment(''); setSettings(defaultSettings);
    (async () => {
      const configured = await sb.from('cx_alert_settings').select('experience_45,experience_90,cnh,aso').eq('project_id', projectId).maybeSingle();
      if (!current) return;
      if (configured.error) { setError('Não foi possível carregar a configuração dos alertas.'); setLoading(false); return; }
      const nextSettings = configured.data ? configured.data as Settings : defaultSettings;
      setSettings(nextSettings);
      const result: Person[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error: queryError } = await sb.from('cx_collaborators').select('id,name,registration,role,department,status,contract_type,hired_on,terminated_on,license_number,license_expires_on,aso_expires_on').eq('project_id', projectId).order('id').range(start, start + 999);
        if (!current) return;
        if (queryError) { setError('Não foi possível consultar os vencimentos desta obra.'); setLoading(false); return; }
        result.push(...(data || []) as Person[]);
        if (!data || data.length < 1000) break;
      }
      if (current) { setRows(result); setLoading(false); }
    })();
    return () => { current = false; };
  }, [sb, projectId]);
  const alerts = useMemo(() => buildAlerts(rows, today, settings), [rows, today, settings]);
  const dueToday = alerts.filter(a => a.days === 0);
  const filtered = department ? alerts.filter(a => a.department === department) : alerts;
  const departments = [...new Set(alerts.map(a => a.department))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  async function exportPdf() {
    const { alertCenterPdf } = await import('./alertCenterPdf');
    alertCenterPdf(filtered, projectCode || projectId, department, today).save(`CENTRAL_DE_ALERTAS_${today}.pdf`);
  }
  if (navigation) return <button type="button" className="nav cx-alert-nav" onClick={onOpen} disabled={loading || !!error} title={error || 'Abrir Central de Alertas'}><span className="cx-siren" aria-hidden="true">🚨</span><span>Central de Alertas</span><span className="cx-alert-badge" aria-label={`${alerts.length} alertas`}>{loading ? '…' : alerts.length}</span></button>;
  if (compact) return <section className="cx-alert-summary" aria-label="Alertas do dia">
    {dueToday.length > 0 && <div className="cx-alert-ultra" role="alert"><strong>CRÍTICO · {dueToday.length} VENCIMENTO{dueToday.length > 1 ? 'S' : ''} HOJE</strong><span>{dueToday.map(a => `${a.person} (${typeName[a.type]})`).join(' · ')}</span><button onClick={onOpen}>Ver alertas</button></div>}
    {error ? <p role="alert">{error}</p> : <button className="cx-alert-shortcut" onClick={onOpen} disabled={loading}><span className="cx-siren" aria-hidden="true">🚨</span> Central de Alertas <span className="cx-alert-badge" aria-label={`${alerts.length} alertas`}>({loading ? '…' : alerts.length})</span></button>}
  </section>;
  return <section className="cx-alert-center"><div className="cx-alert-title"><span aria-hidden="true">🚨</span><div><h1>CENTRAL DE ALERTAS</h1><p>Eventos a vencer nos próximos 10 dias · alertas conforme configuração da obra</p></div></div>
    {error && <p role="alert" className="error">{error}</p>}
    {loading ? <p role="status">Consultando vencimentos…</p> : !error && <>
      <div className="cx-alert-filter"><div className="cx-alert-legend"><span className="cx-alert-level-ten">6 a 10 dias · atenção</span><span className="cx-alert-level-five">4 a 5 dias · prioridade</span><span className="cx-alert-level-three">2 a 3 dias · urgente</span><span className="cx-alert-level-one">1 dia e hoje · crítico</span></div><label>Setor / Equipe <select value={department} onChange={e => setDepartment(e.target.value)}><option value="">Todos os setores / equipes</option>{departments.map(item => <option key={item}>{item}</option>)}</select></label></div>
      <div className="cx-alert-list"><div className="cx-alert-list-heading"><h2>ALERTAS</h2><button type="button" onClick={() => void exportPdf()} disabled={!filtered.length} title="Exportar alertas em PDF">⬇ PDF</button></div>{filtered.length ? <ul>{filtered.map(a => <li className={`cx-alert-row cx-alert-level-${a.days <= 1 ? 'one' : a.days <= 3 ? 'three' : a.days <= 5 ? 'five' : 'ten'}`} key={a.id}><span className="cx-alert-dot"/><b className="cx-alert-kind">{a.type}</b><span className="cx-alert-person">{typeName[a.type]} — {a.person} ({a.role}) <small>· MATRÍCULA {a.registration} · {a.department}</small></span><span className="cx-alert-when">{a.days === 0 ? 'CRÍTICO · VENCE HOJE' : a.days === 1 ? 'CRÍTICO · EM 1 DIA' : `EM ${a.days} DIA(S)`} · {displayDate(a.date)}</span></li>)}</ul> : <p>Nenhum vencimento encontrado para este filtro.</p>}</div>
    </>}
  </section>;
}
