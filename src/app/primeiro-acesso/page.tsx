'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getSupabase } from '@/lib/supabase';

export default function PrimeiroAcesso() {
  const sb = getSupabase();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!sb) { setMessage('Configuração de autenticação indisponível.'); return; }
    let live = true;
    const check = async () => {
      const { data } = await sb.auth.getSession();
      if (!live) return;
      setReady(Boolean(data.session));
      if (!data.session) setMessage('Convite inválido ou expirado. Solicite um novo convite ao administrador.');
    };
    void check();
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      setReady(Boolean(session));
      if (session) setMessage('');
    });
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, [sb]);

  const requirements = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const valid = Object.values(requirements).every(Boolean) && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!sb || !ready || !valid || busy) return;
    setBusy(true); setMessage('');
    const { error } = await sb.auth.updateUser({ password });
    if (error) { setMessage(`Não foi possível criar sua senha: ${error.message}`); setBusy(false); return; }
    setMessage('Senha criada com sucesso. Entrando no Constru-X…');
    setTimeout(() => router.replace('/'), 700);
  }

  return <main className="cx-first-access-page">
    <section className="cx-first-access-card">
      <header><Image src="/constru-x-logo.png" alt="Constru-X" width={260} height={87} priority /><span>GESTÃO EMPRESARIAL 360°</span></header>
      <div className="cx-first-access-stripe" />
      <form onSubmit={submit}>
        <span className="eyebrow">PRIMEIRO ACESSO</span>
        <h1>Crie sua senha</h1>
        <p>Seu convite foi validado. Defina agora a senha que será usada para entrar no Constru-X.</p>
        {message && <div className="notice" role="status">{message}</div>}
        <label>Nova senha<div className="cx-password-field"><input disabled={!ready || busy} type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Digite sua nova senha" /><button type="button" onClick={() => setShow(v => !v)}>{show ? 'OCULTAR' : 'MOSTRAR'}</button></div></label>
        <label>Confirmar nova senha<input disabled={!ready || busy} type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repita a nova senha" /></label>
        <div className="cx-password-rules">
          <span className={requirements.length ? 'ok' : ''}>✓ 8 caracteres</span><span className={requirements.upper ? 'ok' : ''}>✓ Letra maiúscula</span><span className={requirements.lower ? 'ok' : ''}>✓ Letra minúscula</span><span className={requirements.number ? 'ok' : ''}>✓ Número</span><span className={requirements.special ? 'ok' : ''}>✓ Caractere especial</span><span className={confirm && password === confirm ? 'ok' : ''}>✓ Senhas iguais</span>
        </div>
        <button className="cx-first-access-submit" disabled={!ready || !valid || busy}>{busy ? 'SALVANDO…' : 'SALVAR E ENTRAR'}</button>
      </form>
      <footer>Ambiente corporativo • Acesso restrito</footer>
    </section>
  </main>;
}
