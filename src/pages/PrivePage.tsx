import { useEffect } from 'react';
import bgDark from '@/assets/prive-bg-dark.jpg';
import blobChrome from '@/assets/prive-blob-chrome.png';
import logoChrome from '@/assets/prive-logo-chrome.png';
import dataChrome from '@/assets/prive-data-chrome.png';
import arameThin from '@/assets/fonts/Arame-Thin.ttf';
import arameBold from '@/assets/fonts/Arame-Bold.otf';

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
      `}</style>

      {/* Fundo fluido escuro do PSD */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{ backgroundImage: `url(${bgDark})` }}
      />
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

        {/* Blob de cromo líquido flutuando */}
        <img
          src={blobChrome}
          alt=""
          aria-hidden
          className="w-72 md:w-[430px] my-6"
          style={{
            animation: 'prive-float 7s ease-in-out infinite',
            filter: 'drop-shadow(0 20px 60px rgba(120,160,200,0.2))',
          }}
        />

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
