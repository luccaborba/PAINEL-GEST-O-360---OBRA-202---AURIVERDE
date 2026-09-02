// Gestão 360º — bootstrap seguro do primeiro Administrador Mestre.
// Só promove o usuário autenticado quando NÃO existe nenhum master ativo.
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!service) return res.status(500).json({error:'Variáveis administrativas não configuradas'});
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Não autenticado'});
  const token=auth.slice(7);
  const H={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
  try{
    const me=await fetch(`${url}/auth/v1/user`,{headers:{apikey:service,Authorization:`Bearer ${token}`}});
    if(!me.ok) return res.status(401).json({error:'Sessão inválida'});
    const caller=await me.json();
    const masters=await fetch(`${url}/rest/v1/profiles?master=eq.true&ativo=eq.true&select=id&limit=1`,{headers:H});
    const rows=await masters.json();
    if(!masters.ok) return res.status(masters.status).json(rows);
    if(Array.isArray(rows)&&rows.length) return res.status(200).json({ok:true,bootstrapped:false,reason:'master_exists'});
    const patch=await fetch(`${url}/rest/v1/profiles?id=eq.${caller.id}`,{
      method:'PATCH',headers:{...H,Prefer:'return=representation'},
      body:JSON.stringify({master:true,ativo:true,perfil:'Administrador'})
    });
    const data=await patch.json();
    if(!patch.ok) return res.status(patch.status).json(data);
    return res.status(200).json({ok:true,bootstrapped:true,profile:data?.[0]||null});
  }catch(e){return res.status(500).json({error:e.message})}
}
