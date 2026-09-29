'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Image from 'next/image';
import PermissionsChart from '@/components/PermissionsChart';
import Collaborators from '@/components/Collaborators';
import Housing from '@/components/Housing';
import Assets from '@/components/Assets';
import Closing from '@/components/Closing';
import ManagementDashboard from '@/components/ManagementDashboard';
import AlertCenter from '@/components/AlertCenter';
import AlertSettings from '@/components/AlertSettings';
import Contracts from '@/components/Contracts';
import ContractRequests from '@/components/ContractRequests';
import UserManagement from '@/components/UserManagement';
import BackupManagement from '@/components/BackupManagement';
import ContractDashboardSettings from '@/components/ContractDashboardSettings';
import FieldLeave from '@/components/FieldLeave';
import Reimbursements from '@/components/Reimbursements';
import TimeAttendance from '@/components/TimeAttendance';
import { useQuickMenu, QuickMenuBar, QuickMenuSettings } from '@/components/QuickMenu';
import { getSupabase } from '@/lib/supabase';

type Project = { id: string; code: string; name: string; active: boolean };
type Module = { code: string; name: string; section: string; enabled: boolean };
type Grant = { user_id: string; project_id: string; module_code: string; action: string };
type Member = { user_id: string; project_id: string; active: boolean };
type Profile = { user_id: string; name: string; email: string | null; system_admin: boolean };
const actions = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
const actionNames: Record<string, string> = { view: 'Visualizar', create: 'Criar', edit: 'Editar', delete: 'Excluir', approve: 'Aprovar', export: 'Exportar' };
const sectionIcons: Record<string, string> = { PESSOAS: '👤', CONTRATOS: '📄', FINANCEIRO: '💰', PATRIMÔNIO: '🧰', SESMT: '🦺', CADASTROS: '🗂️' };
const moduleIcons: Record<string, string> = { collaborators: '👥', housing: '🏠', field_leave: '🗓️', reimbursements: '🧾', time_attendance: '🕒', contracts: '📑', contract_requests: '📝', assets: '🧰', safety: '🦺', closing: '📊' };

