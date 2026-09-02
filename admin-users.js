// Gestão 360º — Administração segura de usuários Supabase Auth.
// Vercel env: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (somente backend).
export default async function handler(req,res){
  if(!['GET','POST','PATCH','DELETE'].includes(req.method)) return res.status(405).json({error:'Método não permitido'});
  const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!service) return res.status(500).json({error:'Variáveis administrativas não configuradas'});
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Não autenticado'});
  const token=auth.slice(7);
  const me=await fetch(`${url}/auth/v1/user`,{headers:{apikey:service,Authorization:`Bearer ${token}`}});
  if(!me.ok) return res.status(401).json({error:'Sessão inválida'});
  const caller=await me.json();
  const H={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
  try{
    const prof=await fetch(`${url}/rest/v1/profiles?id=eq.${caller.id}&select=*`,{headers:H});
    const prows=await prof.json();
    const cp=prows?.[0]||{};
    const isMaster=cp.master===true || cp.is_super_admin===true;
    if(!cp.ativo||!isMaster) return res.status(403).json({error:'Somente Administrador Mestre pode gerenciar usuários'});

    if(req.method==='GET'){
      const r=await fetch(`${url}/rest/v1/profiles?select=*&order=nome.asc`,{headers:H}); const data=await r.json();
      return res.status(r.ok?200:r.status).json(r.ok?{ok:true,profiles:data}:data);
    }
    if(req.method==='POST'){
      const {email,nome,obra_id,perfil='USUARIO',redirectTo}=req.body||{};
      if(!email||!nome) return res.status(400).json({error:'Nome e e-mail são obrigatórios'});
      const invite=await fetch(`${url}/auth/v1/invite`,{method:'POST',headers:H,body:JSON.stringify({email,data:{nome},redirect_to:redirectTo})});
      const data=await invite.json(); if(!invite.ok) return res.status(invite.status).json(data);
      const body={nome,email,ativo:true};
      if(perfil!==undefined)body.perfil=perfil;
      if(obra_id!==undefined)body.obra_id=obra_id||null;
      body.master=false;
      const patch=await fetch(`${url}/rest/v1/profiles?id=eq.${data.id}`,{method:'PATCH',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify(body)});
      if(!patch.ok){const e=await patch.json().catch(()=>({}));return res.status(patch.status).json(e)}
      return res.status(200).json({ok:true,user_id:data.id});
    }
    if(req.method==='PATCH'){
      const b=req.body||{};
      if(b.action==='duplicate_access'){
        const {source_user_id,target_user_id,copy_profile=true,copy_obra=true,copy_permissions=true,replace_permissions=true}=b;
        if(!source_user_id||!target_user_id) return res.status(400).json({error:'Usuário origem e destino são obrigatórios'});
        if(source_user_id===target_user_id) return res.status(400).json({error:'Origem e destino devem ser usuários diferentes'});
        const sr=await fetch(`${url}/rest/v1/profiles?id=eq.${source_user_id}&select=*`,{headers:H});
        const tr=await fetch(`${url}/rest/v1/profiles?id=eq.${target_user_id}&select=*`,{headers:H});
        const source=(await sr.json())?.[0], target=(await tr.json())?.[0];
        if(!source||!target) return res.status(404).json({error:'Usuário origem ou destino não encontrado'});
        if(target.master===true||target.is_super_admin===true) return res.status(400).json({error:'Não é permitido sobrescrever o Administrador Mestre'});
        const patchBody={};
        if(copy_profile && source.perfil!==undefined) patchBody.perfil=source.perfil;
        if(copy_obra && source.obra_id!==undefined) patchBody.obra_id=source.obra_id||null;
        if(Object.keys(patchBody).length){
          const pr=await fetch(`${url}/rest/v1/profiles?id=eq.${target_user_id}`,{method:'PATCH',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify(patchBody)});
          if(!pr.ok) return res.status(pr.status).json(await pr.json().catch(()=>({error:'Falha ao copiar perfil/obra'})));
        }
        let copied=0;
        if(copy_permissions){
          const qr=await fetch(`${url}/rest/v1/usuario_permissoes?usuario_id=eq.${source_user_id}&select=*`,{headers:H});
          if(!qr.ok) return res.status(qr.status).json(await qr.json().catch(()=>({error:'Falha ao ler permissões de origem'})));
          const rows=await qr.json();
          if(replace_permissions){
            const dr=await fetch(`${url}/rest/v1/usuario_permissoes?usuario_id=eq.${target_user_id}`,{method:'DELETE',headers:H});
            if(!dr.ok) return res.status(dr.status).json(await dr.json().catch(()=>({error:'Falha ao limpar permissões do destino'})));
          }
          if(rows.length){
            const payload=rows.map(({id,usuario_id,created_at,updated_at,...rest})=>({...rest,usuario_id:target_user_id}));
            const ir=await fetch(`${url}/rest/v1/usuario_permissoes?on_conflict=usuario_id,obra_id,modulo`,{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
            if(!ir.ok) return res.status(ir.status).json(await ir.json().catch(()=>({error:'Falha ao copiar permissões'})));
            copied=payload.length;
          }
        }
        return res.status(200).json({ok:true,copied_permissions:copied});
      }
      const {user_id,ativo,nome,perfil,obra_id}=b; if(!user_id)return res.status(400).json({error:'user_id obrigatório'});
      if(user_id===caller.id && ativo===false)return res.status(400).json({error:'Você não pode inativar seu próprio usuário administrador'});
      const body={}; if(typeof ativo==='boolean')body.ativo=ativo;if(nome!==undefined)body.nome=nome;if(perfil!==undefined)body.perfil=perfil;if(obra_id!==undefined)body.obra_id=obra_id||null;
      const r=await fetch(`${url}/rest/v1/profiles?id=eq.${user_id}`,{method:'PATCH',headers:{...H,Prefer:'return=representation'},body:JSON.stringify(body)}); const data=await r.json();
      return res.status(r.ok?200:r.status).json(r.ok?{ok:true,profile:data?.[0]}:data);
    }
    const {user_id}=req.body||{}; if(!user_id)return res.status(400).json({error:'user_id obrigatório'});
    if(user_id===caller.id)return res.status(400).json({error:'Você não pode excluir o usuário com o qual está logado'});
    const r=await fetch(`${url}/auth/v1/admin/users/${user_id}`,{method:'DELETE',headers:H}); const data=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(r.status).json(data);
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:e.message})}
}
