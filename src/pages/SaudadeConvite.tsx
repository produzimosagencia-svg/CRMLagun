import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, Camera, Clapperboard, Clock, Fish, MapPin, Martini, Pause, Play, Ticket, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import logoSaudade from '@/assets/saudade/saudade-logo.webp';
import fundoPraia from '@/assets/saudade/fundo-praia.webp';
import praiaDesfocada from '@/assets/saudade/praia-desfocada.webp';
import areia from '@/assets/saudade/areia.webp';
import capaGustavinn from '@/assets/saudade/capa-modo-gustavinn.webp';
import avatarGustavinn from '@/assets/saudade/avatar-gustavinn.webp';
import logoLaIsla from '@/assets/saudade/logo-la-isla.webp';
import logoTetto from '@/assets/saudade/logo-tetto.webp';
import logoDonCamaleone from '@/assets/saudade/logo-don-camaleone.webp';
import palavraLagun from '@/assets/palavra-lagun-branco.png';

/**
 * /saudade-convite — convite para os convidados do evento Saudade (Lagun).
 *
 * Feito para o celular. Abre com o convite "fechado": o som só pode começar
 * depois de um toque (os celulares bloqueiam áudio automático), então o botão
 * "Abrir convite" já dispara o primeiro trecho. Os trechos de 15 s tocam em
 * sequência.
 *
 * Seções: logo · convite · músicas · presskit · coquetel · final. O fundo
 * alterna entre praia (a foto do evento: céu, flamingo e areia) e sólido.
 *
 * O convite fechado e a hero são a mesma cena: fechado, a foto fica sob um véu
 * escuro com o botão; ao abrir, o véu some, a foto se aproxima devagar e o
 * logo entra.
 *
 * Conteúdo provisório: textos, músicas, presskit e logos do coquetel entram
 * quando o material chegar (constantes abaixo).
 */

const TRECHO_SEGUNDOS = 15;

interface Musica {
  titulo: string;
  artista: string;
  /** Foto redonda do artista (mini avatar). */
  avatar?: string;
  capa?: string;
  audio?: string;
  /** Segundo da música em que o trecho começa. */
  inicio?: number;
}

// Áudio provisório: prévia do Spotify (trecho escolhido pelo Spotify). Os
// trechos pedidos (1:23 e 0:10) precisam do arquivo da música: com ele,
// `audio` passa a ser o arquivo e `inicio` o segundo pedido.
const MUSICAS: Musica[] = [
  {
    titulo: '2026 / Relíquia do 2T', artista: 'Gustavinn', avatar: avatarGustavinn, capa: capaGustavinn,
    audio: 'https://p.scdn.co/mp3-preview/7c80c26e52108c6cab4c67699d2fe7fe9f7b7d12', // pedido: começar em 1:23
  },
  {
    titulo: 'Máquina do Tempo', artista: 'Gustavinn', avatar: avatarGustavinn, capa: capaGustavinn,
    audio: 'https://p.scdn.co/mp3-preview/c2422da82ee21e8ad750cc7c9259e200d714ffce', // pedido: começar em 0:10
  },
];

interface Item {
  nome: string;
  titulo: string;
  texto: string;
  icone: LucideIcon;
  /** Logo do parceiro (import do arquivo); sem ela, aparece o espaço reservado. */
  logo?: string;
}

// Kit que o convidado recebe.
// Textos exatamente como o Guilherme passou. Avatar: a marca de cada item.
const KIT: Item[] = [
  { nome: 'Pulseira', titulo: 'Pulseira', texto: 'Seu acesso à label Saudade', icone: Ticket, logo: logoSaudade },
  { nome: 'Vale Jantar', titulo: 'Vale Jantar', texto: 'R$120,00 de jantar no Tetto', icone: UtensilsCrossed, logo: logoTetto },
  { nome: 'Vale almoço', titulo: 'Vale almoço', texto: 'R$120,00 de almoço no La Isla', icone: UtensilsCrossed, logo: logoLaIsla },
];