export default function Home() {
  const sb = useMemo(getSupabase, []);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<Project[]>([]); const [modules, setModules] = useState<Module[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]); const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]); const [profile, setProfile] = useState<Profile | null>(null);
  const [projectId, setProjectId] = useState(''); const [view, setView] = useState('dashboard');
  const [targetId, setTargetId] = useState(''); const [newCode, setNewCode] = useState(''); const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [message, setMessage] = useState('');
  const [permissionDraft, setPermissionDraft] = useState<Set<string>>(new Set());
  const [membershipDraft, setMembershipDraft] = useState(false);
  const [permissionDirty, setPermissionDirty] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => { setSidebarCollapsed(window.localStorage.getItem('cx-sidebar-collapsed') === 'true'); }, []);
  function toggleSidebar() { setSidebarCollapsed(old => { window.localStorage.setItem('cx-sidebar-collapsed', String(!old)); return !old; }); }
  const admin = !!profile?.system_admin;
  const project = projects.find(p => p.id === projectId);
  const allowed = useCallback((code: string, action: string) => admin || grants.some(g => g.user_id === user?.id && g.project_id === projectId && g.module_code === code && g.action === action), [admin, grants, projectId, user]);

  // Encerra a sessão após 7 minutos sem interação do usuário.
  useEffect(() => {
    if (!sb || !user) return;
    const INACTIVITY_MS = 7 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const logout = () => { void sb.auth.signOut(); };
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(logout, INACTIVITY_MS); };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();
    return () => { clearTimeout(timer); events.forEach(event => window.removeEventListener(event, resetTimer)); };
  }, [sb, user]);

  const quickMenu = useQuickMenu(sb, user?.id || '', projectId, modules, allowed);

  const refresh = useCallback(async (id: string) => {
    if (!sb) return;
    setLoading(true);
    const [pr, mo, gr, me, meProfile] = await Promise.all([
      sb.from('cx_projects').select('id,code,name,active').order('code'),
      sb.from('cx_modules').select('code,name,section,enabled').eq('enabled', true).order('name'),
      sb.from('cx_grants').select('user_id,project_id,module_code,action'),
      sb.from('cx_memberships').select('user_id,project_id,active'),
      sb.from('cx_profiles').select('user_id,name,email,system_admin').eq('user_id', id).maybeSingle()
    ]);
    const firstError = [pr, mo, gr, me, meProfile].find(r => r.error)?.error;
    if (firstError) setMessage(`Não foi possível carregar o acesso: ${firstError.message}`);
    const items = (pr.data || []) as Project[];
    setProjects(items); setModules((mo.data || []) as Module[]); setGrants((gr.data || []) as Grant[]); setMembers((me.data || []) as Member[]);
    const self = meProfile.data as Profile | null; setProfile(self);
    setProjectId(old => items.some(p => p.id === old) ? old : items[0]?.id || '');
    if (self?.system_admin) {
      const all = await sb.from('cx_profiles').select('user_id,name,email,system_admin').order('name');
      setProfiles((all.data || []) as Profile[]);
      if (all.error) setMessage(all.error.message);
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    if (!sb) { setLoading(false); return; }
    sb.auth.getUser().then(({ data }) => { setUser(data.user); if (data.user) void refresh(data.user.id); else setLoading(false); });
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) { setProjects([]); setGrants([]); setProfile(null); setLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, [sb, refresh]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); if (!sb) return;
    setBusy(true); setMessage('');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setMessage('Não foi possível entrar. Confira seu e-mail e senha.');
    else if (data.user) { setUser(data.user); await refresh(data.user.id); }
    setBusy(false);
  }
  async function addProject(e: React.FormEvent) {
    e.preventDefault(); if (!sb || !admin) return;
    setBusy(true); setMessage('');
    const { error } = await sb.from('cx_projects').insert({ code: newCode.trim().toUpperCase(), name: newName.trim().toUpperCase() });
    if (error) setMessage(error.message); else { setNewCode(''); setNewName(''); setMessage('Obra cadastrada. Conceda acesso aos usuários na matriz de permissões.'); await refresh(user!.id); }
    setBusy(false);
  }
  useEffect(() => {
    if (!targetId || !projectId) { setPermissionDraft(new Set()); setMembershipDraft(false); setPermissionDirty(false); return; }
    setPermissionDraft(new Set(grants.filter(g => g.user_id === targetId && g.project_id === projectId).map(g => `${g.module_code}:${g.action}`)));
    setMembershipDraft(members.some(m => m.user_id === targetId && m.project_id === projectId && m.active));
    setPermissionDirty(false);
  }, [targetId, projectId, grants, members]);

  function setMembershipDraftValue(enabled: boolean) {
    setMembershipDraft(enabled);
    setPermissionDirty(true);
  }
  function setGrantDraft(code: string, action: string, enabled: boolean) {
    const key = `${code}:${action}`;
    setPermissionDraft(old => { const next = new Set(old); enabled ? next.add(key) : next.delete(key); return next; });
    setPermissionDirty(true);
  }
  async function savePermissions() {
    if (!sb || !admin || !targetId || !projectId || busy) return;
    setBusy(true); setMessage('');
    try {
      const membershipResult = membershipDraft
        ? await sb.from('cx_memberships').upsert({ user_id: targetId, project_id: projectId, active: true })
        : await sb.from('cx_memberships').delete().eq('user_id', targetId).eq('project_id', projectId);
      if (membershipResult.error) throw membershipResult.error;

      const remove = await sb.from('cx_grants').delete().eq('user_id', targetId).eq('project_id', projectId);
      if (remove.error) throw remove.error;
      const rows = [...permissionDraft].map(key => { const split = key.lastIndexOf(':'); return { user_id: targetId, project_id: projectId, module_code: key.slice(0, split), action: key.slice(split + 1) }; });
      if (membershipDraft && rows.length) {
        const insert = await sb.from('cx_grants').insert(rows);
        if (insert.error) throw insert.error;
      }
      await refresh(user!.id);
      setPermissionDirty(false);
      setMessage('Permissões atualizadas com sucesso.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  if (!sb) return <main className="setup"><div className="brand big">CONSTRU<span>-X</span><small>V2</small></div><h1>Configuração inicial</h1><p>Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local. Consulte o README antes de conectar o banco.</p></main>;
  if (loading) return <main className="setup"><div className="brand big">CONSTRU<span>-X</span><small>V2</small></div><p>Carregando seu acesso…</p></main>;
  if (!user) return <main className="login"><div className="login-panel"><div className="brand big">CONSTRU<span>-X</span><small>V2</small></div><div className="yellow-rule"/><h1>Acesse sua gestão de obras</h1><p>Entre com sua conta autorizada.</p><form onSubmit={signIn}><label>E-mail<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy}>{busy ? 'Entrando…' : 'Entrar no painel'}</button></form>{message && <p role="alert" className="error">{message}</p>}</div><div className="login-art"><div className="art-lines"/><strong>CONTROLE<br/>EM CADA<br/><em>OBRA.</em></strong><span>GESTÃO 360º · CONSTRU-X</span></div></main>;

  const canViewAlerts = allowed('alerts', 'view') && allowed('collaborators', 'view');
  const sections = [...new Set(modules.filter(m => allowed(m.code, 'view') && (m.code !== 'alerts' || canViewAlerts)).map(m => m.section))];
  const chartLabels = actions.map(a => actionNames[a]);
  const chartValues = actions.map(a => grants.filter(g => g.project_id === projectId && g.action === a).length);
  const visibleModules = modules.filter(m => allowed(m.code, 'view') && (m.code !== 'alerts' || canViewAlerts));
  const memberCount = new Set(members.filter(m => m.project_id === projectId && m.active).map(m => m.user_id)).size;
  return <div className="shell"><aside className={sidebarCollapsed ? "sidebar cx-sidebar-collapsed" : "sidebar"}><div className="cx-sidebar-head"><div className="cx-sidebar-brands"><Image className="cx-sidebar-logo" src="/constru-x-logo.png" alt="Constru-X" width={2048} height={682} priority /><Image className="cx-sidebar-ccl-logo" src="/ccl-logo-contratos-v1.png" alt="Construtora Centro Leste" width={800} height={400} priority /></div><button type="button" className="cx-sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>{sidebarCollapsed ? "☰" : "❮"}</button></div><button className={view === 'dashboard' ? 'nav active' : 'nav'} onClick={() => setView('dashboard')} title="Painel Gerencial"><span className="cx-menu-icon" aria-hidden="true"><svg className="cx-menu-chart" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16v-4m5 4V7m5 9v-6"/></svg></span><span className="cx-menu-label">PAINEL GERENCIAL</span></button>{sections.map(section => <details key={section}><summary title={section} onClick={sidebarCollapsed ? event => { event.preventDefault(); setSidebarCollapsed(false); window.localStorage.setItem('cx-sidebar-collapsed', 'false'); } : undefined}><span className="cx-menu-icon" aria-hidden="true">{sectionIcons[section] || '📁'}</span><span className="cx-menu-label">{section}</span></summary>{modules.filter(m => m.section === section && m.code !== 'alerts' && allowed(m.code, 'view')).map(m => <button className={view === m.code ? 'nav active' : 'nav'} key={m.code} onClick={() => setView(m.code)} title={m.name}><span className="cx-menu-icon" aria-hidden="true">{moduleIcons[m.code] || '▫'}</span><span className="cx-menu-label">{m.code === 'assets' ? 'Inventário' : m.name}</span></button>)}</details>)}<details className="cx-cadastros-menu"><summary title="Cadastros" onClick={sidebarCollapsed ? event => { event.preventDefault(); setSidebarCollapsed(false); window.localStorage.setItem('cx-sidebar-collapsed', 'false'); } : undefined}><span className="cx-menu-icon" aria-hidden="true">🗂️</span><span className="cx-menu-label">CADASTROS</span></summary>{admin && <><button className={view === 'projects' ? 'nav active' : 'nav'} onClick={() => setView('projects')} title="Cadastro de Obras"><span className="cx-menu-icon" aria-hidden="true">🏗️</span><span className="cx-menu-label">Obras</span></button><button className={view === 'alert_settings' ? 'nav active' : 'nav'} onClick={() => setView('alert_settings')} title="Gestão de Alertas"><span className="cx-menu-icon" aria-hidden="true">⚙️</span><span className="cx-menu-label">Gestão de Alertas</span></button><button className={view === 'contract_dashboard_settings' ? 'nav active' : 'nav'} onClick={() => setView('contract_dashboard_settings')} title="Dashboard de Contratos"><span className="cx-menu-icon" aria-hidden="true">📊</span><span className="cx-menu-label">Dashboard de Contratos</span></button></>}{allowed('assets', 'view') && <><button className={view === 'assets_catalog' ? 'nav active' : 'nav'} onClick={() => setView('assets_catalog')} title="Cadastro patrimonial"><span className="cx-menu-icon" aria-hidden="true">🧰</span><span className="cx-menu-label">Cadastro patrimonial</span></button><button className={view === 'assets_places' ? 'nav active' : 'nav'} onClick={() => setView('assets_places')} title="Cadastro de locais"><span className="cx-menu-icon" aria-hidden="true">🏢</span><span className="cx-menu-label">Cadastro de locais</span></button></>}<button className={view === 'menu_settings' ? 'nav active' : 'nav'} onClick={() => setView('menu_settings')} title="Gestão do Menu Rápido"><span className="cx-menu-icon" aria-hidden="true">⚡</span><span className="cx-menu-label">Gestão do Menu Rápido</span></button></details>{admin && <><div className="side-caption separator">ADMINISTRAÇÃO</div><button className={view === 'users' ? 'nav active' : 'nav'} onClick={() => setView('users')} title="Usuários"><span className="cx-menu-icon" aria-hidden="true">👤</span><span className="cx-menu-label">Usuários</span></button><button className={view === 'permissions' ? 'nav active' : 'nav'} onClick={() => setView('permissions')} title="Permissões"><span className="cx-menu-icon" aria-hidden="true">🔐</span><span className="cx-menu-label">Permissões</span></button><button className={view === 'backup' ? 'nav active' : 'nav'} onClick={() => setView('backup')} title="Backup"><span className="cx-menu-icon" aria-hidden="true">💾</span><span className="cx-menu-label">Backup</span></button></>}<div className="side-foot">ACESSO CONTROLADO POR OBRA</div></aside><div className="main-col"><QuickMenuBar quick={quickMenu} current={view} onOpen={setView} onConfigure={() => setView('menu_settings')} alertControl={canViewAlerts && projectId ? <AlertCenter sb={sb} projectId={projectId} projectCode={project?.code} navigation onOpen={() => setView('alerts')} /> : null} logoutControl={<button type="button" className="cx-quick-logout" onClick={() => void sb.auth.signOut()} title="Encerrar sessão" aria-label="Logout"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg><small>LOGOUT</small></button>} /><header className="topbar"><div><span className="eyebrow">PROJETO ATIVO</span><select aria-label="Selecione a obra" value={projectId} onChange={e => { setProjectId(e.target.value); setView('dashboard'); }}>{projects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div></header><main className="content">{message && <div className="notice" role="status">{message}<button aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}{view === 'dashboard' ? projectId ? <ManagementDashboard sb={sb} projectId={projectId} projectLabel={`${project?.code || ''} · ${project?.name || ''}`} canViewHousing={allowed('housing', 'view')} canViewContracts={allowed('contracts', 'view')} canViewReimbursements={allowed('reimbursements', 'view')} canViewFieldLeave={allowed('field_leave', 'view')} canViewCollaborators={allowed('collaborators', 'view')} /> : <><div className="heading"><div><span className="eyebrow">PAINEL GERENCIAL</span><h1>PAINEL GERENCIAL</h1><p>{project ? `${project.code} · ${project.name}` : 'Nenhuma obra disponível para seu usuário.'}</p></div></div><div className="metrics"><article className="metric"><span>OBRAS DISPONÍVEIS</span><strong>{projects.length}</strong><small>conforme seu acesso</small></article><article className="metric"><span>MÓDULOS LIBERADOS</span><strong>{visibleModules.length}</strong><small>na obra selecionada</small></article><article className="metric"><span>USUÁRIOS DA OBRA</span><strong>{admin ? memberCount : '—'}</strong><small>{admin ? 'acessos ativos' : 'visível ao administrador'}</small></article></div>{admin && <div className="panel chart-panel"><div className="panel-head"><div><h2>Permissões da obra</h2><p>Distribuição de acessos por ação</p></div><span className="tag">ACESSO</span></div>{chartValues.some(Boolean) ? <PermissionsChart labels={chartLabels} values={chartValues} /> : <div className="empty">Nenhuma permissão concedida nesta obra.</div>}</div>}</> : view === 'alerts' && canViewAlerts ? <AlertCenter sb={sb} projectId={projectId} projectCode={project?.code} /> : view === 'collaborators' && allowed('collaborators', 'view') ? <Collaborators sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('collaborators', 'create')} canEdit={allowed('collaborators', 'edit')} canDelete={allowed('collaborators', 'delete')} canManagePortal={admin} /> : view === 'field_leave' && allowed('field_leave', 'view') ? <FieldLeave sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('field_leave', 'create')} canEdit={allowed('field_leave', 'edit')} canDelete={allowed('field_leave', 'delete')} /> : view === 'reimbursements' && allowed('reimbursements', 'view') ? <Reimbursements sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('reimbursements', 'create')} canEdit={allowed('reimbursements', 'edit')} canDelete={allowed('reimbursements', 'delete')} canExport={allowed('reimbursements', 'export')} /> : view === 'contracts' && allowed('contracts', 'view') ? <Contracts sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} /> : view === 'contract_requests' && allowed('contract_requests', 'view') ? <ContractRequests sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('contract_requests', 'create')} canEdit={allowed('contract_requests', 'edit')} canDelete={allowed('contract_requests', 'delete')} canExport={allowed('contract_requests', 'export')} /> : view === 'closing' && allowed('closing', 'view') ? <Closing sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('closing', 'create')} canEdit={allowed('closing', 'edit')} canDelete={allowed('closing', 'delete')} canExport={allowed('closing', 'export')} /> : view === 'time_attendance' && allowed('time_attendance', 'view') ? <TimeAttendance sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} userId={user.id} canCreate={allowed('time_attendance', 'create')} canEdit={allowed('time_attendance', 'edit')} canDelete={allowed('time_attendance', 'delete')} canApprove={allowed('time_attendance', 'approve')} canExport={allowed('time_attendance', 'export')} /> : (view === 'assets_catalog' || view === 'assets_places') && allowed('assets', 'view') ? <Assets mode={view === 'assets_catalog' ? 'catalog' : 'places'} sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('assets', 'create')} canEdit={allowed('assets', 'edit')} canDelete={allowed('assets', 'delete')} onOpenCatalog={() => setView('assets_catalog')} /> : view === 'assets' && allowed('assets', 'view') ? <Assets sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('assets', 'create')} canEdit={allowed('assets', 'edit')} canDelete={allowed('assets', 'delete')} onOpenCatalog={() => setView('assets_catalog')} /> : view === 'housing' && allowed('housing', 'view') ? <Housing sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} canCreate={allowed('housing', 'create')} canEdit={allowed('housing', 'edit')} canDelete={allowed('housing', 'delete')} canExport={allowed('housing', 'export')} /> : view === 'menu_settings' && projectId ? <QuickMenuSettings quick={quickMenu} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} /> : view === 'contract_dashboard_settings' && admin && projectId ? <ContractDashboardSettings sb={sb} projectId={projectId} projectLabel={project ? `${project.code} · ${project.name}` : 'SELECIONE UMA OBRA'} /> : view === 'alert_settings' && admin && projectId ? <AlertSettings sb={sb} projectId={projectId} /> : view === 'projects' && admin ? <><div className="heading"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Obras e projetos</h1><p>Cada nova obra entra automaticamente na matriz de permissões.</p></div></div><div className="panel"><h2>Cadastrar obra</h2><form className="inline-form" onSubmit={addProject}><label>Código<input required value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="OBRA-202" maxLength={30}/></label><label>Nome<input required value={newName} onChange={e => setNewName(e.target.value.toUpperCase())} placeholder="IMPLANTAÇÃO AURIVERDE"/></label><button disabled={busy}>Cadastrar obra</button></form></div><div className="panel"><h2>Obras cadastradas</h2><div className="project-list">{projects.map(p => <div key={p.id}><strong>{p.code}</strong><span>{p.name}</span><span className="tag">{p.active ? 'ATIVA' : 'INATIVA'}</span></div>)}</div></div></> : view === 'users' && admin ? <UserManagement sb={sb} profiles={profiles} onRefresh={() => refresh(user.id)} onSelectPermissions={id => { setTargetId(id); setView('permissions'); }} /> : view === 'backup' && admin ? <BackupManagement sb={sb} /> : view === 'permissions' && admin ? <><div className="heading"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Permissões</h1><p>{project?.code || 'Selecione uma obra'} · Acesso por usuário, módulo e ação.</p></div></div><div className="panel"><div className="perm-controls"><label>Usuário<select value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Selecione um usuário</option>{profiles.map(p => <option key={p.user_id} value={p.user_id}>{p.name}{p.system_admin ? ' · ADMIN' : ''}</option>)}</select></label><label className="check-line"><input type="checkbox" disabled={!targetId || busy || !projectId} checked={membershipDraft} onChange={e => setMembershipDraftValue(e.target.checked)}/> Acesso à obra</label>{targetId && <button type="button" className="cx-permission-save" disabled={busy || !permissionDirty} onClick={() => void savePermissions()}>{busy ? 'SALVANDO…' : 'SALVAR ALTERAÇÕES'}</button>}</div>{targetId && <div className="matrix-scroll"><table><thead><tr><th>Módulo</th>{actions.map(a => <th key={a}>{actionNames[a]}</th>)}</tr></thead><tbody>{modules.map(m => <tr key={m.code}><td><strong>{m.name}</strong><small>{m.section}</small></td>{actions.map(a => <td key={a}><input type="checkbox" aria-label={`${actionNames[a]} ${m.name}`} disabled={busy || !membershipDraft} checked={permissionDraft.has(`${m.code}:${a}`)} onChange={e => setGrantDraft(m.code, a, e.target.checked)}/></td>)}</tr>)}</tbody></table></div>}{!targetId && <div className="empty">Selecione um usuário para configurar os acessos à obra.</div>}</div></> : <><div className="heading"><div><span className="eyebrow">MÓDULO</span><h1>{modules.find(m => m.code === view)?.name || 'Acesso indisponível'}</h1><p>{project?.code || ''}</p></div></div><div className="panel empty">Este módulo será migrado do painel atual na próxima etapa. A navegação já respeita suas permissões.</div></>}</main><footer className="cx-app-credit">Idealizado e desenvolvido por: <strong>Luciano Garcia Borba</strong></footer></div></div>;
}
