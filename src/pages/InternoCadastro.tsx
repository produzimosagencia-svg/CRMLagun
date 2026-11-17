import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManifestInterno } from '@/hooks/useManifestInterno';
import { FundoEscultura } from '@/components/interno/FundoEscultura';
import flamingoLagun from '@/assets/flamingo-solo.png';

// Cadastro por convite: o link /interno/cadastro?convite=<token> cria a conta do time
// com o acesso definido no convite. Cada link serve uma vez e expira.
export default function InternoCadastro() {
  const [params] = useSearchParams();
  const token = params.get('convite') ?? '';
  const navigate = useNavigate();
  useManifestInterno();

  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'feito'>('carregando');
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) { setErro('Link de convite incompleto.'); setEstado('erro'); return; }
    supabase.functions.invoke('convite-painel', { body: { acao: 'ver', token } }).then(({ data, error }) => {
      if (error || !data?.ok) {
        const ctx = (error as { context?: Response } | null)?.context;
        if (ctx?.json) ctx.json().then((j: { error?: string }) => setErro(j?.error || 'Convite inválido.')).catch(() => setErro('Convite inválido.'));
        else setErro(data?.error || 'Convite inválido.');
        setEstado('erro');
      } else setEstado('ok');
    });
  }, [token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('convite-painel', {
      body: { acao: 'aceitar', token, nome, usuario, email, senha },
    });
    if (error || !data?.ok) {
      let msg = data?.error || 'Não foi possível criar a conta.';
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx?.json) { try { msg = (await ctx.json())?.error || msg; } catch { /* mantém a mensagem */ } }
      toast.error(msg);
      setEnviando(false);
      return;
    }
    setEstado('feito');
    setEnviando(false);
  };

  const campo = 'h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#FFE14D]/70 focus:bg-white/[0.06]';
  const rotulo = 'mb-2 block text-[13px] font-medium text-white/80';
  const botao = 'mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#FFE14D] text-sm font-bold text-black shadow-[0_0_28px_rgba(255,225,77,.55)] transition hover:bg-[#FFEC8A] active:scale-[0.99] disabled:opacity-60';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10 max-md:min-h-[100dvh]">
      <FundoEscultura className="absolute inset-0" />
      <div className="relative z-10 w-full max-w-[400px] rounded-[28px] border border-[#FFE14D]/25 bg-black/60 px-8 py-10 shadow-[0_0_60px_-18px_rgba(255,225,77,.45)] backdrop-blur-xl max-md:px-6 max-md:py-8">
        <img src={flamingoLagun} alt="" aria-hidden className="mx-auto h-20 w-auto" />

        {estado === 'carregando' && (
          <div className="mt-8 flex justify-center"><Loader2 className="h-7 w-7 animate-spin" style={{ color: '#F5D470' }} /></div>
        )}

        {estado === 'erro' && (
          <>
            <h1 className="mt-5 text-center text-[24px] font-bold tracking-tight text-white">Convite indisponível.</h1>
            <p className="mt-2 text-center text-sm text-white/55">{erro}</p>
          </>
        )}

        {estado === 'feito' && (
          <>
            <h1 className="mt-5 text-center text-[24px] font-bold tracking-tight text-white">Conta criada.</h1>
            <p className="mt-2 text-center text-sm text-white/55">Entre com o usuário <b className="text-white">{usuario}</b> e a senha que você escolheu.</p>
            <button className={`${botao} mt-8`} onClick={() => navigate('/interno/login', { replace: true })}>Ir para o login</button>
          </>
        )}

        {estado === 'ok' && (
          <>
            <h1 className="mt-5 text-center text-[26px] font-bold tracking-tight text-white">Bem-vindo ao time.</h1>
            <p className="mt-1.5 text-center text-sm text-white/45">Crie seu acesso ao sistema da Lagun.</p>
            <form onSubmit={enviar} className="mt-8 space-y-5">
              <div>
                <label htmlFor="nome" className={rotulo}>Nome</label>
                <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" placeholder="Seu nome" className={campo} />
              </div>
              <div>
                <label htmlFor="usuario" className={rotulo}>Usuário (para entrar)</label>
                <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s/g, ''))} required
                  autoCapitalize="none" autoComplete="username" placeholder="seu.usuario" className={campo} />
              </div>
              <div>
                <label htmlFor="email" className={rotulo}>E-mail</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="voce@email.com" className={campo} />
              </div>
              <div>
                <label htmlFor="senha" className={rotulo}>Senha</label>
                <div className="relative">
                  <input id="senha" type={mostrar ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8}
                    autoComplete="new-password" placeholder="Mínimo de 8 caracteres" className={`${campo} pr-11`} />
                  <button type="button" onClick={() => setMostrar((v) => !v)} aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/80">
                    {mostrar ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={enviando} className={botao}>
                {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Criar meu acesso'}
              </button>
            </form>
          </>
        )}

        <div className="mt-9 flex items-center gap-3 text-[11px] text-white/30">
          <span className="h-px flex-1 bg-white/10" />Lagun ® Sistema Interno<span className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    </div>
  );
}
