'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import type { Plugin } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
type Contract = { contract_type: string | null; contracted_amount: number | null; measured_amount: number | null };
type Expense = { competence: string; amount: number | null; collaborator_id: string | null };
type Leave = { id: string; competence: string; collaborator_id: string | null };
type LeaveExpense = { field_leave_id: string; amount: number | null };
const cash = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const count = (value: number) => value.toLocaleString('pt-BR');
const normalizedMonth = (value: string) => (value || '').slice(0, 7);
function monthsBack(now: Date) { return Array.from({ length: 6 }, (_, index) => { const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1); return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`; }); }
function caption(value: string) { return new Date(`${value}-02T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short', year: 'numeric' }).replace(' de ', '/'); }
function monthName(value: string) { return new Date(`${value}-02T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long' }); }
function shortMoney(value: number) { return value >= 1000 ? `${(value / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil` : value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
async function allRows<T>(sb: SupabaseClient, table: string, columns: string, projectId: string, fromDate?: string): Promise<T[]> {
  const output: T[] = [];
  for (let start = 0; ; start += 1000) {
    let query = sb.from(table).select(columns).eq('project_id', projectId).range(start, start + 999);
    if (fromDate) query = query.gte('competence', fromDate);
    const { data, error } = await query;
    if (error) throw error;
    output.push(...(data || []) as T[]);
    if (!data || data.length < 1000) break;
  }
  return output;
}
function MoneyChart({ labels, datasets, horizontal = false }: { labels: string[]; datasets: { label: string; data: number[]; color: string }[]; horizontal?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const valueLabels: Plugin<'bar'> = { id: 'cxMoneyValueLabels', afterDatasetsDraw(chart) {
      if (horizontal) return;
      const context = chart.ctx;
      context.save(); context.fillStyle = '#28323c'; context.textAlign = 'center'; context.textBaseline = 'bottom'; context.font = '600 11px Arial';
      chart.data.datasets.forEach((dataset, datasetIndex) => chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
        const value = Number(dataset.data[index] || 0);
        if (value > 0) context.fillText(shortMoney(value), bar.x, bar.y - 5);
      }));
      context.restore();
    } };
    const chart = new Chart(canvas.current, { type: 'bar', data: { labels, datasets: datasets.map(row => ({ label: row.label, data: row.data, backgroundColor: row.color, borderRadius: 3, categoryPercentage: .82, barPercentage: .94, maxBarThickness: horizontal ? 28 : 54 })) }, plugins: [valueLabels], options: { responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x', layout: { padding: { top: horizontal ? 0 : 22 } }, plugins: { legend: { labels: { color: '#47525d', boxWidth: 12 } }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${cash(Number(item.raw || 0))}` } } }, scales: { x: { ticks: horizontal ? { color: '#59636c', callback: value => cash(Number(value)) } : { color: '#59636c', callback: value => labels[Number(value)] || '' }, grid: { color: '#e4e7eb' } }, y: { beginAtZero: !horizontal, grace: horizontal ? 0 : '14%', ticks: horizontal ? { color: '#59636c' } : { color: '#59636c', callback: value => cash(Number(value)) }, grid: { color: '#e4e7eb' } } } } });
    return () => chart.destroy();
  }, [labels, datasets, horizontal]);
  return <div className={horizontal ? 'cx-management-chart cx-management-chart-tall' : 'cx-management-chart'}><canvas ref={canvas} role="img" aria-label={`${datasets.map(d => `${d.label}: ${d.data.map(cash).join(', ')}`).join('; ')}`} /></div>;
}
function Metrics({ items }: { items: [string, string][] }) { return <div className="cx-rh-metrics">{items.map(([label, value]) => <article className="cx-rh-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>; }

export default function ManagementFinanceDashboard({ sb, projectId, canViewContracts, canViewReimbursements, canViewFieldLeave }: { sb: SupabaseClient; projectId: string; canViewContracts: boolean; canViewReimbursements: boolean; canViewFieldLeave: boolean }) {
  const [contracts, setContracts] = useState<Contract[]>([]), [reimbursements, setReimbursements] = useState<Expense[]>([]), [leaves, setLeaves] = useState<Leave[]>([]), [leaveExpenses, setLeaveExpenses] = useState<LeaveExpense[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(true);
  const today = useMemo(() => new Date(), []), months = useMemo(() => monthsBack(today), [today]), current = months[5];
  useEffect(() => {
    let live = true;
    setContracts([]); setSelectedTypes(null); setReimbursements([]); setLeaves([]); setLeaveExpenses([]); setErrors([]); setLoading(true);
    if (!projectId || !canViewContracts && !canViewReimbursements && !canViewFieldLeave) { setLoading(false); return; }
    const first = `${months[0]}-01`;
    const jobs: Promise<void>[] = [];
    if (canViewContracts) jobs.push((async () => {
      const [data, settings] = await Promise.all([
        allRows<Contract>(sb, 'cx_contracts', 'contract_type,contracted_amount,measured_amount', projectId),
        sb.from('cx_contract_dashboard_settings').select('selected_types').eq('project_id', projectId).maybeSingle()
      ]);
      if (settings.error) throw settings.error;
      if (live) { setContracts(data); setSelectedTypes(settings.data ? settings.data.selected_types as string[] : null); }
    })().catch(() => { if (live) setErrors(old => [...old, 'Não foi possível carregar contratos ou a seleção de tipos.']); }));
    if (canViewReimbursements) jobs.push(allRows<Expense>(sb, 'cx_reimbursements', 'competence,amount,collaborator_id', projectId, first).then(data => { if (live) setReimbursements(data); }).catch(() => { if (live) setErrors(old => [...old, 'Não foi possível carregar reembolsos.']); }));
    if (canViewFieldLeave) jobs.push((async () => {
      const records = await allRows<Leave>(sb, 'cx_field_leaves', 'id,competence,collaborator_id', projectId, first);
      if (!live) return;
      setLeaves(records);
      if (records.length) {
        const all = await allRows<LeaveExpense>(sb, 'cx_field_leave_expenses', 'field_leave_id,amount', projectId);
        if (live) setLeaveExpenses(all);
      }
    })().catch(() => { if (live) setErrors(old => [...old, 'Não foi possível carregar despesas de folga.']); }));
    void Promise.all(jobs).then(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [sb, projectId, canViewContracts, canViewReimbursements, canViewFieldLeave, months]);
  const filteredContracts = useMemo(() => selectedTypes === null ? contracts : contracts.filter(row => selectedTypes.includes(row.contract_type?.trim() || 'NÃO INFORMADO')), [contracts, selectedTypes]);
  const byType = useMemo(() => {
    const totals = new Map<string, { contracted: number; measured: number }>();
    filteredContracts.forEach(row => { const name = row.contract_type?.trim() || 'NÃO INFORMADO'; const prev = totals.get(name) || { contracted: 0, measured: 0 }; prev.contracted += Number(row.contracted_amount || 0); prev.measured += Number(row.measured_amount || 0); totals.set(name, prev); });
    return [...totals.entries()].sort((a, b) => b[1].contracted - a[1].contracted);
  }, [filteredContracts]);
  const totalContracted = byType.reduce((n, row) => n + row[1].contracted, 0), totalMeasured = byType.reduce((n, row) => n + row[1].measured, 0);
  const leaveMonth = new Map(leaves.map(row => [row.id, normalizedMonth(row.competence)]));
  const rValue = (month: string) => reimbursements.filter(row => normalizedMonth(row.competence) === month).reduce((n, row) => n + Number(row.amount || 0), 0);
  const fValue = (month: string) => leaveExpenses.filter(row => leaveMonth.get(row.field_leave_id) === month).reduce((n, row) => n + Number(row.amount || 0), 0);
  const currentR = reimbursements.filter(row => normalizedMonth(row.competence) === current), currentF = leaves.filter(row => normalizedMonth(row.competence) === current);
  const rTotal = rValue(current), fTotal = fValue(current);
  const contractDatasets = useMemo(() => [{ label: 'Contratado', data: byType.map(row => row[1].contracted), color: '#b6ada0' }, { label: 'Medido', data: byType.map(row => row[1].measured), color: '#f5c518' }], [byType]);
  const expenseDatasets = useMemo(() => [{ label: 'Reembolsos', data: months.map(rValue), color: '#f5c518' }, { label: 'Folga de Campo', data: months.map(fValue), color: '#87ceeb' }], [months, reimbursements, leaves, leaveExpenses]);
  return <>
    {errors.length > 0 && <p className="error" role="alert">{errors.join(' ')}</p>}
    {canViewContracts && <section className="cx-rh-dashboard cx-management-section" aria-label="Dashboard de contratos"><h2>Contratos <span className="cx-rh-tag">Resumo do Dashboard de Contratos</span></h2>{loading ? <div className="cx-rh-loading">Carregando contratos…</div> : <><Metrics items={[["CONTRATOS", count(filteredContracts.length)], ["VALOR CONTRATADO", cash(totalContracted)], ["VALOR MEDIDO", cash(totalMeasured)], ["SALDO", cash(totalContracted - totalMeasured)], ["AVANÇO MÉDIO", `${(totalContracted ? totalMeasured / totalContracted * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`], ["TIPOS DE CONTRATO", count(byType.length)]]} /><article className="cx-rh-panel"><h3>CONTRATADO VS. MEDIDO POR TIPO</h3>{byType.length ? <MoneyChart horizontal labels={byType.map(row => row[0].includes(' - ') ? row[0].split(' - ').slice(1).join(' - ') : row[0])} datasets={contractDatasets} /> : <p>Nenhum contrato dos tipos selecionados nesta obra.</p>}</article></>}</section>}
    {(canViewReimbursements || canViewFieldLeave) && <section className="cx-rh-dashboard cx-management-section" aria-label="Despesas RH"><h2>Reembolsos x Folga de Campo <span className="cx-rh-tag">Competência atual: {caption(current)}</span></h2>{loading ? <div className="cx-rh-loading">Carregando despesas…</div> : <><Metrics items={[["REEMBOLSOS", cash(rTotal)], ["FOLGA DE CAMPO", cash(fTotal)], ["TOTAL DE DESPESAS", cash(rTotal + fTotal)], ["PESSOAS REEMBOLSADAS", count(new Set(currentR.map(row => row.collaborator_id).filter(Boolean)).size)], ["PESSOAS EM FOLGA", count(new Set(currentF.map(row => row.collaborator_id).filter(Boolean)).size)]]} /><article className="cx-rh-panel"><h3>REEMBOLSOS X FOLGA DE CAMPO <span className="cx-rh-tag">Últimos 6 meses</span></h3><MoneyChart labels={months.map(monthName)} datasets={expenseDatasets.filter(row => row.label === 'Reembolsos' ? canViewReimbursements : canViewFieldLeave)} /></article></>}</section>}
  </>;
}
