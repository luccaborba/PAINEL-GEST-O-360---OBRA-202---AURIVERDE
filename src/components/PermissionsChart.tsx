'use client';
import { useEffect, useRef } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
export default function PermissionsChart({ labels, values }: { labels: string[]; values: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !values.some(Boolean)) return;
    const chart = new Chart(canvas.current, { type: 'bar', data: { labels, datasets: [{ label: 'Permissões concedidas', data: values, backgroundColor: '#f5c518', borderRadius: 5, maxBarThickness: 42 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#edf0f2' } }, x: { grid: { display: false } } } } });
    return () => chart.destroy();
  }, [labels, values]);
  return <div className="chart"><canvas ref={canvas} aria-label="Permissões concedidas por ação" role="img" /></div>;
}
