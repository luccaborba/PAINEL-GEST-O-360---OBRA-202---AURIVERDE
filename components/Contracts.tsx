'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Contract = { id: string; code: string; supplier: string | null; contract_type: string | null; description: string | null; contracted_amount: number | null; monthly_amount: number | null; starts_on: string | null; ends_on: string | null; status: string | null; terminated_on: string | null; closing: string | null; justification: string | null; measurement_regime: string | null; plate: string | null; equipment_id: string | null; measured_amount: number; balance_amount: number; sienge_total: number | null; sienge_checked_at: string };
const money = (value: number | null) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const compactMoney = (value: number | null) => value == null ? '—' : `R$ ${Math.round(Number(value)).toLocaleString('pt-BR')}`;
export default function Contracts({ sb, projectId, projectLabel }: { sb: SupabaseClient; projectId: string; projectLabel: string }) {
  const [rows, setRows] = useState<Contract[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setRows([]); setLoading(true); setError(''); setSelected(null); setSearch(''); setType(''); setStatus('');
    (async () => {
      const all: Contract[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error: queryError } = await sb.from('cx_contracts').select('id,code,supplier,contract_type,description,contracted_amount,monthly_amount,starts_on,ends_on,status,terminated_on,closing,justification,measurement_regime,plate,equipment_id,measured_amount,balance_amount,sienge_total,sienge_checked_at').eq('project_id', projectId).order('code').range(start, start + 999);
        if (!current) return;
        if (queryError) { setError('Não foi possível carregar os contratos desta obra.'); setLoading(false); return; }
        all.push(...(data || []) as Contract[]);
        if (!data || data.length < 1000) break;
      }
      if (current) { setRows(all); setLoading(false); }
    })();
    return () => { current = false; };
  }, [sb, projectId]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);
  const types = useMemo(() => [...new Set(rows.map(row => row.contract_type || 'NÃO INFORMADO'))].sort((a,b) => a.localeCompare(b,'pt-BR')), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(row => row.status || 'NÃO INFORMADO'))].sort((a,b) => a.localeCompare(b,'pt-BR')), [rows]);
  const visible = useMemo(() => rows.filter(row => (!type || (row.contract_type || 'NÃO INFORMADO') === type) && (!status || (row.status || 'NÃO INFORMADO') === status) && (!search || `${row.code} ${row.supplier} ${row.description}`.toLocaleUpperCase('pt-BR').includes(search.toLocaleUpperCase('pt-BR')))).sort((a,b) => Number(b.contracted_amount || 0) - Number(a.contracted_amount || 0) || a.code.localeCompare(b.code)), [rows, type, status, search]);
  const mismatch = (row: Contract) => row.sienge_total != null && row.contracted_amount != null && Math.abs(Number(row.sienge_total) - Number(row.contracted_amount)) > .02;
  return <section className="cx-contracts"><div className="heading"><div><span className="eyebrow">CONTRATOS · {projectLabel}</span><h1>Base de contratos</h1><p>Cadastros do Constru-X v1 · Medições e saldos do relatório Sienge.</p></div></div>
    <div className="panel cx-contract-toolbar"><label>Buscar contrato, fornecedor ou objeto<input value={search} onChange={event => setSearch(event.target.value)} placeholder="DIGITE PARA BUSCAR" /></label><label>Tipo<select value={type} onChange={event => setType(event.target.value)}><option value="">Todos os tipos</option>{types.map(item => <option key={item}>{item}</option>)}</select></label><label>Situação<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todas as situações</option>{statuses.map(item => <option key={item}>{item}</option>)}</select></label></div>
    {error && <p role="alert" className="error">{error}</p>}{loading ? <div className="panel" role="status">Carregando contratos…</div> : <div className="cx-contract-board"><h2>CONTRATOS <span>{visible.length}</span></h2><div className="cx-contract-scroll"><table><thead><tr><th>CONTRATO</th><th>FORNECEDOR</th><th>TIPO</th><th>CONTRATADO</th><th>MEDIDO</th><th>SALDO</th><th>AVANÇO</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>{visible.map(row => { const progress = row.contracted_amount && row.measured_amount != null ? Math.max(0,Math.min(100,Math.round(Number(row.measured_amount)/Number(row.contracted_amount)*100))) : null; const statusClass = /rescind|encerr|cancel/i.test(row.status || '') ? 'ended' : /pendente/i.test(row.status || '') ? 'pending' : /medid|ativo|vigente/i.test(row.status || '') ? 'running' : 'neutral'; return <tr key={row.id}><td><button type="button" className="cx-contract-link" onClick={() => setSelected(row)}>{row.code}</button></td><td className="cx-contract-supplier"><strong title={row.supplier || ''}>{row.supplier || '—'}</strong><small title={row.description || ''}>{row.description || '—'}</small></td><td className="cx-contract-type">{row.contract_type || '—'}</td><td>{compactMoney(row.contracted_amount)}{mismatch(row) && <span className="cx-contract-difference" title="Valor total diferente no relatório Sienge">≠ Sienge</span>}</td><td title={row.measured_amount == null ? 'Sem medição conciliada no Sienge' : money(row.measured_amount)}>{compactMoney(row.measured_amount)}</td><td title={row.balance_amount == null ? 'Sem saldo conciliado no Sienge' : money(row.balance_amount)}>{compactMoney(row.balance_amount)}</td><td><div className="cx-contract-progress" title={progress == null ? 'Sem medição conciliada' : `${progress}% do valor contratado`}><span><i style={{width:`${progress || 0}%`}} /></span><b>{progress == null ? '—' : `${progress}%`}</b></div></td><td><span className={`cx-contract-status ${statusClass}`}>{row.status || '—'}</span></td><td><div className="cx-contract-actions"><button type="button" onClick={() => setSelected(row)} title="Abrir ficha do contrato">✏️ Editar</button><button type="button" disabled title="Aditivos ainda não migrados para o v2">🧩 Aditivos</button><button type="button" disabled title="Rescisão ainda não disponível no v2" className="danger">✂ Rescindir</button></div></td></tr>; })}</tbody></table></div>{!visible.length && <p>Nenhum contrato encontrado.</p>}<footer>{visible.length} contrato(s)</footer></div>}
    {selected && <div className="cx-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><div className="panel cx-modal cx-contract-modal" role="dialog" aria-modal="true" aria-labelledby="cx-contract-title"><div className="cx-dialog-head"><div><span className="eyebrow">FICHA DO CONTRATO · {projectLabel}</span><h2 id="cx-contract-title">{selected.code}</h2></div><button type="button" className="cx-dialog-close" aria-label="Fechar" onClick={() => setSelected(null)}>×</button></div><dl>{([['Fornecedor', selected.supplier],['Tipo de contrato',selected.contract_type],['Objeto / descrição',selected.description],['Situação',selected.status],['Início',date(selected.starts_on)],['Término',date(selected.ends_on)],['Rescisão',date(selected.terminated_on)],['Valor contratado v1',money(selected.contracted_amount)],['Valor mensal v1',money(selected.monthly_amount)],['Total no Sienge',money(selected.sienge_total)],['Total medido no Sienge',money(selected.measured_amount)],['Saldo informado no Sienge',money(selected.balance_amount)],['Regime de medição',selected.measurement_regime],['Fechamento',selected.closing],['Justificativa',selected.justification],['Placa',selected.plate],['Equipamento',selected.equipment_id]] as [string,string | null][]).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>{mismatch(selected) && <p className="notice">O valor contratado do v1 é diferente do total no Sienge. Os dois valores foram mantidos para conferência.</p>}{selected.sienge_total != null && selected.measured_amount != null && selected.balance_amount != null && Math.abs(Number(selected.sienge_total) - Number(selected.measured_amount) - Number(selected.balance_amount)) > .02 && <p className="notice">O saldo informado no Sienge difere do cálculo total menos medido. O saldo exibido é o informado no relatório.</p>}</div></div>}
  </section>;
}
