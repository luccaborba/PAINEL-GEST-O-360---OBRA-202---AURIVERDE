import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors}); if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'').trim(); if(!token)return reply(401,{error:'Faça login como administrador.'});
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if(!url||!anon||!service)return reply(500,{error:'Configuração do servidor incompleta.'});
 const caller=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}}); const {data:identity}=await caller.auth.getUser(token); if(!identity.user)return reply(401,{error:'Sessão inválida.'});
 const {data:isAdmin}=await caller.rpc('cx_is_admin'); if(isAdmin!==true)return reply(403,{error:'Somente administrador pode gerenciar usuários.'});
 let p:any;try{p=await req.json()}catch{return reply(400,{error:'Dados inválidos.'})} const userId=String(p.user_id||''); if(!userId)return reply(400,{error:'Usuário inválido.'}); if(userId===identity.user.id&&(p.action==='kick'||p.action==='delete'))return reply(400,{error:'Você não pode derrubar ou excluir sua própria conta.'});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 if(p.action==='update'){
  const name=String(p.name||'').trim().slice(0,160),email=String(p.email||'').trim().toLowerCase(); if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{error:'Informe nome e e-mail válidos.'});
  const {error}=await admin.auth.admin.updateUserById(userId,{email,user_metadata:{name}}); if(error)return reply(400,{error:error.message}); const {error:pe}=await admin.from('cx_profiles').update({name,email}).eq('user_id',userId); if(pe)return reply(500,{error:'Auth atualizado, mas o perfil não foi sincronizado.'}); return reply(200,{message:'Usuário atualizado com sucesso.'});
 }
 if(p.action==='kick'){
  const {data:revoked,error:revokeError}=await admin.rpc('cx_admin_revoke_user_sessions',{target_user_id:userId}); if(revokeError)return reply(500,{error:'Não foi possível encerrar as sessões do usuário.'}); return reply(200,{message:`Usuário derrubado. Sessões encerradas: ${revoked??0}.`});
 }
 if(p.action==='delete'){
  await admin.rpc('cx_admin_revoke_user_sessions',{target_user_id:userId});
  const {error}=await admin.auth.admin.deleteUser(userId,false); if(error)return reply(400,{error:error.message}); return reply(200,{message:'Usuário excluído definitivamente.'});
 }
 return reply(400,{error:'Ação inválida.'});
});
