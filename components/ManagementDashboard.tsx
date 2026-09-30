'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import HousingDashboard from '@/components/HousingDashboard';
import ManagementFinanceDashboard from '@/components/ManagementFinanceDashboard';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineController, LineElement, PointElement } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineController, LineElement, PointElement);

type Row = { status: string | null; contract_type: string | null; department: string | null; role: string | null; hired_on: string | null; terminated_on: string | null };
const thirdParty = (value: string | null) => ['TER', 'TERC', 'TERCEIRO', 'TERCEIROS', 'TERCEIRIZADO', 'TERCEIRIZADOS'].includes((value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
function countBy(rows: Row[], field: 'department' | 'role', max?: number): [string, number][] {
  const grouped = new Map<string, number>();
  rows.forEach(row => { const label = row[field]?.trim() || 'NÃO INFORMADO'; grouped.set(label, (grouped.get(label) || 0) + 1); });
  return [...grouped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, max);
}
function dateOnly(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function BarChart({ entries, color, title }: { entries: [string, number][]; color: string; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !entries.length) return;
    const chart = new Chart(canvas.current, { type: 'bar', data: { labels: entries.map(x => x[0]), datasets: [{ label: title, data: entries.map(x => x[1]), backgroundColor: color, borderRadius: 3, maxBarThickness: 16 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { color: '#59636c', precision: 0 }, grid: { color: '#e4e7eb' } }, y: { ticks: { color: '#47525d', font: { size: 10 } }, grid: { display: false } } } } });
    return () => chart.destroy();
  }, [entries, color, title]);
  return <article className="cx-rh-panel"><h3>{title}</h3><div className="cx-rh-bars"><canvas ref={canvas} role="img" aria-label={`${title}: ${entries.map(x => `${x[0]} ${x[1]}`).join('; ')}`} /></div></article>;
}
function TrendChart({ rows, today }: { rows: Row[]; today: Date }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const monthly = useMemo(() => Array.from({ length: 13 }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth() - 12 + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { label: start.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace(' de ', '/'), admissions: rows.filter(row => { const date = dateOnly(row.hired_on); return date && date >= start && date < end; }).length, terminations: rows.filter(row => { const date = dateOnly(row.terminated_on); return date && date >= start && date < end; }).length };
  }), [rows, today]);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, { type: 'line', data: { labels: monthly.map(x => x.label), datasets: [
      { label: 'Admissões', data: monthly.map(x => x.admissions), borderColor: '#3ecf8e', backgroundColor: '#3ecf8e', pointRadius: 3.5, borderWidth: 2.2, tension: .32 },
      { label: 'Demissões', data: monthly.map(x => x.terminations), borderColor: '#f0555a', backgroundColor: '#f0555a', pointRadius: 3.5, borderWidth: 2.2, tension: .32 }
    ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { color: '#47525d', boxWidth: 12 } } }, scales: { x: { ticks: { color: '#59636c', maxRotation: 0, autoSkip: true }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#59636c', precision: 0 }, grid: { color: '#e4e7eb' } } } } });
    return () => chart.destroy();
  }, [monthly]);
  return <article className="cx-rh-panel"><h3>ADMISSÕES X DEMISSÕES <span className="cx-rh-tag">Últimos 13 meses</span></h3><div className="cx-rh-trend"><canvas ref={canvas} role="img" aria-label={`Admissões e demissões dos últimos 13 meses: ${monthly.map(x => `${x.label}: ${x.admissions} admissões, ${x.terminations} demissões`).join('; ')}`} /></div></article>;
}

export default function ManagementDashboard({ sb, projectId, canViewHousing, canViewContracts, canViewReimbursements, canViewFieldLeave, canViewCollaborators }: { sb: SupabaseClient; projectId: string; projectLabel: string; canViewHousing: boolean; canViewContracts: boolean; canViewReimbursements: boolean; canViewFieldLeave: boolean; canViewCollaborators: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);
  useEffect(() => {
    let active = true;
    if (!projectId || !canViewCollaborators) { setRows([]); setLoading(false); return; }
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError('');
      const loaded: Row[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error: queryError } = await sb.from('cx_collaborators').select('status,contract_type,department,role,hired_on,terminated_on').eq('project_id', projectId).order('id').range(start, start + 999);
        if (!active) return;
        if (queryError) { setError('Não foi possível carregar os indicadores de RH.'); setLoading(false); return; }
        loaded.push(...(data || []) as Row[]);
        if (!data || data.length < 1000) break;
      }
      if (active) { setRows(loaded); setLoading(false); }
    };
    void load(true);
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void load(false); };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    const channel = sb.channel(`cx-dashboard-collaborators-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cx_collaborators', filter: `project_id=eq.${projectId}` }, () => void load(false))
      .subscribe();
    return () => { active = false; window.removeEventListener('focus', refreshOnFocus); document.removeEventListener('visibilitychange', refreshOnFocus); void sb.removeChannel(channel); };
  }, [sb, projectId, canViewCollaborators]);
  const own = useMemo(() => rows.filter(row => !thirdParty(row.contract_type)), [rows]);
  const active = useMemo(() => own.filter(row => row.status?.toUpperCase() === 'ATIVO'), [own]);
  const absent = own.filter(row => row.status?.toUpperCase() === 'AFASTADO').length;
  const terminated = own.filter(row => !!dateOnly(row.terminated_on));
  const yearAgo = new Date(today); yearAgo.setDate(yearAgo.getDate() - 365);
  const terminated12 = terminated.filter(row => dateOnly(row.terminated_on)! >= yearAgo).length;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const terminatedMonth = terminated.filter(row => { const d = dateOnly(row.terminated_on)!; return d >= monthStart && d < monthEnd; }).length;
  const admittedMonth = own.filter(row => { const d = dateOnly(row.hired_on); return d && d >= monthStart && d < monthEnd; }).length;
  const experience = active.filter(row => { if (row.contract_type?.toUpperCase() !== 'CLT') return false; const d = dateOnly(row.hired_on); if (!d || row.terminated_on) return false; const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 89); return end >= today; }).length;
  const denominator = active.length + absent;
  const turnover = denominator ? (terminated12 / denominator * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '0,0%';
  const metrics = [['HEADCOUNT ATIVO', active.length], ['AFASTADOS', absent], ['DESLIGADOS (12M)', terminated12], ['DESLIGADOS (MÊS ATUAL)', terminatedMonth], ['ADMISSÕES (MÊS ATUAL)', admittedMonth], ['EM EXPERIÊNCIA', experience], ['TURNOVER (12M)', turnover]] as const;
  const roles = useMemo(() => countBy(active, 'role', 15), [active]);
  const departments = useMemo(() => countBy(active, 'department'), [active]);
  return <section className="cx-rh-dashboard" aria-label="Painel Gerencial"><div className="cx-management-title"><h1>PAINEL GERENCIAL</h1><p>Visão consolidada da obra: RH / DP, alojamentos, contratos e despesas.</p></div>{canViewCollaborators && <><h2>RH / DP <span className="cx-rh-tag">Resumo do Dashboard RH/DP</span></h2>
    {error && <div className="error" role="alert">{error}</div>}
    {loading ? <div className="cx-rh-loading" role="status">Carregando indicadores de RH…</div> : !error && <><div className="cx-rh-metrics">{metrics.map(([label, value], index) => <article className={index === 5 ? 'cx-rh-metric cx-rh-muted' : 'cx-rh-metric'} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <TrendChart rows={own} today={today} />
      <div className="cx-rh-two"><BarChart title="COLABORADORES POR FUNÇÃO" entries={roles} color="#5da8e8" /><BarChart title="HEADCOUNT POR SETOR/EQUIPE" entries={departments} color="#f5c518" /></div>
    </>}
    </>}
    {canViewHousing && <HousingDashboard sb={sb} projectId={projectId} />}
    <ManagementFinanceDashboard sb={sb} projectId={projectId} canViewContracts={canViewContracts} canViewReimbursements={canViewReimbursements} canViewFieldLeave={canViewFieldLeave} />
  </section>;
}
