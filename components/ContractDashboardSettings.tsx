'use client';
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const label = (type: string | null) => type?.trim() || 'NÃO INFORMADO';

export default function ContractDashboardSettings({ sb, projectId, projectLabel }: { sb: SupabaseClient; projectId: string; projectLabel: string }) {
  const [types, setTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setLoading(true); setTypes([]); setSelected([]); setError(''); setMessage('');
    void (async () => {
      try {
        const all: string[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await sb.from('cx_contracts').select('contract_type').eq('project_id', projectId).order('id').range(offset, offset + 999);
          if (result.error) throw result.error;
          all.push(...(result.data || []).map(item => label(item.contract_type)));
          if (!result.data || result.data.length < 1000) break;
        }
        const options = [...new Set(all)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const saved = await sb.from('cx_contract_dashboard_settings').select('selected_types').eq('project_id', projectId).maybeSingle();
        if (saved.error) throw saved.error;
        if (live) { setTypes(options); setSelected(saved.data ? (saved.data.selected_types as string[]).filter(type => options.includes(type)) : options); }
      } catch (cause) { if (live) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os tipos de contrato.'); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [sb, projectId]);
  function toggle(type: string) { setSelected(old => old.includes(type) ? old.filter(item => item !== type) : [...old, type]); setMessage(''); }
  async function save() {
    if (saving || loading) return;
    setSaving(true); setError(''); setMessage('');
    const result = await sb.from('cx_contract_dashboard_settings').upsert({ project_id: projectId, selected_types: selected, updated_at: new Date().toISOString() }, { onConflict: 'project_id' });
    if (result.error) setError(`Não foi possível salvar: ${result.error.message}`);
    else setMessage('Tipos salvos. O Painel Gerencial exibirá somente os contratos selecionados nesta obra.');
    setSaving(false);
  }
  return <section className="cx-contract-dashboard-settings"><div className="heading"><div><span className="eyebrow">CADASTROS · {projectLabel}</span><h1>Tipos no Dashboard de Contratos</h1><p>Escolha os tipos que entram nos indicadores e no gráfico de contratos do Painel Gerencial desta obra.</p></div></div>
    <div className="panel"><div className="cx-contract-dashboard-settings-head"><div><h2>TIPOS DE CONTRATO</h2><span>{selected.length} de {types.length} selecionados</span></div><div><button type="button" onClick={() => setSelected(types)} disabled={loading || saving}>Selecionar todos</button><button type="button" onClick={() => setSelected([])} disabled={loading || saving}>Limpar seleção</button></div></div>
      {loading ? <p role="status">Carregando os tipos da obra…</p> : <div className="cx-contract-dashboard-choices">{types.map(type => <label key={type}><input type="checkbox" checked={selected.includes(type)} onChange={() => toggle(type)} disabled={saving} /><span>{type}</span></label>)}{!types.length && !error && <p>Nenhum tipo de contrato cadastrado nesta obra.</p>}</div>}
      {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
      <div className="cx-contract-dashboard-settings-save"><button type="button" onClick={() => void save()} disabled={loading || saving || !!error}>{saving ? 'Salvando…' : 'Salvar seleção'}</button></div>
    </div>
  </section>;
}
