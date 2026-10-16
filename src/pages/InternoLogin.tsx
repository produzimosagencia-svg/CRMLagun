import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useManifestInterno } from '@/hooks/useManifestInterno';
import { useAppMobile } from '@/hooks/useAppMobile';
import { useSemZoom } from '@/hooks/useSemZoom';
import palavraGold from '@/assets/palavra-lagun.png';
import flamingoLagun from '@/assets/flamingo-solo.png';
import { toast } from 'sonner';
import { FundoEscultura } from '@/components/interno/FundoEscultura';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function InternoLogin() {
  const { user, loading, isPartner, signInByUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  useManifestInterno();
  useSemZoom(useAppMobile());

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

  const campo = 'h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#FFE14D]/70 focus:bg-white/[0.06]';

  return (
    <div data-app-login className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10 max-md:min-h-[100dvh]">
      <div data-app-arrastar aria-hidden className="fixed inset-x-0 top-0 z-50 h-10" />

      {/* Fundo: escultura dourada de fitas e areia que se deforma com o mouse */}
      <FundoEscultura className="absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,.7)_100%)]" />

      <a data-app-voltar-site href="/" aria-label="Voltar ao site"
        className="absolute left-5 top-5 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur-sm transition hover:text-white">
        <ArrowLeft size={17} />
      </a>

      {/* Cartão de login, no centro */}
      <div className="relative z-10 w-full max-w-[400px] rounded-[28px] border border-[#FFE14D]/25 bg-black/60 px-8 py-10 shadow-[0_0_60px_-18px_rgba(255,225,77,.45),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-xl max-md:px-6 max-md:py-8">
        <img src={flamingoLagun} alt="" aria-hidden className="login-flamingo mx-auto h-16 w-auto" />

        <h1 className="mt-6 text-center text-[26px] font-bold tracking-tight text-white">Bem-vindo de volta</h1>
        <p className="mt-1.5 text-center text-sm text-white/45">Acesso exclusivo para o time Lagun.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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

        <div className="mt-9 flex items-center gap-3 text-[11px] text-white/30">
          <span className="h-px flex-1 bg-white/10" />
          Lagun ® Sistema Interno
          <span className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    </div>
  );
}
