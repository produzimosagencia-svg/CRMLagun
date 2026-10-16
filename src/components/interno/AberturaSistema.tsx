import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { FundoEscultura } from '@/components/interno/FundoEscultura';
import metaLogo from '@/assets/meta-icon.png';
import zigLogo from '@/assets/zig-icon.png';

/**
 * Abertura do sistema, sobre o fundo de areia do login: quatro ícones no padrão
 * de app da Apple (Zig, Meta, Instagram e WhatsApp) que acendem um a um.
 * É ilustração: não testa conexão nem mostra status. O que ela acompanha de
 * verdade é o carregamento: o último ícone só acende quando a primeira página
 * do painel montou por baixo, e aí a camada inteira esmaece revelando o painel.
 *
 * Aparece depois do login (flag gravado pelo InternoLogin) e na abertura do
 * app de computador (uma vez por sessão da janela).
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const FLAG_LOGIN = 'interno-abertura';
const FLAG_APP_VISTA = 'interno-abertura-app-vista';
const EVENTO_PRONTO = 'interno-pagina-pronta';
const LIMITE_MS = 10000;

let paginaPronta = false;
let emCena = false;
const EVENTO_SAIU = 'interno-abertura-saiu';

/** A abertura está na frente agora? (a escolha de sessão espera ela sair) */
export function aberturaEmCena() { return emCena; }
/** Avisa quando a abertura começa a sair. Devolve a função para parar de ouvir. */
export function aoSairAbertura(fn: () => void) {
  window.addEventListener(EVENTO_SAIU, fn);
  return () => window.removeEventListener(EVENTO_SAIU, fn);
}
/** Chamado quando a primeira página do painel montou (ver SinalPaginaPronta). */
export function avisarPaginaPronta() {
  if (paginaPronta) return;
  paginaPronta = true;
  window.dispatchEvent(new Event(EVENTO_PRONTO));
}

/** Coloque dentro do Suspense, depois do Outlet: monta junto com a página. */
export function SinalPaginaPronta() {
  useEffect(() => { avisarPaginaPronta(); }, []);
  return null;
}

/** Decide uma vez, na montagem do layout, se a abertura deve aparecer. */
export function deveMostrarAbertura(): boolean {
  try {
    if (sessionStorage.getItem(FLAG_LOGIN) === '1') {
      sessionStorage.removeItem(FLAG_LOGIN);
      return true;
    }
    const noApp = Boolean((window as any).app?.noLauncher);
    if (noApp && sessionStorage.getItem(FLAG_APP_VISTA) !== '1') {
      sessionStorage.setItem(FLAG_APP_VISTA, '1');
      return true;
    }
  } catch { /* sem sessionStorage: segue sem abertura */ }
  return false;
}

export function marcarAberturaPosLogin() {
  try { sessionStorage.setItem(FLAG_LOGIN, '1'); } catch { /* ignora */ }
}

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

// ── Artes dos ícones (viewBox 100×100, recortadas pelo squircle) ────────────
const ICONES: { nome: string; arte: ReactNode }[] = [
  {
    nome: 'Zig Tickets',
    arte: <image href={zigLogo} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />,
  },
  {
    nome: 'Meta',
    arte: (
      <>
        <defs>
          <linearGradient id="ab-meta" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#EEF1F6" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#ab-meta)" />
        <image href={metaLogo} x="18" y="18" width="64" height="64" />
      </>
    ),
  },
  {
    nome: 'Instagram',
    arte: (
      <>
        <defs>
          <radialGradient id="ab-ig" cx="0.28" cy="1.05" r="1.25">
            <stop offset="0" stopColor="#FED576" /><stop offset="0.26" stopColor="#F47133" />
            <stop offset="0.61" stopColor="#BC3081" /><stop offset="1" stopColor="#4C63D2" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#ab-ig)" />
        <rect x="23" y="23" width="54" height="54" rx="16" fill="none" stroke="#fff" strokeWidth="6" />
        <circle cx="50" cy="50" r="12.5" fill="none" stroke="#fff" strokeWidth="6" />
        <circle cx="65.5" cy="34.5" r="3.8" fill="#fff" />
      </>
    ),
  },
  {
    nome: 'WhatsApp',
    arte: (
      <>
        <defs>
          <linearGradient id="ab-wa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5FFC7B" /><stop offset="1" stopColor="#28D146" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#ab-wa)" />
        <path d="M50 23a26 26 0 0 0-22.6 38.9L24 76l14.6-3.6A26 26 0 1 0 50 23z"
          fill="none" stroke="#fff" strokeWidth="5.5" strokeLinejoin="round" />
        <path transform="translate(37 36) scale(1.1)" fill="#fff"
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </>
    ),
  },
];

