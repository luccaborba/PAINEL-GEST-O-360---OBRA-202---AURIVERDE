import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (status: number, data: Record<string, unknown>) => new Response(JSON.stringify(data), { status, headers: cors });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Método não permitido.' });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return reply(401, { error: 'Faça login como administrador.' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return reply(500, { error: 'Configuração do servidor incompleta.' });
  const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: identity, error: identityError } = await caller.auth.getUser(token);
  if (identityError || !identity.user) return reply(401, { error: 'Sessão inválida.' });
  const { data: admin, error: adminError } = await caller.rpc('cx_is_admin');
  if (adminError || admin !== true) return reply(403, { error: 'Somente o administrador pode convidar usuários.' });
  let payload: {name?:unknown;email?:unknown};
  try { payload = await req.json(); } catch { return reply(400, { error: 'Dados inválidos.' }); }
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 160) : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, { error: 'Informe nome e e-mail válidos.' });
  const privileged = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  // O convite não confere associação nem permissão a qualquer obra.
  const { data: invited, error: inviteError } = await privileged.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited.user) return reply(400, { error: inviteError?.message || 'O convite não foi enviado.' });
  const { error: profileError } = await privileged.from('cx_profiles').upsert({ user_id: invited.user.id, name, email }, { onConflict: 'user_id' });
  if (profileError) return reply(500, { error: 'Convite enviado, mas o cadastro não foi concluído. Não reenvie o convite; procure o administrador do banco.', user_id: invited.user.id });
  return reply(200, { user_id: invited.user.id, email, message: 'Convite enviado. Libere as obras e permissões na aba Permissões.' });
});
