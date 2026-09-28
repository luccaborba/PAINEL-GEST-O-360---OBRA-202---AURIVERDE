'use client';
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Doc = { id: string; kind: string; period: string | null; work_date: string | null; original_name: string; created_at: string; storage_path: string };
export default function PortalManagement({ sb, collaboratorId }: { sb: SupabaseClient; collaboratorId: string }) {
  const [linkedUser, setLinkedUser] = useState(''); const [newUser, setNewUser] = useState(''); const [file, setFile] = useState<File | null>(null); const [period, setPeriod] = useState(''); const [docs, setDocs] = useState<Doc[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    const [link, documents] = await Promise.all([sb.from('cx_portal_links').select('user_id').eq('collaborator_id', collaboratorId).maybeSingle(), sb.from('cx_employee_documents').select('id,kind,period,work_date,original_name,created_at,storage_path').eq('collaborator_id', collaboratorId).order('created_at', { ascending: false })]);
    if (link.error || documents.error) setMessage('Não foi possível consultar o acesso e os documentos.');
    else { setLinkedUser(link.data?.user_id || ''); setDocs((documents.data || []) as Doc[]); }
  }, [sb, collaboratorId]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function linkAccount() {
    if (!newUser || busy) return; setBusy(true); setMessage('');
    const { error } = await sb.from('cx_portal_links').insert({ user_id: newUser.trim(), collaborator_id: collaboratorId });
    if (error) setMessage(`Não foi possível vincular: ${error.message}`); else { setNewUser(''); await refresh(); setMessage('Conta vinculada ao colaborador.'); } setBusy(false);
  }
  async function unlink() {
    if (!linkedUser || busy || !window.confirm('Desvincular esta conta do Portal do Colaborador?')) return;
    setBusy(true); const { error } = await sb.from('cx_portal_links').delete().eq('user_id', linkedUser).eq('collaborator_id', collaboratorId);
    if (error) setMessage(error.message); else { await refresh(); setMessage('Acesso desvinculado.'); } setBusy(false);
  }
  async function uploadPayslip(event: React.FormEvent) {
    event.preventDefault(); if (!file || !period || busy) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) { setMessage('Selecione um PDF de até 10 MB.'); return; }
    setBusy(true); setMessage('');
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) { setMessage('Sessão expirada.'); setBusy(false); return; }
    const path = `holerites/${collaboratorId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)}`;
    const uploaded = await sb.storage.from('cx-employee-private').upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) setMessage(`Não foi possível enviar: ${uploaded.error.message}`);
    else {
      const saved = await sb.from('cx_employee_documents').insert({ collaborator_id: collaboratorId, kind: 'HOLERITE', period: `${period}-01`, original_name: file.name, storage_path: path, uploaded_by: auth.user.id });
      if (saved.error) setMessage('O PDF foi enviado, mas o registro não foi concluído. Não repita o envio; contate o suporte.');
      else { setFile(null); setPeriod(''); await refresh(); setMessage('Holerite disponibilizado no portal.'); }
    }
    setBusy(false);
  }
  async function downloadDocument(doc: Doc) {
    setBusy(true); setMessage('');
    const { data, error } = await sb.storage.from('cx-employee-private').download(doc.storage_path);
    if (error || !data) setMessage('Não foi possível baixar o documento.');
    else { const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = doc.original_name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    setBusy(false);
  }
  async function copyPortalAddress() {
    try {
      await navigator.clipboard.writeText(new URL('/portal', window.location.origin).toString());
      setMessage('Endereço do portal copiado. Envie somente para o colaborador com acesso autorizado.');
    } catch {
      setMessage(`Endereço do portal: ${new URL('/portal', window.location.origin).toString()}`);
    }
  }
  return <section className="cx-portal-management"><h3>Portal do Colaborador</h3>{message && <p role="status">{message}</p>}
    <p><a href="/portal" target="_blank" rel="noopener noreferrer">Abrir portal</a> · <button type="button" onClick={() => void copyPortalAddress()}>Copiar endereço</button></p>
    {linkedUser ? <p>Conta vinculada: <code>{linkedUser}</code> <button type="button" disabled={busy} onClick={() => void unlink()}>Desvincular</button></p> : <div className="cx-portal-link"><label>ID do usuário no Supabase Auth<input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="UUID da conta criada em Authentication → Users" /></label><button type="button" disabled={busy || !newUser} onClick={() => void linkAccount()}>Vincular conta</button></div>}
    <form className="cx-portal-upload" onSubmit={uploadPayslip}><h4>Disponibilizar holerite</h4><label>Competência<input type="month" required value={period} onChange={e => setPeriod(e.target.value)} /></label><label>PDF<input type="file" accept=".pdf,application/pdf" required onChange={e => setFile(e.target.files?.[0] || null)} /></label><button className="cx-primary" disabled={busy || !file || !period}>Enviar holerite</button></form>
    <p>{docs.filter(doc => doc.kind === 'HOLERITE').length} holerites · {docs.filter(doc => doc.kind === 'ATESTADO').length} atestados enviados.</p>
    {docs.length > 0 && <><h4>Documentos no dossiê</h4><ul className="cx-portal-docs">{docs.map(doc => <li key={doc.id}><span>{doc.kind} · {doc.work_date ? new Date(`${doc.work_date}T12:00:00`).toLocaleDateString('pt-BR')+' · ' : ''}{doc.original_name} · enviado em {new Date(doc.created_at).toLocaleDateString('pt-BR')}</span><button type="button" disabled={busy} onClick={() => void downloadDocument(doc)}>Baixar</button></li>)}</ul></>}
  </section>;
}
