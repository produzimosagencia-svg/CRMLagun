import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import logoTriade from '@/assets/logo-triade.png';
import { toast } from 'sonner';

export default function CrmLogin() {
  const { user, loading, isPartner, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-purple-950">
        <div className="text-white text-lg">Carregando...</div>
      </div>
    );
  }

  if (user && isPartner) {
    return <Navigate to="/crm" replace />;
  }

  if (user && !isPartner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-purple-950 p-4">
        <Card className="w-full max-w-md border-purple-300/20 bg-white/10 backdrop-blur-xl text-white">
          <CardHeader className="text-center">
            <img src={logoTriade} alt="Tríade" className="h-12 mx-auto mb-4 brightness-0 invert" />
            <CardTitle className="text-xl">Acesso Restrito</CardTitle>
            <CardDescription className="text-purple-200">
              Sua conta não possui permissão de sócio para acessar o CRM.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-purple-950 p-4">
      <Card className="w-full max-w-md border-purple-300/20 bg-white/10 backdrop-blur-xl text-white">
        <CardHeader className="text-center">
          <img src={logoTriade} alt="Tríade" className="h-12 mx-auto mb-4 brightness-0 invert" />
          <CardTitle className="text-2xl font-bold">CRM Tríade</CardTitle>
          <CardDescription className="text-purple-200">
            Acesso exclusivo para sócios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-purple-100">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white/10 border-purple-300/30 text-white placeholder:text-purple-300/50"
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-purple-100">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/10 border-purple-300/30 text-white placeholder:text-purple-300/50"
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold"
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
