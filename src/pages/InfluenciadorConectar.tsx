import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Instagram, Loader2, CheckCircle2, XCircle } from 'lucide-react';

type State = 'loading' | 'valid' | 'invalid' | 'already_connected';

export default function InfluenciadorConectar() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading');
  const [influencerName, setInfluencerName] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }

    supabase
      .from('influencers')
      .select('id, full_name, status')
      .eq('invite_token', token)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setState('invalid'); return; }
        setInfluencerName(data.full_name);
        if (data.status === 'connected') { setState('already_connected'); return; }
        setState('valid');
      });
  }, [token]);

  function handleConnect() {
    const appId = import.meta.env.VITE_IG_APP_ID ?? '2161508277968015';
    const prodOrigin = import.meta.env.VITE_APP_URL ?? 'https://lagunvitoria.com.br';
    const redirectUri = encodeURIComponent(`${prodOrigin}/influenciadores/callback`);
    // New Instagram API uses Facebook OAuth dialog (Basic Display API deprecated Dec 2024)
    const scope = encodeURIComponent('instagram_basic,pages_show_list,business_management');
    const stateParam = encodeURIComponent(token);
    window.location.href =
      `https://www.facebook.com/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${stateParam}`;
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.3em] text-amber-400/70 uppercase">Programa de Influenciadores</p>
          <h1 className="text-2xl font-bold text-white mt-1 tracking-wide">LAGUN</h1>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center space-y-6">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-amber-400 animate-spin" />
              <p className="text-sm text-white/60">Verificando convite…</p>
            </div>
          )}

          {state === 'invalid' && (
            <div className="flex flex-col items-center gap-3">
              <XCircle size={40} className="text-red-400" />
              <p className="text-base font-semibold text-white">Link inválido</p>
              <p className="text-sm text-white/50">Este link de convite não existe ou expirou. Solicite um novo link à equipe Lagun.</p>
            </div>
          )}

          {state === 'already_connected' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 size={40} className="text-green-400" />
              <p className="text-base font-semibold text-white">Já conectado!</p>
              <p className="text-sm text-white/50">
                Olá, <span className="text-amber-400">{influencerName}</span>! Seu Instagram já está conectado ao programa Lagun.
              </p>
            </div>
          )}

          {state === 'valid' && (
            <div className="flex flex-col items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Instagram size={26} className="text-white" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">
                  Olá, {influencerName}! 👋
                </p>
                <p className="text-sm text-white/50 mt-1">
                  Conecte seu Instagram para fazer parte do programa de influenciadores da Lagun e acompanhar suas métricas.
                </p>
              </div>

              <ul className="text-left w-full space-y-2 text-xs text-white/60 border border-white/10 rounded-xl p-4">
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">✓</span> Monitoramos suas menções à Lagun automaticamente</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">✓</span> Acompanhamos alcance e engajamento dos seus posts</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">✓</span> Você aparece no ranking de influenciadores</li>
                <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">✓</span> Apenas leitura — nunca postamos por você</li>
              </ul>

              <Button
                onClick={handleConnect}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold gap-2"
              >
                <Instagram size={16} />
                Conectar com Instagram
              </Button>

              <p className="text-[11px] text-white/30">
                Ao conectar, você autoriza a Lagun a ler seus posts públicos e menções. Você pode revogar o acesso a qualquer momento.
              </p>
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