// Coquetel: acontece durante a festa, das 23h à 01h. Sem logo, o avatar mostra o ícone.
const COQUETEL: Item[] = [
  { nome: 'Don Camaleone', titulo: 'Drinks', texto: 'Don Camaleone', icone: Martini, logo: logoDonCamaleone },
  { nome: 'Comida japonesa', titulo: 'Comida japonesa', texto: 'Myio', icone: Fish },
  { nome: 'Fotógrafo', titulo: 'Fotógrafo', texto: 'Exclusivo', icone: Camera },
  { nome: 'Videomaker', titulo: 'Videomaker', texto: 'Exclusivo', icone: Clapperboard },
];

const C = {
  oceano: '#08324C',
  oceanoFundo: '#05223A',
  mar: '#16A6C9',
  areia: '#E7C089',
  rosa: '#FF4F8B',
};

const FONTE_TITULO: CSSProperties = { fontFamily: "'Montserrat', 'Instrument Sans', sans-serif" };

export default function SaudadeConvite() {
  const [aberto, setAberto] = useState(false);
  const [tocando, setTocando] = useState<number | null>(null);
  const [progresso, setProgresso] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    document.title = 'Saudade · Convite · Lagun';
    // Montserrat: a mesma família das letras da arte ("03 OUTUBRO 23H").
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;500;700;800&display=swap';
    document.head.appendChild(link);
    return () => { link.remove(); audio.current?.pause(); };
  }, []);

  function tocar(i: number) {
    const m = MUSICAS[i];
    if (!m?.audio) { setTocando(i); setProgresso(0); return; }
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    const inicio = m.inicio ?? 0;
    el.src = m.audio;
    el.currentTime = inicio;
    el.ontimeupdate = () => {
      const p = (el.currentTime - inicio) / TRECHO_SEGUNDOS;
      setProgresso(Math.min(1, Math.max(0, p)));
      if (p >= 1) {
        el.pause();
        // Próximo trecho; depois do último, para.
        if (i + 1 < MUSICAS.length) tocar(i + 1); else setTocando(null);
      }
    };
    void el.play().catch(() => setTocando(null));
    setTocando(i);
  }

  function alternar(i: number) {
    if (tocando === i) { audio.current?.pause(); setTocando(null); return; }
    tocar(i);
  }

  function abrir() {
    setAberto(true);
    tocar(0);
  }

  useEffect(() => {
    document.documentElement.style.overflow = aberto ? '' : 'hidden';
    return () => { document.documentElement.style.overflow = ''; };
  }, [aberto]);

  return (
    <main className="min-h-screen text-white" style={{ background: C.oceanoFundo, ...FONTE_TITULO }}>
      <style>{ANIMACOES}</style>

      <div className="mx-auto max-w-[480px] overflow-hidden">
        {/* 1. Logo — praia (hero, que também é o convite fechado) */}
        <Hero aberto={aberto} onAbrir={abrir} />

        {/* 2. Texto de convite — sólido */}
        <Solido id="convite" className="px-7 py-16 text-center">
          <Rotulo>Convite</Rotulo>
          <h2 className="mt-4 text-[26px] font-extrabold leading-tight">Você é nosso convidado</h2>
          <p className="mt-5 text-[15px] font-light leading-relaxed text-white/85" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
            Texto do convite. Aqui entra a mensagem que você vai mandar, com o tom do Saudade, a data, o horário e o que o convidado vai viver na noite.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-2.5">
            <Info icone={CalendarDays} rotulo="Data"><span className="text-[15px] font-extrabold leading-none">03/10</span><span className="mt-1 block text-[10px] text-white/60">sábado</span></Info>
            <Info icone={Clock} rotulo="Horário"><span className="text-[15px] font-extrabold leading-none">23h</span><span className="mt-1 block text-[10px] text-white/60">abertura</span></Info>
            <Info icone={MapPin} rotulo="Local"><img src={palavraLagun} alt="Lagun" className="mx-auto h-[13px] w-auto" /><span className="mt-1.5 block text-[10px] text-white/60">Vitória · ES</span></Info>
          </div>
        </Solido>

        {/* 3. Músicas — praia (areia) */}
        <Praia tipo="areia" className="px-5 py-14">
          <div className="text-center">
            <Rotulo claro>Ouça o clima</Rotulo>
            <h2 className="mt-3 text-2xl font-extrabold" style={{ textShadow: '0 2px 14px rgba(40,16,4,.55)' }}>Músicas do artista</h2>
          </div>
          {/* Artista: mini avatar, nome e atalho para o Spotify. */}
          <div className="mx-auto mt-6 flex max-w-[330px] items-center gap-3 rounded-full border border-white/20 bg-[rgba(40,16,4,.35)] p-1.5 pr-2 backdrop-blur-md">
            <span className="relative shrink-0">
              <img src={avatarGustavinn} alt="Gustavinn" className="h-11 w-11 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${C.rosa}` }} />
              {tocando !== null && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#3a2210] bg-emerald-400" />}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[14px] font-extrabold leading-tight">Gustavinn</p>
              <p className="truncate text-[10.5px] text-white/70">{tocando !== null ? `Tocando · ${MUSICAS[tocando].titulo}` : `Artista · ${MUSICAS.length} faixas`}</p>
            </div>
            <a
              href="https://open.spotify.com/artist/7fVvrnWm0CQWfVTTrD1uYh"
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1DB954] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-black"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden><path d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21Zm4.8 15.15a.66.66 0 0 1-.9.22c-2.47-1.5-5.58-1.85-9.24-1.01a.66.66 0 1 1-.3-1.28c4-.92 7.45-.52 10.22 1.17.31.19.41.6.22.9Zm1.28-2.86a.82.82 0 0 1-1.13.27c-2.83-1.74-7.14-2.24-10.49-1.23a.82.82 0 1 1-.48-1.57c3.83-1.16 8.58-.6 11.83 1.4.39.24.51.74.27 1.13Zm.11-2.98C14.8 8.8 9.2 8.61 5.96 9.6a.98.98 0 1 1-.57-1.88c3.72-1.13 9.9-.91 13.8 1.4a.98.98 0 0 1-1 1.69Z" /></svg>
              Spotify
            </a>
          </div>

          <div className="mx-auto mt-5 grid max-w-[330px] grid-cols-2 items-start gap-4">
            {MUSICAS.map((m, i) => (
              <CartaoMusica
                key={i}
                musica={m}
                ativo={tocando === i}
                progresso={tocando === i ? progresso : 0}
                onToque={() => alternar(i)}
              />
            ))}
          </div>
          <p className="mt-4 text-center text-[11px] font-medium text-white/85" style={{ textShadow: '0 1px 8px rgba(40,16,4,.6)' }}>Trechos de 15 segundos · toque para pausar</p>
        </Praia>

        {/* 4. Kit do convidado — sólido */}
        <Solido className="px-6 py-16">
          <div className="text-center">
            <Rotulo>Presskit</Rotulo>
            <h2 className="mt-3 text-2xl font-extrabold">Seu kit</h2>
            <p className="mx-auto mt-3 max-w-[300px] text-sm font-light leading-relaxed text-white/75" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
              Tudo o que já está separado para você nessa noite.
            </p>
          </div>
          <div className="mt-8 space-y-3">
            {KIT.map((item) => (
              <div key={item.nome} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                <AvatarKit item={item} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[16px] font-extrabold leading-tight">
                    <item.icone size={15} strokeWidth={2.3} style={{ color: C.rosa }} />
                    {item.titulo}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-white/75" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>{item.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </Solido>

        {/* 5. Coquetel — praia (céu) */}
        <Praia className="px-6 py-16 text-center">
          <Rotulo>Coquetel</Rotulo>
          <h2 className="mt-3 text-2xl font-extrabold">Durante a festa</h2>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-[rgba(8,50,76,.5)] px-4 py-2 backdrop-blur-md">
            <Clock size={15} strokeWidth={2.3} style={{ color: C.rosa }} />
            <span className="text-[13px] font-bold tracking-wide">23:00 às 01:00</span>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 text-left">
            {COQUETEL.map((item) => (
              <div key={item.nome} className="rounded-2xl border border-white/20 bg-[rgba(8,50,76,.45)] p-3 backdrop-blur-md">
                {item.logo
                  ? <EspacoLogo item={item} quadrado className="aspect-square w-full" />
                  : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-xl shadow-[0_6px_18px_rgba(0,0,0,.3)]" style={{ background: `linear-gradient(160deg, ${C.mar}, ${C.oceano})` }}>
                      <item.icone size={46} strokeWidth={1.6} className="text-white/90" />
                    </div>
                  )}
                <div className="mt-3 flex items-center gap-2.5">
                  <IconeRedondo icone={item.icone} pequeno />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[13px] font-extrabold leading-tight">{item.titulo}</p>
                    <p className="truncate text-[10.5px] text-white/70">{item.texto}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Praia>

        {/* 6. Final — sólido */}
        <Solido className="px-6 pb-16 pt-14">
          <div className="flex items-center justify-center gap-5">
            <img src={logoSaudade} alt="Saudade" className="w-[46%]" />
            <span className="h-12 w-px bg-white/30" />
            <img src={palavraLagun} alt="Lagun" className="w-[30%]" />
          </div>
          <p className="mt-10 text-center text-[10px] uppercase tracking-[.3em] text-white/50">Lagun Vitória · ES</p>
        </Solido>
      </div>
    </main>
  );
}

/** Fundo de praia: céu ou areia da foto do evento, com véu para o texto ler bem. */
function Praia({ tipo = 'ceu', className = '', children }: { tipo?: 'ceu' | 'areia'; className?: string; children: ReactNode }) {
  const fundo = tipo === 'areia'
    ? `linear-gradient(180deg, ${C.oceano} 0%, rgba(8,50,76,0) 14%, rgba(8,50,76,0) 86%, ${C.oceano} 100%), linear-gradient(180deg, rgba(40,16,4,.28), rgba(40,16,4,.42)), url(${areia}) center / cover no-repeat, #B8672F`
    : `linear-gradient(180deg, ${C.oceano} 0%, rgba(8,50,76,.35) 16%, rgba(8,50,76,.35) 84%, ${C.oceano} 100%), url(${praiaDesfocada}) center 62% / cover no-repeat, ${C.oceano}`;
  return <section className={`relative ${className}`} style={{ background: fundo }}>{children}</section>;
}

/**
 * Hero: a foto inteira (flamingo na praia) com o logo e a data no céu.
 * Fechado, um véu escuro e desfocado cobre a cena e mostra o botão; o toque
 * abre o convite e libera o som.
 */
function Hero({ aberto, onAbrir }: { aberto: boolean; onAbrir: () => void }) {
  return (
    <section className="relative h-[100svh] min-h-[600px] overflow-hidden">
      <img
        src={fundoPraia}
        alt=""
        {...{ fetchpriority: 'high' }}
        className={`absolute inset-0 h-full w-full object-cover object-[50%_100%] ${aberto ? 'sd-aproxima' : 'scale-[1.12]'}`}
      />
      {/* Leitura do texto no céu e passagem para a seção de baixo. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(3,22,40,.55) 0%, rgba(3,22,40,.12) 30%, rgba(3,22,40,0) 45%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: `linear-gradient(180deg, rgba(8,50,76,0), ${C.oceano})` }} />

      {/* Topo: Lagun + data e o logo, no céu vazio. */}
      <div className="absolute inset-x-0 top-0 z-20 flex flex-col items-center px-6 pt-[max(env(safe-area-inset-top),18px)] text-center">
        <div className={`mt-6 flex items-center gap-3.5 ${aberto ? 'sd-entra' : ''}`} style={{ animationDelay: '250ms' }}>
          <img src={palavraLagun} alt="Lagun" className="h-[17px] w-auto" />
          <span className="h-7 w-px bg-white/45" />
          <p className="text-left leading-none">
            <span className="block text-[8.5px] font-medium tracking-[.42em] text-white/85">SAVE THE DATE</span>
            <span className="mt-1.5 block text-[13px] font-medium tracking-[.02em]">03 <b className="font-extrabold">OUTUBRO</b> 23H</span>
          </p>
        </div>
        <img
          src={logoSaudade}
          alt="Saudade"
          className={`mt-[5.5svh] w-[86%] max-w-[380px] drop-shadow-[0_8px_22px_rgba(0,20,40,.35)] ${aberto ? 'sd-entra sd-flutua' : ''}`}
          style={{ animationDelay: aberto ? '450ms, 1800ms' : undefined }}
        />
      </div>

      {/* Base: convite para rolar. */}
      <a
        href="#convite"
        className={`absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),22px)] flex flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-[.4em] text-white transition-opacity duration-700 ${aberto ? 'opacity-100 delay-1000' : 'opacity-0'}`}
        style={{ textShadow: '0 1px 8px rgba(0,0,0,.45)' }}
      >
        Deslize
        <span className="relative h-9 w-px overflow-hidden bg-white/30"><span className="sd-linha absolute inset-x-0 top-0 h-1/2 bg-white" /></span>
      </a>

      {/* Véu do convite fechado. */}
      <div
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center px-8 pt-[30svh] text-center transition-all duration-[900ms] ease-out ${aberto ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        style={{ background: 'radial-gradient(120% 70% at 50% 62%, rgba(3,22,40,.78) 0%, rgba(3,22,40,.55) 55%, rgba(3,22,40,.35) 100%)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[.42em] text-white/80">Você recebeu</p>
        <p className="mt-2 text-[26px] font-extrabold leading-none">um convite</p>
        <button
          onClick={onAbrir}
          className="mt-8 w-full max-w-[300px] rounded-full py-4 text-[13px] font-bold uppercase tracking-[.28em] text-white transition active:scale-[.97]"
          style={{ background: C.rosa, boxShadow: '0 12px 34px rgba(255,79,139,.5), inset 0 1px 0 rgba(255,255,255,.25)' }}
        >
          Abrir convite
        </button>
        <p className="mt-4 text-[10.5px] tracking-wide text-white/60">Aumente o volume · a noite tem trilha</p>
      </div>
    </section>
  );
}

const ANIMACOES = `
@keyframes sd-aproxima { from { transform: scale(1.12); } to { transform: scale(1); } }
@keyframes sd-entra { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes sd-flutua { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes sd-linha { from { transform: translateY(-100%); } to { transform: translateY(200%); } }
.sd-aproxima { animation: sd-aproxima 2.6s cubic-bezier(.2,.7,.2,1) both; }
.sd-entra { animation: sd-entra .9s cubic-bezier(.2,.7,.2,1) both; }
.sd-entra.sd-flutua { animation: sd-entra .9s cubic-bezier(.2,.7,.2,1) both, sd-flutua 6s ease-in-out infinite; }
.sd-linha { animation: sd-linha 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .sd-aproxima, .sd-entra, .sd-flutua, .sd-linha { animation: none !important; }
}
`;

function Solido({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  return <section id={id} className={`relative ${className}`} style={{ background: C.oceano }}>{children}</section>;
}

function Rotulo({ children, claro = false }: { children: ReactNode; claro?: boolean }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[.35em]" style={claro ? { color: 'rgba(255,255,255,.9)', textShadow: '0 1px 8px rgba(40,16,4,.6)' } : { color: C.rosa }}>
      {children}
    </p>
  );
}

function Info({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.05] px-2 pb-3.5 pt-3 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${C.rosa}26`, color: C.rosa }}>
        <Icone size={17} strokeWidth={2.2} />
      </span>
      <p className="mt-2 text-[8.5px] font-bold uppercase tracking-[.25em] text-white/50">{rotulo}</p>
      <div className="mt-1.5 w-full">{children}</div>
    </div>
  );
}

/** Avatar quadrado do kit. A logo Saudade (branca, sem fundo) ganha um fundo azul. */
function AvatarKit({ item }: { item: Item }) {
  const semFundo = item.logo === logoSaudade;
  return (
    <div
      className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-[0_6px_18px_rgba(0,0,0,.3)]"
      style={semFundo ? { background: `linear-gradient(160deg, ${C.mar}, ${C.oceano})` } : undefined}
    >
      <img src={item.logo} alt={item.nome} className={semFundo ? 'w-[84%]' : 'h-full w-full object-cover'} />
    </div>
  );
}

function IconeRedondo({ icone: Icone, pequeno = false }: { icone: LucideIcon; pequeno?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${pequeno ? 'h-8 w-8' : 'h-11 w-11'}`}
      style={{ background: `${C.rosa}26`, color: C.rosa }}
    >
      <Icone size={pequeno ? 15 : 19} strokeWidth={2.2} />
    </span>
  );
}

/** Logo do parceiro; enquanto não chega, um espaço reservado discreto. */
function EspacoLogo({ item, quadrado = false, className = '' }: { item: Item; quadrado?: boolean; className?: string }) {
  // Quadrado: a logo ocupa o card inteiro, como foto de perfil.
  if (item.logo && quadrado) {
    return (
      <div className={`overflow-hidden rounded-xl shadow-[0_6px_18px_rgba(0,0,0,.3)] ${className}`}>
        <img src={item.logo} alt={item.nome} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (item.logo) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <img src={item.logo} alt={item.nome} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl border border-dashed border-white/25 bg-white/[0.03] ${className}`}>
      <span className="text-[9px] font-semibold uppercase tracking-[.2em] text-white/40">logo</span>
    </div>
  );
}

function CartaoMusica({ musica, ativo, progresso, onToque }: { musica: Musica; ativo: boolean; progresso: number; onToque: () => void }) {
  return (
    <button
      onClick={onToque}
      className="group flex min-w-0 flex-col text-left transition active:scale-95"
      aria-label={`${ativo ? 'Pausar' : 'Tocar'} ${musica.titulo}`}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-2xl shadow-[0_10px_24px_rgba(40,16,4,.45)] transition"
        style={ativo ? { boxShadow: `0 0 0 2.5px ${C.rosa}, 0 10px 24px rgba(40,16,4,.45)` } : undefined}
      >
        {musica.capa
          ? <img src={musica.capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-[#16A6C9] to-[#08324C]" />}
        <div className={`absolute inset-0 transition ${ativo ? 'bg-black/35' : 'bg-black/15'}`} />
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#08324C] shadow-lg">
          {ativo ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </span>
        {ativo && (
          <span className="absolute right-2 top-2 flex h-4 items-end gap-[2px]" aria-hidden>
            {[0, 1, 2].map((b) => <span key={b} className="w-[3px] animate-pulse rounded-full bg-white" style={{ height: `${8 + b * 3}px`, animationDelay: `${b * 150}ms` }} />)}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div className="h-full transition-[width] duration-200" style={{ width: `${progresso * 100}%`, background: C.rosa }} />
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] font-bold leading-tight text-white" style={{ textShadow: '0 1px 6px rgba(40,16,4,.6)' }}>{musica.titulo}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-[10px] text-white/75" style={{ textShadow: '0 1px 6px rgba(40,16,4,.6)' }}>
        {musica.avatar && <img src={musica.avatar} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-white/40" />}
        {musica.artista}
      </p>
    </button>
  );
}
