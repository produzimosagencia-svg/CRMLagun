import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import loginPhoto from '@/assets/DSC_9565.jpg';
import palavraGold from '@/assets/palavra-lagun.png';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function InternoLogin() {
  const { user, loading, isPartner, signInByUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#000' }}>
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#F5D470' }} />
      </div>
    );
  }

  if (user && isPartner) return <Navigate to="/interno" replace />;

  if (user && !isPartner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#000' }}>
        <div className="text-center">
          <img src={palavraGold} alt="Lagun" className="h-8 mx-auto mb-6" />
          <h2 className="text-xl font-bold text-white mb-2">Acesso Restrito</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-sm">Sua conta não possui permissão para acessar o sistema interno.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setSubmitting(true);
    const { error } = await signInByUsername(username.trim(), password);
    if (error) {
      toast.error(error.message || 'Usuário ou senha incorretos');
    } else {
      // Sinaliza login recém-sucedido: o InternoLayout consome este flag uma
      // única vez para exibir a SplashScreen (nunca em refresh/rotas internas).
      sessionStorage.setItem('interno-splash', '1');
    }
    setSubmitting(false);
  };

  const campo = 'h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#FFE14D]/70 focus:bg-white/[0.06]';

  return (
    <div className="flex min-h-screen bg-black p-3 sm:p-4">
      {/* Foto: painel arredondado à esquerda, como um quadro dentro da página */}
      <div className="relative hidden overflow-hidden rounded-[22px] lg:block lg:w-1/2">
        <img src={loginPhoto} alt="Lagun" className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        <a href="/" aria-label="Voltar ao site"
          className="absolute left-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60">
          <ArrowLeft size={17} />
        </a>
        <img src={palavraGold} alt="Lagun" className="absolute bottom-8 left-8 h-7 w-auto" />
      </div>

      {/* Login */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-[380px]">
          <img src={palavraGold} alt="Lagun" className="mb-10 h-7 w-auto lg:hidden" />

          <h1 className="text-[28px] font-bold tracking-tight text-white">Bem-vindo de volta</h1>
          <p className="mt-1.5 text-sm text-white/45">Acesso exclusivo para o time Lagun.</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-[13px] font-medium text-white/80">Usuário</label>
              <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                required autoComplete="username" autoCapitalize="none" placeholder="seu.usuario" className={campo} />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-white/80">Senha</label>
              <div className="relative">
                <input id="password" type={mostrarSenha ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="Sua senha" className={`${campo} pr-11`} />
                <button type="button" onClick={() => setMostrarSenha((v) => !v)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/80">
                  {mostrarSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={submitting}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#FFE14D] text-sm font-bold text-black shadow-[0_0_28px_rgba(255,225,77,.55),0_0_2px_rgba(255,225,77,.9)] transition hover:bg-[#FFEC8A] hover:shadow-[0_0_40px_rgba(255,225,77,.75),0_0_2px_rgba(255,225,77,1)] active:scale-[0.99] disabled:opacity-60">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
            </button>
          </form>

          <div className="mt-10 flex items-center gap-3 text-[11px] text-white/25">
            <span className="h-px flex-1 bg-white/10" />
            Lagun ® Sistema Interno
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
