import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import loginPhoto from '@/assets/DSC_9565.jpg';
import palavraGold from '@/assets/palavra-lagun.png';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function InternoLogin() {
  const { user, loading, isPartner, signInByUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f0a05' }}>
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#F5D470' }} />
      </div>
    );
  }

  if (user && isPartner) return <Navigate to="/interno" replace />;

  if (user && !isPartner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#0f0a05' }}>
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
    if (error) toast.error(error.message || 'Usuário ou senha incorretos');
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0f0a05' }}>

      {/* ── LEFT: full photo ── */}
      <div className="hidden lg:block lg:w-[55%] xl:w-[60%] relative overflow-hidden">
        <img
          src={loginPhoto}
          alt="Lagun"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* gradient overlay bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, transparent 60%, #0f0a05 100%), linear-gradient(to top, rgba(15,10,5,0.5) 0%, transparent 40%)',
          }}
        />
        {/* logo + tagline bottom-left */}
        <div className="absolute bottom-10 left-10">
          <img src={palavraGold} alt="Lagun" className="h-7 w-auto mb-3" />
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: 'rgba(245,212,112,0.6)' }}>
            Sistema Interno
          </p>
        </div>
      </div>

      {/* ── RIGHT: login form ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-14 xl:px-20">

        {/* Mobile logo */}
        <div className="lg:hidden mb-10 text-center">
          <img src={palavraGold} alt="Lagun" className="h-7 mx-auto" />
        </div>

        <div className="w-full max-w-[340px]">
          <h2 className="text-2xl font-bold text-white mb-1">Entrar</h2>
          <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Acesso exclusivo para o time Lagun
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Usuário */}
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Digite seu usuário"
                className="h-12 rounded-xl border text-white placeholder:text-gray-600 focus-visible:ring-0 focus-visible:border-[#F5D470]"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-12 rounded-xl border text-white placeholder:text-gray-600 focus-visible:ring-0 focus-visible:border-[#F5D470]"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center mt-2"
              style={{
                background: 'linear-gradient(135deg, #F5D470 0%, #e8b830 50%, #F5D470 100%)',
                color: '#1A0800',
                boxShadow: '0 0 24px rgba(245,212,112,0.4), 0 4px 14px rgba(245,212,112,0.2)',
                border: '1px solid rgba(255,235,130,0.5)',
              }}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#1A0800' }} /> : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-[11px] mt-10" style={{ color: 'rgba(255,255,255,0.18)' }}>
            Lagun ® — Sistema Interno
          </p>
        </div>
      </div>
    </div>
  );
}
