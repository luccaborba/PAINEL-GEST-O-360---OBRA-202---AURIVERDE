'use client';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

type Document = { id: string; kind: 'ATESTADO' | 'HOLERITE'; period: string | null; storage_path: string; original_name: string; review_status: string; created_at: string };
type Employee = { id: string; name: string; registration: string; status: string };
const bucket = 'cx-employee-private';
export default function PortalPage() {
  const sb = useMemo(getSupabase, []);
  const [user, setUser] = useState<User | null>(null); const [employee, setEmployee] = useState<Employee | null>(null);
  const [docs, setDocs] = useState<Document[]>([]); const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    if (!sb) { setLoading(false); return; }
    let mounted = true;
    async function load() {
      const { data: auth } = await sb!.auth.getUser();
      if (!mounted) return;
      setUser(auth.user); setEmployee(null); setDocs([]);
      if (auth.user) {
        const { data: link, error: linkError } = await sb!.from('cx_portal_links').select('collaborator_id').eq('user_id', auth.user.id).maybeSingle();
        if (!mounted) return;
        if (linkError) setMessage('Não foi possível verificar o vínculo do portal.');
        else if (link) {
          const [profile, documents] = await Promise.all([sb!.from('cx_collaborators').select('id,name,registration,status').eq('id', link.collaborator_id).single(), sb!.from('cx_employee_documents').select('id,kind,period,storage_path,original_name,review_status,created_at').eq('collaborator_id', link.collaborator_id).order('created_at', { ascending: false })]);
          if (!mounted) return;
          if (profile.error || documents.error) setMessage('Não foi possível carregar os dados do portal.');
          else { setEmployee(profile.data as Employee); setDocs((documents.data || []) as Document[]); }
        }
      }
      setLoading(false);
    }
    void load();
    const { data: sub } = sb.auth.onAuthStateChange(() => { void load(); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [sb]);
  async function login(event: React.FormEvent) { event.preventDefault(); if (!sb) return; setBusy(true); setMessage(''); const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) setMessage('Confira o e-mail e a senha informados.'); setBusy(false); }
  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!sb || !user || !employee || !file || busy) return;
    if (file.size > 10 * 1024 * 1024 || !['application/pdf','image/jpeg','image/png'].includes(file.type)) { setMessage('Envie PDF, JPG ou PNG de até 10 MB.'); return; }
    setBusy(true); setMessage('');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const path = `atestados/${employee.id}/${crypto.randomUUID()}-${safeName}`;
    const uploaded = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) setMessage(`Não foi possível enviar o atestado: ${uploaded.error.message}`);
    else {
      const saved = await sb.from('cx_employee_documents').insert({ collaborator_id: employee.id, kind: 'ATESTADO', storage_path: path, original_name: file.name, uploaded_by: user.id }).select('id,kind,period,storage_path,original_name,review_status,created_at').single();
      if (saved.error) setMessage('O arquivo foi enviado, mas o registro não foi concluído. Contate o administrador e não repita o envio.');
      else { setDocs(old => [saved.data as Document, ...old]); setFile(null); const input = document.getElementById('cx-portal-file') as HTMLInputElement | null; if (input) input.value = ''; setMessage('Atestado enviado.'); }
    }
    setBusy(false);
  }
  async function download(doc: Document) {
    if (!sb) return; setBusy(true); setMessage('');
    const { data, error } = await sb.storage.from(bucket).download(doc.storage_path);
    if (error || !data) setMessage('Não foi possível baixar o arquivo.');
    else { const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = doc.original_name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    setBusy(false);
  }
  if (!sb) return <main className="cx-portal-shell">Configure a conexão do projeto.</main>;
  if (loading) return <main className="cx-portal-shell">Carregando portal…</main>;
  if (!user) return <main className="cx-portal-shell"><div className="cx-portal-login panel"><div className="brand big">CONSTRU<span>-X</span><small>PORTAL</small></div><h1>Portal do Colaborador</h1><p>Acesse com seu e-mail e senha autorizados.</p><form onSubmit={login}><label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label><label>Senha<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label><button className="cx-primary" disabled={busy}>Entrar</button></form>{message && <p role="alert">{message}</p>}</div></main>;
  return <main className="cx-portal-shell"><div className="cx-portal-content"><header className="cx-portal-header"><div className="brand big">CONSTRU<span>-X</span><small>PORTAL</small></div><button onClick={() => void sb.auth.signOut()}>Sair</button></header>{message && <div className="notice" role="status">{message}</div>}
    {!employee ? <section className="panel"><h1>Acesso ainda não vinculado</h1><p>Esta conta precisa ser vinculada ao seu cadastro de colaborador pela administração. Sua identificação de acesso é <code>{user.id}</code>.</p></section> : <><div className="heading"><div><span className="eyebrow">ÁREA DO COLABORADOR</span><h1>Olá, {employee.name}</h1><p>Matrícula {employee.registration} · {employee.status}</p></div></div><div className="cx-portal-grid"><section className="panel"><h2>Enviar atestado</h2><p>Envie um PDF, JPG ou PNG de até 10 MB. O documento ficará disponível somente para você e para a administração autorizada.</p><form onSubmit={upload}><label>Arquivo<input id="cx-portal-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required onChange={e => setFile(e.target.files?.[0] || null)} /></label><button className="cx-primary" disabled={busy || !file}>{busy ? 'Enviando…' : 'Enviar atestado'}</button></form></section><section className="panel"><h2>Meus holerites</h2>{docs.filter(x => x.kind === 'HOLERITE').length ? <ul className="cx-portal-docs">{docs.filter(x => x.kind === 'HOLERITE').map(doc => <li key={doc.id}><span>{doc.period ? new Date(`${doc.period}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : doc.original_name}</span><button disabled={busy} onClick={() => void download(doc)}>Baixar</button></li>)}</ul> : <p>Nenhum holerite disponibilizado para sua conta até o momento.</p>}</section></div><section className="panel"><h2>Atestados enviados</h2>{docs.filter(x => x.kind === 'ATESTADO').length ? <ul className="cx-portal-docs">{docs.filter(x => x.kind === 'ATESTADO').map(doc => <li key={doc.id}><span>{doc.original_name} · {new Date(doc.created_at).toLocaleDateString('pt-BR')} · {doc.review_status}</span><button disabled={busy} onClick={() => void download(doc)}>Baixar</button></li>)}</ul> : <p>Nenhum atestado enviado.</p>}</section></>}
  </div></main>;
}
