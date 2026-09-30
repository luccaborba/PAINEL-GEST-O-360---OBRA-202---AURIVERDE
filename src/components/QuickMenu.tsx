'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Image from 'next/image';

type Module = { code: string; name: string; section: string; enabled: boolean };
const defaults = ['closing', 'reimbursements', 'field_leave', 'housing', 'contracts', 'collaborators'];
const icons: Record<string, string> = { closing: '📊', reimbursements: '🧾', field_leave: '🗓', housing: '🏠', contracts: '📑', collaborators: '👥', alerts: '🚨', assets: '🧰', safety: '🦺' };

export function useQuickMenu(sb: SupabaseClient | null, userId: string, projectId: string, modules: Module[], allowed: (code: string, action: string) => boolean) {
  const available = useMemo(() => modules.filter(m => m.enabled && m.code !== 'alerts' && allowed(m.code, 'view')), [modules, allowed]);
  const [saved, setSaved] = useState<string[]>([]), [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    setSaved([]); setDraft([]); setMessage('');
    if (!sb || !userId || !projectId) return;
    setLoading(true);
    void sb.from('cx_user_shortcuts').select('module_codes').eq('user_id', userId).eq('project_id', projectId).maybeSingle().then(({ data, error }) => {
      if (!live) return;
      const codes = (data?.module_codes as string[] | undefined) ?? defaults.filter(code => available.some(m => m.code === code));
      setSaved(codes); setDraft(codes); if (error) setMessage(`Não foi possível carregar os atalhos: ${error.message}`);
      setLoading(false);
    });
    return () => { live = false; };
  }, [sb, userId, projectId, available]);
  const visible = saved.filter(code => available.some(m => m.code === code)).map(code => available.find(m => m.code === code)!);
  function toggle(code: string) { setDraft(old => old.includes(code) ? old.filter(x => x !== code) : old.length >= 10 ? old : [...old, code]); setMessage(''); }
  function move(index: number, direction: -1 | 1) {
    setDraft(old => { const j = index + direction; if (j < 0 || j >= old.length) return old; const next = [...old]; [next[index], next[j]] = [next[j], next[index]]; return next; });
  }
  async function save() {
    if (!sb || !userId || !projectId || busy) return;
    setBusy(true); setMessage('');
    const codes = draft.filter(code => available.some(m => m.code === code)).slice(0, 10);
    const { error } = await sb.from('cx_user_shortcuts').upsert({ user_id: userId, project_id: projectId, module_codes: codes, updated_at: new Date().toISOString() }, { onConflict: 'user_id,project_id' });
    if (error) setMessage(`Não foi possível salvar o menu: ${error.message}`);
    else { setSaved(codes); setDraft(codes); setMessage('Menu rápido salvo para esta obra.'); }
    setBusy(false);
  }
  return { available, visible, draft, saved, busy, loading, message, toggle, move, save, reset: () => { setDraft(saved); setMessage(''); } };
}

export function QuickMenuBar({ quick, current, onOpen, onConfigure, alertControl, logoutControl }: { quick: ReturnType<typeof useQuickMenu>; current: string; onOpen: (code: string) => void; onConfigure: () => void; alertControl?: ReactNode; logoutControl?: ReactNode }) {
  return <nav className="cx-quickbar" aria-label="Menu rápido"><Image className="cx-quick-logo" src="/ccl-logo-contratos-v1.png" alt="Construtora Centro Leste" width={52} height={27} priority /><span className="cx-quick-label">ACESSO RÁPIDO</span><div className="cx-quick-items">{quick.visible.map(m => <button type="button" key={m.code} className={current === m.code ? 'cx-quick-item active' : 'cx-quick-item'} title={m.name} aria-label={m.name} onClick={() => onOpen(m.code)}><span aria-hidden="true">{icons[m.code] || '▦'}</span><small>{m.name}</small></button>)}{!quick.visible.length && !quick.loading && <span className="cx-quick-empty">Escolha seus atalhos em Cadastros</span>}</div>{alertControl}<button type="button" className="cx-quick-config" onClick={onConfigure} title="Configurar meu menu rápido" aria-label="Configurar meu menu rápido">⚙</button>{logoutControl}</nav>;
}

export function QuickMenuSettings({ quick, projectLabel, inactivityMinutes, onInactivityMinutesChange }: { quick: ReturnType<typeof useQuickMenu>; projectLabel: string; inactivityMinutes: number; onInactivityMinutesChange: (minutes: number) => void }) {
  const checked = quick.draft.filter(code => quick.available.some(m => m.code === code));
  return <section className="cx-quick-settings"><div className="heading"><div><span className="eyebrow">CADASTROS · {projectLabel}</span><h1>Gestão do Menu Rápido</h1><p>Escolha até 10 atalhos para a faixa superior e defina a ordem. Sua configuração é individual nesta obra.</p></div></div>
    {quick.message && <div className="notice" role="status">{quick.message}</div>}
    <div className="panel cx-timeout-settings"><h2>Timeout de logout</h2><p className="cx-quick-muted">Defina após quantos minutos sem atividade o sistema deve encerrar sua sessão automaticamente.</p><label><span>Minutos de inatividade</span><div><input type="number" min={1} max={240} step={1} value={inactivityMinutes} onChange={e => onInactivityMinutesChange(Number(e.target.value))} /><strong>{inactivityMinutes} min</strong></div></label><small>Faixa permitida: 1 a 240 minutos. A alteração é aplicada imediatamente neste navegador.</small></div>
    <div className="panel"><h2>Meus atalhos ({checked.length}/10)</h2>{checked.length ? <div className="cx-quick-selected">{checked.map((code, i) => { const m = quick.available.find(x => x.code === code)!; return <div key={code}><span className="cx-quick-drag">{icons[code] || '▦'} {m.name}</span><div><button type="button" title="Mover para a esquerda" aria-label={`Mover ${m.name} para a esquerda`} disabled={i === 0} onClick={() => quick.move(i, -1)}>←</button><button type="button" title="Mover para a direita" aria-label={`Mover ${m.name} para a direita`} disabled={i === checked.length - 1} onClick={() => quick.move(i, 1)}>→</button><button type="button" title={`Remover ${m.name}`} aria-label={`Remover ${m.name}`} onClick={() => quick.toggle(code)}>×</button></div></div>; })}</div> : <p className="cx-quick-muted">Nenhum atalho selecionado.</p>}
      <h2>Módulos disponíveis</h2><div className="cx-quick-choices">{quick.available.map(m => <label key={m.code}><input type="checkbox" checked={checked.includes(m.code)} disabled={!checked.includes(m.code) && checked.length >= 10} onChange={() => quick.toggle(m.code)} /> <span>{icons[m.code] || '▦'} {m.name}</span><small>{m.section}</small></label>)}</div>{!quick.available.length && <p className="cx-quick-muted">Não há módulos liberados nesta obra.</p>}
      <div className="cx-quick-save"><button type="button" onClick={quick.reset} disabled={quick.busy}>Desfazer alterações</button><button type="button" className="cx-primary" onClick={() => void quick.save()} disabled={quick.busy || quick.loading}>{quick.busy ? 'Salvando…' : 'Salvar meu menu rápido'}</button></div></div></section>;
}