function IconeApp({ nome, arte, indice, aceso, reduzido, saindo }: {
  nome: string; arte: ReactNode; indice: number; aceso: boolean; reduzido: boolean; saindo: boolean;
}) {
  return (
    <motion.div
      className="flex w-[76px] flex-col items-center max-sm:w-[64px]"
      initial={reduzido ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.86 }}
      // Saída: um ícone de cada vez sobe, encolhe e some, antes das sessões entrarem.
      animate={saindo
        ? { opacity: 0, y: reduzido ? 0 : -22, scale: reduzido ? 1 : 0.78, filter: 'blur(4px)' }
        : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={saindo
        ? { duration: 0.42, delay: indice * 0.07, ease: [0.4, 0, 1, 1] }
        : { duration: 0.8, delay: 0.35 + indice * 0.1, ease: EASE }}
    >
      <motion.div
        className="relative h-[76px] w-[76px] max-sm:h-[64px] max-sm:w-[64px]"
        style={{ filter: 'drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 2px 4px rgba(0,0,0,.35))' }}
        animate={aceso && !reduzido ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full" style={{ clipPath: 'url(#ab-squircle)' }} aria-hidden>
          <g style={{ filter: aceso ? 'none' : 'saturate(.3) brightness(.62)', transition: 'filter .7s ease' }}>{arte}</g>
          {/* Brilho sutil de cima, como nos ícones do iOS */}
          <rect width="100" height="100" fill="url(#ab-brilho)" />
          {/* Véu escuro de "instalando", igual ao download da App Store */}
          <rect width="100" height="100" fill="#000" style={{ opacity: aceso ? 0 : 0.4, transition: 'opacity .7s ease' }} />
        </svg>

        <AnimatePresence>
          {!aceso && (
            <motion.svg viewBox="0 0 40 40" className="absolute inset-0 m-auto h-8 w-8 animate-spin"
              style={{ animationDuration: '1s' }} aria-hidden
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.35 }}>
              <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3.5" />
              <circle cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="28 100" />
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.div>

      <span className="mt-2.5 w-full truncate text-center text-[12px] font-medium text-white/90"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif", textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
        {nome}
      </span>
    </motion.div>
  );
}

function Conteudo({ onFim, saindo }: { onFim: () => void; saindo: boolean }) {
  const reduzido = !!useReducedMotion();
  const { user, loading } = useAuth();
  const [acesos, setAcesos] = useState(0);
  const [pronta, setPronta] = useState(paginaPronta);

  useEffect(() => {
    if (pronta) return;
    const ouvir = () => setPronta(true);
    window.addEventListener(EVENTO_PRONTO, ouvir);
    // Garantia: nunca prende a pessoa na abertura.
    const t = window.setTimeout(ouvir, LIMITE_MS);
    return () => { window.removeEventListener(EVENTO_PRONTO, ouvir); window.clearTimeout(t); };
  }, [pronta]);

  // Sessão vencida: o layout manda para o login, a abertura sai junto.
  useEffect(() => { if (!loading && !user) onFim(); }, [loading, user, onFim]);

  // Os três primeiros acendem no ritmo; o último espera a página estar pronta.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (acesos < ICONES.length - 1) setAcesos((n) => n + 1);
      else if (pronta) setAcesos(ICONES.length);
    }, acesos === 0 ? 1100 : 450);
    return () => window.clearTimeout(t);
  }, [acesos, pronta]);

  useEffect(() => {
    if (acesos < ICONES.length) return;
    const t = window.setTimeout(onFim, 750);
    return () => window.clearTimeout(t);
  }, [acesos, onFim]);

  return (
    <div className="relative z-10 flex flex-col items-center">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <clipPath id="ab-squircle" clipPathUnits="objectBoundingBox"><path d={SQUIRCLE} /></clipPath>
          <linearGradient id="ab-brilho" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".16" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <motion.p
        className="mb-8 text-center text-[13px] font-medium uppercase tracking-[0.2em] text-[#F5D470]/80"
        initial={{ opacity: 0, y: reduzido ? 0 : 8 }}
        animate={saindo ? { opacity: 0, y: reduzido ? 0 : -8 } : { opacity: 1, y: 0 }}
        transition={saindo ? { duration: 0.3 } : { duration: 0.7, delay: 0.2, ease: EASE }}
      >
        Preparando seu painel
      </motion.p>

      <div className="flex items-start gap-7 max-sm:gap-4">
        {ICONES.map((ic, i) => (
          <IconeApp key={ic.nome} nome={ic.nome} arte={ic.arte} indice={i} aceso={acesos > i} reduzido={reduzido} saindo={saindo} />
        ))}
      </div>

      <motion.p
        className="mt-10 text-center text-[13px] text-white/55"
        initial={{ opacity: 0 }}
        animate={{ opacity: saindo ? 0 : 1 }}
        transition={saindo ? { duration: 0.3 } : { duration: 0.7, delay: 0.9, ease: EASE }}
      >
        Carregando ferramentas... Aguarde um minuto!
      </motion.p>
    </div>
  );
}

/**
 * Camada da abertura. A escultura do fundo é a mesma do login (não reinicia):
 * o cartão sai e os ícones entram sobre ela. Na saída, se houver outra tela com
 * o fundo por baixo (a escolha de sessão do app), a escultura passa para ela e
 * a camada fica transparente; senão ela some junto, revelando o painel.
 */
function Camada({ onFim }: { onFim: () => void }) {
  const presente = useIsPresent();
  useLayoutEffect(() => { emCena = true; return () => { emCena = false; }; }, []);
  useEffect(() => {
    if (presente) return;
    emCena = false;
    // As sessões só entram depois que o último ícone saiu.
    const t = window.setTimeout(() => window.dispatchEvent(new Event(EVENTO_SAIU)), 560);
    return () => window.clearTimeout(t);
  }, [presente]);
  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-4"
      style={{ backgroundColor: presente ? '#000' : 'transparent' }}
      // A camada só esmaece depois que os ícones saíram um a um.
      exit={{ opacity: 0, transition: { delay: 0.45, duration: 0.5, ease: [0.4, 0, 0.2, 1] } }}
    >
      <FundoEscultura className="absolute inset-0" prioridade={presente ? 2 : 0} />
      <Conteudo onFim={onFim} saindo={!presente} />
    </motion.div>
  );
}

export function AberturaSistema({ visivel, onFim }: { visivel: boolean; onFim: () => void }) {
  return <AnimatePresence>{visivel && <Camada key="abertura" onFim={onFim} />}</AnimatePresence>;
}
