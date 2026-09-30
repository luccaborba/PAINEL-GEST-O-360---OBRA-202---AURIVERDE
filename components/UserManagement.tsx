'use client';
import {useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
export type ManagedProfile={user_id:string;name:string;email:string|null;system_admin:boolean};
type Action='edit'|'reset'|'kick'|'delete'|null;
export default function UserManagement({sb,profiles,onRefresh,onSelectPermissions}:{sb:SupabaseClient;profiles:ManagedProfile[];onRefresh:()=>Promise<void>;onSelectPermissions:(id:string)=>void}){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [selected,setSelected]=useState<ManagedProfile|null>(null),[action,setAction]=useState<Action>(null),[editName,setEditName]=useState(''),[editEmail,setEditEmail]=useState('');
 async function invite(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setMessage('');
  const {data,error}=await sb.functions.invoke('cx-invite-user',{body:{name:name.trim(),email:email.trim()}});
  if(error||data?.error)setMessage(data?.error||error?.message||'Não foi possível convidar.');else{setName('');setEmail('');setMessage(`Convite enviado para ${data.email}. Configure a obra e as permissões para liberar o acesso.`);await onRefresh();}setBusy(false);
 }
 function openEdit(p:ManagedProfile){setSelected(p);setEditName(p.name);setEditEmail(p.email||'');setAction('edit');}
 function openAction(p:ManagedProfile,a:'reset'|'kick'|'delete'){setSelected(p);setAction(a);}
 function close(){if(!busy){setAction(null);setSelected(null)}}
 async function resetPassword(){
  if(!selected?.email||busy)return;setBusy(true);setMessage('');
  const {data,error}=await sb.functions.invoke('cx-reset-password',{body:{email:selected.email}});
  if(error||data?.error){setMessage(data?.error||error?.message||'Não foi possível enviar o link para redefinir a senha.');}
  else{setMessage('Link para criar uma nova senha enviado com sucesso.');setAction(null);setSelected(null);}
  setBusy(false);
 }
 async function manage(kind:'update'|'kick'|'delete'){
  if(!selected||busy)return;setBusy(true);setMessage('');
  const body:any={action:kind,user_id:selected.user_id}; if(kind==='update'){body.name=editName.trim();body.email=editEmail.trim();}
  const {data,error}=await sb.functions.invoke('cx-manage-user',{body});
  if(error||data?.error){
   const detail=data?.error||error?.message||'Não foi possível concluir a operação.';
   setMessage(detail.includes('Somente administrador')?'Sua sessão atual não é de administrador. Entre novamente com a conta ADMIN para gerenciar usuários.':detail);
   setAction(null);setSelected(null);
  } else{setMessage(kind==='kick'?'Usuário desconectado com sucesso.':(data?.message||'Operação concluída.'));setAction(null);setSelected(null);await onRefresh();}
  setBusy(false);
 }
 return <section className="cx-admin-users"><div className="heading"><div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Usuários</h1><p>Convide, edite e controle os acessos diretamente pelo painel.</p></div></div>
 <div className="panel"><h2>Convidar usuário</h2><form className="cx-admin-invite" onSubmit={e=>void invite(e)}><label>Nome<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value.toUpperCase())} placeholder="NOME COMPLETO"/></label><label>E-mail<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@empresa.com.br"/></label><button type="submit" disabled={busy}>{busy?'Enviando…':'Enviar convite'}</button></form>{message&&<p role="status" className="notice">{message}</p>}<p className="cx-admin-help">O convite não libera obras automaticamente. As permissões continuam sendo definidas em CONFIGURAR ACESSO.</p></div>
 <div className="panel"><h2>Usuários cadastrados · {profiles.length}</h2><div className="matrix-scroll"><table className="cx-admin-table"><thead><tr><th>NOME</th><th>E-MAIL</th><th>PERFIL</th><th>AÇÕES</th></tr></thead><tbody>{profiles.map(p=><tr key={p.user_id}><td>{p.name}</td><td>{p.email||'—'}</td><td>{p.system_admin?'Administrador':'Usuário'}</td><td><div className="cx-user-actions"><button type="button" onClick={()=>onSelectPermissions(p.user_id)}>ACESSO</button><button type="button" onClick={()=>openEdit(p)}>EDITAR</button><button type="button" onClick={()=>openAction(p,'reset')}>REDEFINIR SENHA</button><button type="button" className="warn" onClick={()=>openAction(p,'kick')}>LOGOUT</button><button type="button" className="danger" onClick={()=>openAction(p,'delete')}>EXCLUIR</button></div></td></tr>)}</tbody></table></div></div>
 {action&&selected&&<div className="cx-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="cx-user-modal" role="dialog" aria-modal="true">
  {action==='edit'?<><h2>Editar usuário</h2><p>{selected.email}</p><label>Nome<input value={editName} onChange={e=>setEditName(e.target.value.toUpperCase())}/></label><label>E-mail<input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)}/></label><div className="cx-modal-actions"><button onClick={close} disabled={busy}>CANCELAR</button><button className="primary" onClick={()=>void manage('update')} disabled={busy}>{busy?'SALVANDO…':'SALVAR ALTERAÇÕES'}</button></div></>:
  action==='reset'?<><h2>Redefinir senha</h2><p>Enviar para <strong>{selected.email}</strong> um link seguro para criar uma nova senha?</p><div className="cx-modal-actions"><button onClick={close} disabled={busy}>CANCELAR</button><button className="primary" onClick={()=>void resetPassword()} disabled={busy||!selected.email}>{busy?'ENVIANDO…':'ENVIAR LINK'}</button></div></>:
  action==='kick'?<><h2>Log out do usuário</h2><p>Encerrar agora todas as sessões ativas de <strong>{selected.name}</strong>? O usuário será desconectado de todos os dispositivos, mas poderá entrar novamente normalmente.</p><div className="cx-modal-actions"><button onClick={close} disabled={busy}>CANCELAR</button><button className="warn" onClick={()=>void manage('kick')} disabled={busy}>{busy?'SAINDO…':'LOGOUT'}</button></div></>:
  <><h2>Excluir usuário</h2><p>Excluir definitivamente <strong>{selected.name}</strong> ({selected.email})? Esta ação remove a conta de autenticação e os acessos vinculados e não deve ser usada apenas para encerrar uma sessão.</p><div className="cx-modal-actions"><button onClick={close} disabled={busy}>CANCELAR</button><button className="danger" onClick={()=>void manage('delete')} disabled={busy}>{busy?'EXCLUINDO…':'EXCLUIR DEFINITIVAMENTE'}</button></div></>}
 </div></div>}
 </section>;
}
