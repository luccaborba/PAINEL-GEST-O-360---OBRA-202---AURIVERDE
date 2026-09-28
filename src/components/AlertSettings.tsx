'use client';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Settings = { experience_45: boolean; experience_90: boolean; cnh: boolean; aso: boolean };
const defaults: Settings = { experience_45: true, experience_90: true, cnh: true, aso: false };
export default function AlertSettings({ sb, projectId }: { sb: SupabaseClient; projectId: string }) {
  const [saved, setSaved] = useState(defaults);
  const [draft, setDraft] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    setLoading(true); setMessage('');
    void sb.from('cx_alert_settings').select('experience_45,experience_90,cnh,aso').eq('project_id', projectId).maybeSingle().then(({ data, error }) => {
      if (!current) return;
      if (error) setMessage(`Não foi possível carregar a configuração: ${error.message}`);
      else { setSaved(data || defaults); setDraft(data || defaults); }
      setLoading(false);
    });
    return () => { current = false; };
  }, [sb, projectId]);
  async function save() {
    if (saving || loading) return;
    setSaving(true); setMessage('');
    const { data, error } = await sb.from('cx_alert_settings').upsert({ project_id: projectId, ...draft, updated_at: new Date().toISOString() }).select('experience_45,experience_90,cnh,aso').single();
    if (error) setMessage(`Não foi possível salvar: ${error.message}`);
    else { setSaved(data as Settings); setDraft(data as Settings); window.dispatchEvent(new CustomEvent('cx-alert-settings-changed', { detail: projectId })); setMessage('Configuração salva para esta obra. A central e o painel foram atualizados.'); }
    setSaving(false);
  }
  return <section className="cx-alert-settings cx-alert-settings-page"><h1>Gestão da Central de Alertas</h1><p>Defina quais vencimentos serão acompanhados nesta obra. Somente o administrador pode alterar estas opções.</p>
    {loading ? <p role="status">Carregando configuração…</p> : <><div className="cx-alert-settings-grid">{([['experience_45','Experiência 45 dias'],['experience_90','Experiência 90 dias'],['cnh','CNH'],['aso','ASO']] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={e => setDraft(old => ({ ...old, [key]: e.target.checked }))}/>{label}</label>)}</div><p>Os alertas começam 10 dias antes e somem depois do vencimento. As cores mudam aos 5 e 3 dias; com 1 dia ou no próprio dia, o alerta é crítico.</p><button type="button" onClick={() => void save()} disabled={saving || JSON.stringify(draft) === JSON.stringify(saved)}>{saving ? 'Salvando…' : 'Salvar configuração'}</button></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
