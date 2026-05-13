import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logoLagun from '@/assets/logo-lagun-entretenimento.png';
import loginPhoto1 from '@/assets/login-photo-1.jpg';
import loginPhoto2 from '@/assets/login-photo-2.jpg';
import loginPhoto3 from '@/assets/login-photo-3.jpg';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function InternoLogin() {
  const { user, loading, isPartner, signInByUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF0080]" />
      </div>
    );
  }

  if (user && isPartner) {
    return <Navigate to="/interno" replace />;
  }

  if (user && !isPartner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="text-center">
          <img src={logoLagun} alt="Lagun" className="h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Restrito</h2>
          <p className="text-gray-500">Sua conta não possui permissão para acessar o sistema interno.</p>
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
      toast.error(error.message || 'Erro ao fazer login');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left side - branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-start px-16 xl:px-24 relative">
        <img src={logoLagun} alt="Lagun" className="h-10 mb-12" />
        <h1 className="text-4xl xl:text-5xl font-bold text-gray-900 leading-tight mb-6">
          Trabalhar com festa<br />
          sempre será{' '}
          <span className="text-[#FF0080]">divertido.</span>
        </h1>

        {/* Photo collage - inspired by Meta login */}
        <div className="relative mt-8 w-full max-w-md">
          <div className="grid grid-cols-3 gap-3">
            {/* Placeholder photo cards with iPhone-style rounded corners and emojis */}
            <div className="relative">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-lg">
                <img src={loginPhoto1} alt="Lagun" className="w-full h-full object-cover" />
              </div>
              <span className="absolute -top-2 -right-2 text-2xl">🎤</span>
            </div>
            <div className="relative mt-6">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-lg">
                <img src={loginPhoto2} alt="Show ao vivo" className="w-full h-full object-cover" />
              </div>
              <span className="absolute -top-2 -left-2 text-2xl">🔥</span>
            </div>
            <div className="relative">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-lg">
                <img src={loginPhoto3} alt="Palco com fogos" className="w-full h-full object-cover" />
              </div>
              <span className="absolute -bottom-2 -right-2 text-2xl">🎉</span>
            </div>
          </div>
          {/* Extra floating card */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF0080]/30 to-purple-200 shadow-lg flex items-center justify-center">
              <span className="text-3xl">🎶</span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider line */}
      <div className="hidden lg:block w-px bg-gray-200" />

      {/* Right side - login form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16">
        {/* Mobile-only branding */}
        <div className="lg:hidden text-center mb-8">
          <img src={logoLagun} alt="Lagun" className="h-10 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Trabalhar com festa sempre será <span className="text-[#FF0080] font-semibold">divertido.</span></p>
        </div>

        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Entrar</h2>
          <p className="text-gray-500 text-sm mb-8">Sistema interno da Lagun</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-700 text-sm font-medium">
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="h-12 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-[#FF0080]/30 focus-visible:border-[#FF0080]"
                placeholder="Digite seu usuário"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700 text-sm font-medium">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-12 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-[#FF0080]/30 focus-visible:border-[#FF0080]"
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-[#FF0080] hover:bg-[#E0006F] text-white font-semibold rounded-xl text-base transition-all duration-200"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8">
            Lagun ® — Sistema Interno
          </p>
        </div>
      </div>
    </div>
  );
}
