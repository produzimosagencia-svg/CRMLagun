import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, Instagram } from 'lucide-react';

type State = 'loading' | 'success' | 'error';

export default function InfluenciadorCallback() {
  const [params] = useSearchParams();
  const code  = params.get('code')  ?? '';
  const state = params.get('state') ?? ''; // invite_token
  const error = params.get('error') ?? '';

  const [pageState, setPageState] = useState<State>('loading');
  const [errorMsg, setErrorMsg]   = useState('');
  const [igUsername, setIgUsername] = useState('');

  useEffect(() => {
    if (error) { setErrorMsg('Autorização negada pelo Instagram.'); setPageState('error'); return; }
    if (!code || !state) { setErrorMsg('Parâmetros inválidos.'); setPageState('error'); return; }

    async function exchange() {
      try {
        const prodOrigin = import.meta.env.VITE_APP_URL ?? 'https://lagunvitoria.com.br';
        const { data, error: fnErr } = await supabase.functions.invoke('influencer-instagram-oauth', {
          body: {
            code,
            invite_token: state,
            redirect_uri: `${prodOrigin}/influenciadores/callback`,
          },
        });

        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) throw new Error(data.error);

        setIgUsername(data?.username ?? '');
        setPageState('success');
      } catch (e: any) {
        setErrorMsg(e.message || 'Erro ao conectar. Tente novamente.');
        setPageState('error');
      }
    }

    exchange();
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.3em] text-amber-400/70 uppercase">Programa de Influenciadores</p>
          <h1 className="text-2xl font-bold text-white mt-1 tracking-wide">LAGUN</h1>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center space-y-5">
          {pageState === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={36} className="text-amber-400 animate-spin" />
              <p className="text-sm text-white/60">Conectando seu Instagram…</p>
              <p className="text-xs text-white/30">Isso pode levar alguns segundos</p>
            </div>
          )}

          {pageState === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 size={36} className="text-green-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                  <Instagram size={14} className="text-white" />
                </div>
              </div>
              <div>
                <p className="text-base font-semibold text-white">Conectado com sucesso!</p>
                {igUsername && (
                  <p className="text-sm text-amber-400 mt-1 font-medium">@{igUsername}</p>
                )}
                <p className="text-sm text-white/50 mt-2">
                  Seu Instagram foi vinculado ao programa de influenciadores da Lagun. Agora monitoramos automaticamente suas menções.
                </p>
              </div>
              <div className="w-full border-t border-white/10 pt-4">
                <p className="text-xs text-white/30">
                  Você pode fechar esta página. A equipe Lagun foi notificada.
                </p>
              </div>
            </div>
          )}

          {pageState === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle size={36} className="text-red-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">Algo deu errado</p>
                <p className="text-sm text-white/50 mt-2">{errorMsg}</p>
              </div>
              <button
                onClick={() => window.history.back()}
                className="text-xs text-amber-400 underline"
              >
                ← Voltar e tentar novamente
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-white/20 mt-6">
          © {new Date().getFullYear()} Lagun — Vitória/ES
        </p>
      </div>
    </div>
  );
}
