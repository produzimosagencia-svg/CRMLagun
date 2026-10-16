import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useManifestInterno } from '@/hooks/useManifestInterno';
import { useAppMobile } from '@/hooks/useAppMobile';
import { useSemZoom } from '@/hooks/useSemZoom';
import palavraGold from '@/assets/palavra-lagun.png';
import flamingoLagun from '@/assets/flamingo-solo.png';
import { toast } from 'sonner';
import { FundoDistorcao } from '@/components/interno/FundoDistorcao';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';

// Ruído fino (SVG) para a textura de areia do cartão.
const GRAO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .36 0 0 0 0 .2 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

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

  // Bloco cor de areia: tinta escura, campos claros e detalhes em dourado queimado.
  // O preenchimento automático do navegador mantém o campo claro (por isso o !).
  const campo = 'h-11 w-full rounded-xl border border-[#CBB98F]/70 bg-[#FBF7EE]/80 px-4 text-sm text-[#1C1810] placeholder:text-[#1C1810]/35 outline-none transition focus:border-[#B8892B] focus:bg-[#FFFDF8] focus:shadow-[0_0_0_3px_rgba(184,137,43,.18)] autofill:!shadow-[inset_0_0_0_1000px_#FBF7EE] autofill:![-webkit-text-fill-color:#1C1810] autofill:![caret-color:#1C1810]';

  return (
    <div data-app-login className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10 max-md:min-h-[100dvh]">
      <div data-app-arrastar aria-hidden className="fixed inset-x-0 top-0 z-50 h-10" />

      {/* Fundo: malha dourada que se deforma com o mouse */}
      <FundoDistorcao className="absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,.85)_100%)]" />

      <a data-app-voltar-site href="/" aria-label="Voltar ao site"
        className="absolute left-5 top-5 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur-sm transition hover:text-white">
        <ArrowLeft size={17} />
      </a>

      {/* Cartão de login, no centro */}
      <div className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-[28px] border border-[#F3E6C4]/60 bg-gradient-to-b from-[#F1E7D2] via-[#E9DCC0] to-[#DDCBA6] px-8 py-10 shadow-[0_0_70px_-14px_rgba(255,214,80,.55),0_30px_60px_-30px_rgba(0,0,0,.8),inset_0_1px_0_rgba(255,255,255,.7)] max-md:px-6 max-md:py-8">
        {/* Grão de areia por cima do degradê */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.22] mix-blend-multiply"
          style={{ backgroundImage: GRAO }} />

        <div className="relative">
        <img src={flamingoLagun} alt="" aria-hidden className="mx-auto h-16 w-auto [filter:brightness(.42)_sepia(.6)_saturate(1.6)]" />

        <h1 className="mt-6 text-center text-[26px] font-bold tracking-tight text-[#1C1810]">Bem-vindo de volta</h1>
        <p className="mt-1.5 text-center text-sm text-[#1C1810]/55">Acesso exclusivo para o time Lagun.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="username" className="mb-2 block text-[13px] font-semibold text-[#3A3222]">Usuário</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              required autoComplete="username" autoCapitalize="none" placeholder="seu.usuario" className={campo} />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-[13px] font-semibold text-[#3A3222]">Senha</label>
            <div className="relative">
              <input id="password" type={mostrarSenha ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password" placeholder="Sua senha" className={`${campo} pr-11`} />
              <button type="button" onClick={() => setMostrarSenha((v) => !v)} aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1C1810]/40 transition hover:text-[#1C1810]/80">
                {mostrarSenha ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#14110C] text-sm font-bold text-[#FFE14D] shadow-[0_8px_20px_-8px_rgba(20,17,12,.7),inset_0_1px_0_rgba(255,225,77,.18)] transition hover:bg-black hover:text-[#FFEC8A] active:scale-[0.99] disabled:opacity-60">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
          </button>
        </form>

        <div className="mt-9 flex items-center gap-3 text-[11px] text-[#1C1810]/40">
          <span className="h-px flex-1 bg-[#1C1810]/15" />
          Lagun ® Sistema Interno
          <span className="h-px flex-1 bg-[#1C1810]/15" />
        </div>
        </div>
      </div>
    </div>
  );
}
