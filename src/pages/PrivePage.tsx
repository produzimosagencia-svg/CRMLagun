import { useEffect } from 'react';
import PriveFluidBackground from '@/components/PriveFluidBackground';
import bgDark from '@/assets/prive-bg-dark.jpg';
import logoChrome from '@/assets/prive-logo-chrome.png';
import dataChrome from '@/assets/prive-data-chrome.png';
import arameThin from '@/assets/fonts/Arame-Thin.ttf';
import arameBold from '@/assets/fonts/Arame-Bold.otf';

// Destinos dos botões — atualizar quando os links oficiais chegarem
const LINKS = {
  ingressos: '#',
  comunidade: '#',
  sac: '#',
};

// Landing page do Privê — identidade extraída do PSD oficial:
// preto absoluto, cromo líquido, tipografia Arame com tracking largo
export default function PrivePage() {
  useEffect(() => {
    document.title = 'Privê — 14 de Agosto — Vitória/ES';
  }, []);

  const marqueeText = Array(12).fill('vempraprive').join(' • ') + ' • ';

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: '#030304', fontFamily: 'Arame, sans-serif' }}
    >
      <style>{`
        @font-face {
          font-family: 'Arame';
          src: url(${arameThin}) format('truetype');
          font-weight: 300;
          font-display: swap;
        }
        @font-face {
          font-family: 'Arame';
          src: url(${arameBold}) format('opentype');
          font-weight: 700;
          font-display: swap;
        }
        @keyframes prive-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(1.5deg); }
        }
        @keyframes prive-marquee {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        .prive-marquee-col {
          animation: prive-marquee 40s linear infinite;
        }
        .prive-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 14px 24px;
          text-align: center;
          font-weight: 300;
          font-size: 13px;
          letter-spacing: 0.3em;
          text-indent: 0.3em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.85);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 2px;
          backdrop-filter: blur(6px);
          transition: all 0.25s ease;
        }
        .prive-btn:hover {
          border-color: rgba(255,255,255,0.6);
          background: rgba(255,255,255,0.08);
          box-shadow: 0 0 25px rgba(160,190,220,0.18);
        }
        .prive-btn-primary {
          color: #0a0c10;
          font-weight: 700;
          background: linear-gradient(180deg, #f4f7fa 0%, #b8c4d2 40%, #8fa0b4 55%, #dfe7ef 100%);
          border: 1px solid rgba(255,255,255,0.7);
          box-shadow: 0 0 30px rgba(170,200,230,0.25), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .prive-btn-primary:hover {
          background: linear-gradient(180deg, #ffffff 0%, #c8d4e2 40%, #9fb0c4 55%, #eff7ff 100%);
          box-shadow: 0 0 45px rgba(170,200,230,0.4), inset 0 1px 0 rgba(255,255,255,0.9);
        }
      `}</style>

      {/* Fundo estático do PSD — fallback para WebGL indisponível/reduced-motion */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{ backgroundImage: `url(${bgDark})` }}
      />
      {/* Fundo fluido animado (GPU) por cima do estático */}
      <PriveFluidBackground />
      {/* Vinheta para escurecer as bordas */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.75) 100%)',
        }}
      />

      {/* Marquee vertical nas bordas — como no flyer */}
      <div className="absolute left-2 md:left-4 top-0 bottom-0 overflow-hidden z-10 pointer-events-none">
        <div
          className="prive-marquee-col text-[11px] md:text-xs whitespace-nowrap"
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.35em',
            fontWeight: 300,
          }}
        >
          {marqueeText}{marqueeText}
        </div>
      </div>
      <div className="absolute right-2 md:right-4 top-0 bottom-0 overflow-hidden z-10 pointer-events-none">
        <div
          className="prive-marquee-col text-[11px] md:text-xs whitespace-nowrap"
          style={{
            writingMode: 'vertical-rl',
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.35em',
            fontWeight: 300,
          }}
        >
          {marqueeText}{marqueeText}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="relative z-20 flex flex-col items-center justify-between min-h-screen px-10 py-12 md:py-16">
        {/* Logo cromada */}
        <img
          src={logoChrome}
          alt="Privê"
          className="w-56 md:w-80 mt-4 md:mt-6"
          style={{ filter: 'drop-shadow(0 0 30px rgba(160,190,220,0.25))' }}
        />

        {/* Botões centrais */}
        <div className="flex flex-col items-center gap-4 md:gap-5 w-full max-w-xs my-10">
          <a
            href={LINKS.ingressos}
            className="prive-btn prive-btn-primary"
          >
            Ingressos disponíveis!
          </a>
          <a
            href={LINKS.comunidade}
            className="prive-btn"
          >
            Comunidade
          </a>
          <a
            href={LINKS.sac}
            className="prive-btn"
          >
            SAC
          </a>
        </div>

        {/* Save the date */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <p
            className="text-xs md:text-sm uppercase"
            style={{ color: '#F2F2F2', letterSpacing: '0.6em', fontWeight: 300 }}
          >
            Save the date
          </p>
          {/* A arte cromada já traz "14.AGOSTO" e "VITÓRIA - ES" */}
          <img
            src={dataChrome}
            alt="14 de Agosto — Vitória/ES"
            className="w-52 md:w-64"
          />

          {/* Hashtag */}
          <p
            className="mt-6 text-[11px] md:text-xs uppercase"
            style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.4em', fontWeight: 300 }}
          >
            #VemPraPrivê
          </p>
        </div>
      </div>
    </div>
  );
}
