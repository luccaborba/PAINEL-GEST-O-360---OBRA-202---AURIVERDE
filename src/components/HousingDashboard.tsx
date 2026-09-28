'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
type Housing = { contract_code: string; description: string; capacity: number; capacity_confirmed: boolean; monthly_cost: number; status: string };
type Resident = { lodging: string | null; status: string; uses_lodging: string };

export default function HousingDashboard({ sb, projectId }: { sb: SupabaseClient; projectId: string }) {
  const [housing, setHousing] = useState<Housing[]>([]);
  const [people, setPeople] = useState<Resident[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    setError(''); setLoading(true); setHousing([]); setPeople([]);
    (async () => {
      const homes = await sb.from('cx_housing').select('contract_code,description,capacity,capacity_confirmed,monthly_cost,status').eq('project_id', projectId).eq('status', 'ATIVO').order('description');
      if (!active) return;
      if (homes.error) { setError('Não foi possível carregar os imóveis.'); setLoading(false); return; }
      const residents: Resident[] = [];
      for (let start = 0; ; start += 1000) {
        const page = await sb.from('cx_collaborators').select('lodging,status,uses_lodging').eq('project_id', projectId).eq('status', 'ATIVO').eq('uses_lodging', 'SIM').order('id').range(start, start + 999);
        if (!active) return;
        if (page.error) { setError('Não foi possível carregar a ocupação.'); setLoading(false); return; }
        residents.push(...(page.data || []) as Resident[]);
        if (!page.data || page.data.length < 1000) break;
      }
      setHousing((homes.data || []) as Housing[]); setPeople(residents); setLoading(false);
    })();
    return () => { active = false; };
  }, [sb, projectId]);
  const occupancy = useMemo(() => housing.map(home => ({ ...home, occupied: people.filter(person => person.lodging?.trim().toUpperCase() === home.contract_code.toUpperCase()).length })), [housing, people]);
  const missing = people.filter(person => !person.lodging || !housing.some(home => home.contract_code.toUpperCase() === person.lodging?.trim().toUpperCase())).length;
  const pendingCapacity = housing.filter(home => !home.capacity_confirmed).length;
  const capacity = occupancy.reduce((sum, home) => sum + Number(home.capacity || 0), 0);
  const available = occupancy.reduce((sum, home) => sum + Math.max(Number(home.capacity || 0) - home.occupied, 0), 0);
  const cost = occupancy.reduce((sum, home) => sum + Number(home.monthly_cost || 0), 0);
  const money = cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const metrics = [['IMÓVEIS', housing.length], ['ALOJADOS', people.length], ['CAPACIDADE', capacity], ['VAGAS DISPONÍVEIS', available], ['OCUPAÇÃO', capacity ? (people.length / capacity * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '0,0%'], ['CUSTO MENSAL', money]] as const;
  useEffect(() => {
    if (!canvas.current || !occupancy.length) return;
    const chart = new Chart(canvas.current, { type: 'bar', data: { labels: occupancy.map(home => home.description), datasets: [
      { label: 'Ocupados', data: occupancy.map(home => home.occupied), backgroundColor: '#f0555a', borderRadius: 3, barPercentage: 1, categoryPercentage: 1 },
      { label: 'Disponíveis', data: occupancy.map(home => Math.max(Number(home.capacity || 0) - home.occupied, 0)), backgroundColor: '#3ecf8e', borderRadius: 3, barPercentage: 1, categoryPercentage: 1 }
    ] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { position: 'top', labels: { color: '#47525d', boxWidth: 12 } } }, scales: { x: { beginAtZero: true, ticks: { color: '#59636c', precision: 0 }, grid: { color: '#e4e7eb' } }, y: { ticks: { color: '#47525d', font: { size: 10 } }, grid: { display: false } } } } });
    return () => chart.destroy();
  }, [occupancy]);
  return <section className="cx-housing-dashboard" aria-label="Dashboard de alojamentos"><h2>ALOJAMENTOS <span className="cx-rh-tag">Resumo do Dashboard de Alojamentos</span></h2>
    {error && <div className="error" role="alert">{error}</div>}
    {loading ? <div className="cx-rh-loading" role="status">Carregando indicadores de alojamentos…</div> : !error && <><div className="cx-rh-metrics">{metrics.map(([label, value], index) => <article className={index === 4 ? 'cx-rh-metric cx-rh-muted' : 'cx-rh-metric'} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <article className="cx-rh-panel"><h3>OCUPAÇÃO POR IMÓVEL</h3>{housing.length ? <div className="cx-housing-bars"><canvas ref={canvas} role="img" aria-label={`Ocupação por imóvel: ${occupancy.map(home => `${home.description}: ${home.occupied} ocupados, ${Math.max(Number(home.capacity || 0) - home.occupied, 0)} disponíveis`).join('; ')}`} /></div> : <div className="cx-rh-loading">Nenhum imóvel cadastrado nesta obra.</div>}</article>
      {pendingCapacity > 0 && <p className="cx-housing-note">{pendingCapacity} {pendingCapacity === 1 ? 'imóvel está' : 'imóveis estão'} com capacidade pendente. Capacidade, vagas disponíveis e percentual de ocupação são provisórios até essa informação ser cadastrada.</p>}
      {missing > 0 && <p className="cx-housing-note">{missing} {missing === 1 ? 'colaborador alojado está' : 'colaboradores alojados estão'} sem imóvel identificado no cadastro. {missing === 1 ? 'Ele entra' : 'Eles entram'} no total de alojados, mas não nas barras de imóveis.</p>}
    </>}
  </section>;
}
