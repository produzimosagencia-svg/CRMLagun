import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { callWhatsappApi } from '@/lib/whatsappApi';
import metaLogo from '@/assets/meta-icon.png';

/**
 * Etapa logo depois do login, sobre o mesmo fundo de areia: o cartão sai e
 * entram quatro ícones no padrão de app da Apple (Zig, Meta, Instagram e
 * WhatsApp). Cada um mostra o resultado REAL da conexão: acende com ✓ quando
 * a integração responde, ou fica apagado com ! quando falha. Nunca mostra
 * sucesso sem resposta. No fim chama onFim e o sistema abre.
 */

type Estado = 'checando' | 'ok' | 'falhou';
type Resultado = { ok: boolean; motivo?: string };

const EASE = [0.16, 1, 0.3, 1] as const;
const LIMITE_MS = 7000;

// Contorno "squircle" do iOS (superelipse), em coordenadas 0..1 para o clipPath.
const SQUIRCLE = (() => {
  const n = 5;
  const pts: string[] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = 0.5 + 0.5 * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = 0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** (2 / n);
    pts.push(`${x.toFixed(4)} ${y.toFixed(4)}`);
  }
  return `M${pts.join('L')}Z`;
})();

async function chamarFuncao(nome: string, params: Record<string, string>) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada');
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nome}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(LIMITE_MS),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`);
  return j;
}

const CHECAGENS: Record<string, () => Promise<Resultado>> = {
  // Zig: a sincronização roda a cada 10 min e grava o resultado por evento.
  zig: async () => {
    const { data, error } = await (supabase as any).from('lagun_event_zig')
      .select('last_sync_at, last_sync_error').not('last_sync_at', 'is', null)
      .order('last_sync_at', { ascending: false }).limit(1);
    if (error) throw error;
    const ultima = data?.[0];
    if (!ultima) return { ok: false, motivo: 'Sem evento ligado' };
    if (ultima.last_sync_error) return { ok: false, motivo: 'Última leitura falhou' };
    return { ok: true };
  },
  meta: async () => {
    const j = await chamarFuncao('meta-ads-api', { action: 'accounts' });
    return Array.isArray(j?.data) && j.data.length ? { ok: true } : { ok: false, motivo: 'Sem conta de anúncio' };
  },
  instagram: async () => {
    const j = await chamarFuncao('instagram-api', { action: 'accounts' });
    const conta = (j?.data || []).some((p: any) => p?.instagram_business_account);
    return conta ? { ok: true } : { ok: false, motivo: 'Conta não vinculada' };
  },
  whatsapp: async () => {
    const j = await callWhatsappApi<any>('phone_numbers', undefined, LIMITE_MS);
    if (j?.error) throw new Error(j.error?.message || 'Falhou');
    return Array.isArray(j?.data) && j.data.length ? { ok: true } : { ok: false, motivo: 'Sem número ativo' };
  },
};

// ── Artes dos ícones (viewBox 100×100, recortadas pelo squircle) ────────────
const ARTES: Record<string, { nome: string; arte: ReactNode }> = {
  // Provisório até chegar o ícone oficial da Zig.
  zig: {
    nome: 'Zig Tickets',
    arte: (
      <>
        <defs>
          <linearGradient id="cx-zig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2B2B33" /><stop offset="1" stopColor="#0B0B0F" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#cx-zig)" />
        <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill="#fff"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif" letterSpacing="-1">zig</text>
      </>
    ),
  },
  meta: {
    nome: 'Meta',
    arte: (
      <>
        <defs>
          <linearGradient id="cx-meta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#EEF1F6" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#cx-meta)" />
        <image href={metaLogo} x="18" y="18" width="64" height="64" />
      </>
    ),
  },
  instagram: {
    nome: 'Instagram',
    arte: (
      <>
        <defs>
          <radialGradient id="cx-ig" cx="0.28" cy="1.05" r="1.25">
            <stop offset="0" stopColor="#FED576" /><stop offset="0.26" stopColor="#F47133" />
            <stop offset="0.61" stopColor="#BC3081" /><stop offset="1" stopColor="#4C63D2" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#cx-ig)" />
        <rect x="23" y="23" width="54" height="54" rx="16" fill="none" stroke="#fff" strokeWidth="6" />
        <circle cx="50" cy="50" r="12.5" fill="none" stroke="#fff" strokeWidth="6" />
        <circle cx="65.5" cy="34.5" r="3.8" fill="#fff" />
      </>
    ),
  },
  whatsapp: {
    nome: 'WhatsApp',
    arte: (
      <>
        <defs>
          <linearGradient id="cx-wa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5FFC7B" /><stop offset="1" stopColor="#28D146" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#cx-wa)" />
        <path d="M50 23a26 26 0 0 0-22.6 38.9L24 76l14.6-3.6A26 26 0 1 0 50 23z"
          fill="none" stroke="#fff" strokeWidth="5.5" strokeLinejoin="round" />
        <path transform="translate(37 36) scale(1.1)" fill="#fff"
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </>
    ),
  },
};

const ORDEM = ['zig', 'meta', 'instagram', 'whatsapp'] as const;

function IconeApp({ chave, estado, motivo, indice, reduzido }: {
  chave: string; estado: Estado; motivo?: string; indice: number; reduzido: boolean;
}) {
  const { nome, arte } = ARTES[chave];
  const apagado = estado !== 'ok';
  return (
    <motion.div
      className="flex w-[76px] flex-col items-center max-sm:w-[64px]"
      initial={reduzido ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.35 + indice * 0.09, ease: EASE }}
    >
      <motion.div
        className="relative h-[76px] w-[76px] max-sm:h-[64px] max-sm:w-[64px]"
        style={{ filter: 'drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 2px 4px rgba(0,0,0,.35))' }}
        animate={estado === 'ok' && !reduzido ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full" style={{ clipPath: 'url(#cx-squircle)' }} aria-hidden>
          <g style={{ filter: apagado ? 'saturate(.35) brightness(.7)' : 'none', transition: 'filter .5s ease' }}>{arte}</g>
          {/* Brilho sutil de cima, como nos ícones do iOS */}
          <rect width="100" height="100" fill="url(#cx-brilho)" />
          {/* Instalando: véu escuro com o anel girando, igual ao download da App Store */}
          <rect width="100" height="100" fill="#000" style={{ opacity: estado === 'checando' ? 0.42 : 0, transition: 'opacity .5s ease' }} />
        </svg>

        {estado === 'checando' && (
          <svg viewBox="0 0 40 40" className="absolute inset-0 m-auto h-8 w-8 animate-spin" style={{ animationDuration: '0.9s' }} aria-hidden>
            <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3.5" />
            <circle cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray="28 100" />
          </svg>
        )}

        {estado !== 'checando' && (
          <motion.span
            className="absolute -right-1.5 -top-1.5 grid h-[22px] w-[22px] place-items-center rounded-full text-[12px] font-bold leading-none text-white"
            style={{ background: estado === 'ok' ? '#34C759' : '#FF3B30', boxShadow: '0 0 0 2px #0b0b0b, 0 2px 6px rgba(0,0,0,.5)' }}
            initial={reduzido ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          >
            {estado === 'ok' ? (
              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : '!'}
          </motion.span>
        )}
      </motion.div>

      <span className="mt-2.5 w-full truncate text-center text-[12px] font-medium text-white/90"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif", textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
        {nome}
      </span>
      <span className={`mt-0.5 w-full truncate text-center text-[10.5px] ${estado === 'falhou' ? 'text-[#FF8A80]' : 'text-white/45'}`}>
        {estado === 'checando' ? 'Conectando' : estado === 'ok' ? 'Conectado' : motivo || 'Falhou'}
      </span>
    </motion.div>
  );
}

export function ConexoesLogin({ onFim }: { onFim: () => void }) {
  const reduzido = !!useReducedMotion();
  const [estados, setEstados] = useState<Record<string, { estado: Estado; motivo?: string }>>(
    () => Object.fromEntries(ORDEM.map((k) => [k, { estado: 'checando' as Estado }])),
  );
  const [saindo, setSaindo] = useState(false);
  const fimRef = useRef(onFim);
  fimRef.current = onFim;

  useEffect(() => {
    let vivo = true;
    const inicio = Date.now();
    const timers: number[] = [];
    let falhas = 0;

    const tarefas = ORDEM.map((k, i) => {
      const limite = new Promise<Resultado>((res) =>
        timers.push(window.setTimeout(() => res({ ok: false, motivo: 'Sem resposta' }), LIMITE_MS + 500)));
      return Promise.race([CHECAGENS[k]().catch(() => ({ ok: false, motivo: 'Falhou' })), limite])
        .then(async (r) => {
          // Não mostra o resultado antes do ícone terminar de entrar.
          const espera = 900 + i * 160 - (Date.now() - inicio);
          if (espera > 0) await new Promise((res) => timers.push(window.setTimeout(res, espera)));
          if (!r.ok) falhas++;
          if (vivo) setEstados((e) => ({ ...e, [k]: { estado: r.ok ? 'ok' : 'falhou', motivo: r.motivo } }));
        });
    });

    void Promise.all(tarefas).then(() => {
      // Com falha, segura um pouco mais para dar tempo de ler o motivo.
      timers.push(window.setTimeout(() => vivo && setSaindo(true), falhas ? 2600 : 1100));
    });
    return () => { vivo = false; timers.forEach((t) => window.clearTimeout(t)); };
  }, []);

  const falhas = ORDEM.filter((k) => estados[k].estado === 'falhou').length;
  const pronto = ORDEM.every((k) => estados[k].estado !== 'checando');

  return (
    <motion.div
      className="relative z-10 flex flex-col items-center"
      animate={saindo ? { opacity: 0, scale: reduzido ? 1 : 1.06 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      onAnimationComplete={() => { if (saindo) fimRef.current(); }}
    >
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <clipPath id="cx-squircle" clipPathUnits="objectBoundingBox"><path d={SQUIRCLE} /></clipPath>
          <linearGradient id="cx-brilho" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <motion.p
        className="mb-8 text-center text-[13px] font-medium uppercase tracking-[0.2em] text-[#F5D470]/80"
        initial={{ opacity: 0, y: reduzido ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
      >
        Conectando suas ferramentas
      </motion.p>

      <div className="flex items-start gap-7 max-sm:gap-4">
        {ORDEM.map((k, i) => (
          <IconeApp key={k} chave={k} indice={i} reduzido={reduzido} estado={estados[k].estado} motivo={estados[k].motivo} />
        ))}
      </div>

      <p className="mt-8 h-5 text-center text-[12.5px] text-white/55" aria-live="polite">
        {pronto && (falhas
          ? `${falhas} ${falhas === 1 ? 'conexão precisa' : 'conexões precisam'} de atenção. Abrindo o sistema...`
          : 'Tudo conectado. Abrindo o sistema...')}
      </p>
    </motion.div>
  );
}
