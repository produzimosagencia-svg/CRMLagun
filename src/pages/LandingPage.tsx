import { useEffect, useRef, useState } from 'react';
import simboloGold from '@/assets/simbolo-lagun.png';
import flamingoSolo from '@/assets/flamingo-solo.png';
import simboloBranco from '@/assets/simbolo-lagun-branco.png';
import palavraGold from '@/assets/palavra-lagun.png';
import palavraBranco from '@/assets/palavra-lagun-branco.png';
import flyerNoiteFlamingo from '@/assets/flyer-noite-flamingo.png';
import videoLagun from '@/assets/video-lagun.mp4';
import videoLagun2 from '@/assets/video-lagun-2.mp4';
import logo99 from '@/assets/logo-99-gold.svg';
import logo99Desktop from '@/assets/logo-99.jpg';
import logoMaps from '@/assets/logo-googlemaps.png';
import logoUber from '@/assets/logo-uber.png';
import fotoLounge from '@/assets/foto-lounge.jpg';
import fotoLounge2 from '@/assets/DSC_9565.jpg';
import fotoLounge3 from '@/assets/DSC_8794.jpg';
import fotoLounge4 from '@/assets/DSC_9422.jpg';
import fotoAniversario from '@/assets/foto-aniversario.jpg';

const eventos = [
  {
    id: 1,
    nome: 'Bero Costa',
    data: '22/05',
    diaSemana: 'Sábado',
    artista: 'All Night Along',
    guests: 'BeLeiTe + Dj Lukão',
    tag: 'ABERTO',
    link: 'https://www.superticket.com.br/evento/22811',
    flyerMobile: '/flyer-bero-feed.png',
    flyerDesktop: '/flyer-bero-banner.png',
  },
];

const lounges = [
  {
    nome: 'Lounge',
    capacidade: 'até 15 pessoas',
    descricao: 'Espaço privativo com serviço de mordomo, cardápio selecionado e localização privilegiada.',
    icone: '◈',
    destaque: true,
  },
];

const loungePhotos = [fotoLounge, fotoLounge2, fotoLounge3, fotoLounge4];

export default function LandingPage() {
  const revealRef = useRef<HTMLDivElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  useEffect(() => {
    document.body.style.backgroundColor = '#1A0800';
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIndex((i) => (i + 1) % loungePhotos.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('visible');
          }
        });
      },
      { threshold: 0.12 }
    );

    const elements = document.querySelectorAll('.reveal');
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="min-h-screen text-white relative"
      style={{ backgroundColor: '#1A0800', fontFamily: "'DM Sans', sans-serif", minHeight: '100dvh' }}
    >
      {/* Vídeo de fundo fixo — mobile only */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="block md:hidden fixed inset-0 w-full h-full object-cover pointer-events-none z-0"
        style={{ opacity: 0.05 }}
      >
        <source src={videoLagun2} type="video/mp4" />
      </video>
      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className="hidden md:flex items-center justify-center px-6 py-6">
        <img src={palavraBranco} alt="LAGUN" className="h-5 w-auto" />
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center pt-16 md:pt-8 pb-8 px-4">
        {/* Vídeo de fundo — desktop */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="hidden md:block absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.10 }}
        >
          <source src={videoLagun} type="video/mp4" />
        </video>
        <div className="hidden md:block absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(26,8,0,0.55)' }} />


        <img src={flamingoSolo} alt="Lagun" className="h-28 md:h-44 w-auto mb-3 md:mb-6 relative z-10" />
        <img src={palavraGold} alt="LAGUN" className="block md:hidden h-8 w-auto mb-4 relative z-10" />
        <p className="hidden md:block text-xs tracking-[0.4em] uppercase mb-4 relative z-10" style={{ color: '#F5D470' }}>
          Vitória · Espírito Santo · 2026
        </p>
        <p className="hidden md:block text-sm md:text-base max-w-md mx-auto leading-relaxed relative z-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
          A nova casa de experiências exclusivas da capital.<br />
          Música, gastronomia e ambiente únicos em cada noite.
        </p>
      </section>

      {/* ── SEÇÃO 1 · EVENTOS ───────────────────────────────────────────────── */}
      <section id="eventos">

        {/* ── MOBILE: lista linktree ── */}
        <div className="block md:hidden px-4 pb-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[10px] tracking-[0.35em] uppercase" style={{ color: '#F5D470' }}>
              Próximos Eventos
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(245,212,112,0.15)' }} />
          </div>
          <div className="flex flex-col gap-3">
            {eventos.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 p-3"
                style={{
                  backgroundColor: '#2B0E00',
                  border: '1px solid rgba(245,212,112,0.12)',
                  borderRadius: '14px',
                }}
              >
                {/* Thumbnail */}
                <div className="shrink-0 overflow-hidden" style={{ width: 60, height: 60, borderRadius: '10px', backgroundColor: '#3a1500' }}>
                  <img src={ev.flyerMobile} alt={ev.nome} className="w-full h-full object-cover" loading="eager" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm leading-tight truncate">{ev.nome}</p>
                  <p className="text-sm font-semibold truncate mt-0.5" style={{ color: '#F5D470' }}>{ev.artista}</p>
                  {'guests' in ev && ev.guests && (
                    <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{(ev as any).guests}</p>
                  )}
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <span className="font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>{ev.data}</span>
                    {' · '}{ev.diaSemana}
                  </p>
                </div>

                {/* Botão ingresso */}
                <a
                  href={ev.link}
                  className="shrink-0 flex items-center justify-center transition-all active:opacity-70"
                  style={{ backgroundColor: '#F5D470', borderRadius: '10px', width: 44, height: 44 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A0800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 9a1 1 0 0 1 0-2V5a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2a1 1 0 0 1 0 2v2a1 1 0 0 1 0 2v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 0-2V9z"/>
                    <line x1="9" y1="4" x2="9" y2="20" strokeDasharray="2 2"/>
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* ── DESKTOP: grid de cards ── */}
        <div className="hidden md:block px-10 py-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-10">
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(245,212,112,0.2)' }} />
            <span className="text-xs tracking-[0.35em] uppercase whitespace-nowrap" style={{ color: '#F5D470' }}>
              Próximos Eventos
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(245,212,112,0.2)' }} />
          </div>
          <div className="flex justify-center gap-5 flex-wrap">
            {eventos.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col overflow-hidden"
                style={{
                  width: '280px',
                  backgroundColor: '#2B0E00',
                  border: '1px solid rgba(245,212,112,0.15)',
                  borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}
              >
                <div
                  className="relative w-full flex items-center justify-center overflow-hidden"
                  style={{ aspectRatio: '800 / 300', backgroundColor: '#1A0800', borderBottom: '1px solid rgba(245,212,112,0.1)' }}
                >
                  <img src={ev.flyerDesktop} alt={ev.nome} className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col flex-1 p-5 gap-4">
                  <div className="flex justify-between items-start">
                    <span
                      className="text-[10px] tracking-widest px-2 py-1"
                      style={{
                        border: `1px solid ${ev.tag === 'ABERTO' ? '#F5D470' : 'rgba(255,255,255,0.15)'}`,
                        color: ev.tag === 'ABERTO' ? '#F5D470' : 'rgba(255,255,255,0.35)',
                        borderRadius: '999px',
                      }}
                    >
                      {ev.tag}
                    </span>
                    <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {ev.data} · {ev.diaSemana}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold leading-tight text-white">{ev.nome}</h3>
                    <p className="text-base font-semibold mt-0.5" style={{ color: '#F5D470' }}>{ev.artista}</p>
                    {'guests' in ev && ev.guests && (
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        special guests: <span style={{ color: 'rgba(255,255,255,0.65)' }}>{(ev as any).guests}</span>
                      </p>
                    )}
                  </div>
                  <a
                    href={ev.link}
                    className="block text-center text-xs tracking-widest py-3 transition-all hover:opacity-90 active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #F5D470 0%, #e8b830 50%, #F5D470 100%)',
                      color: '#1A0800',
                      fontWeight: 700,
                      borderRadius: '10px',
                      boxShadow: '0 0 20px rgba(245,212,112,0.45), 0 4px 14px rgba(245,212,112,0.25)',
                      border: '1px solid rgba(255,235,130,0.6)',
                    }}
                  >
                    COMPRAR INGRESSO
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* ── MOBILE: botões rápidos + contato ── */}
      <div className="reveal block md:hidden px-4 pb-10" style={{ backgroundColor: '#1A0800', animationDelay: '0.3s' }}>
        {/* Botões lounge e aniversário */}
        <div className="flex flex-col gap-3 mb-4">
          <a
            href="https://wa.me/+5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20garantir%20o%20meu%20lounge!"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center py-4 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #F5D470 0%, #e8b830 50%, #F5D470 100%)',
              borderRadius: '14px',
              boxShadow: '0 0 24px rgba(245,212,112,0.5), 0 4px 16px rgba(245,212,112,0.3)',
              border: '1px solid rgba(255,235,130,0.6)',
            }}
          >
            <span className="text-sm font-bold tracking-widest uppercase" style={{ color: '#1A0800', letterSpacing: '0.15em' }}>
              Lounges &amp; Mesas
            </span>
          </a>
          <a
            href="https://wa.me/+5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20comemorar%20o%20meu%20anivers%C3%A1rio!"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center py-4 transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #6B2800 0%, #4A1800 50%, #6B2800 100%)',
              borderRadius: '14px',
              boxShadow: '0 0 20px rgba(107,40,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
              border: '1px solid rgba(245,212,112,0.25)',
            }}
          >
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#F5D470', letterSpacing: '0.15em' }}>
              Comemore seu aniversário!
            </span>
          </a>
        </div>

        {/* Rodapé mobile */}
        <div
          className="flex flex-col items-center gap-5 p-4 mt-1"
          style={{ borderTop: '1px solid rgba(245,212,112,0.1)' }}
        >
          {/* Localização */}
          <div className="flex flex-col items-center" style={{ gap: 0 }}>
            <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,255,255,0.35)', marginBottom: '-8px' }}>Localização</p>
            <div className="flex items-center justify-center w-full" style={{ gap: '32px' }}>
              <a href="https://99app.com" target="_blank" rel="noopener noreferrer"
                className="transition-all active:opacity-70 flex items-center justify-center" style={{ width: 66 }}>
                <img src={logo99} alt="99" width="66" height="66" />
              </a>
              <a href="https://m.uber.com/ul/?action=setPickup&dropoff%5Blatitude%5D=-20.29547&dropoff%5Blongitude%5D=-40.29067&dropoff%5Bnickname%5D=R.+Manoel+Gon%C3%A7alves+Carneiro%2C+65&dropoff%5Bformatted_address%5D=Praia+do+Canto%2C+Vit%C3%B3ria+-+ES%2C+29055-740&utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer"
                className="transition-all active:opacity-70 flex items-center justify-center" style={{ width: 80 }}>
                <img src="https://cdn.simpleicons.org/uber/F5D470" width="80" height="80" style={{ objectFit: 'contain' }} alt="Uber" />
              </a>
              <a href="https://www.google.com/maps/dir/?api=1&destination=Rua+Manoel+Gon%C3%A7alves+Carneiro,+65,+Praia+do+Canto,+Vit%C3%B3ria,+ES,+29055-740" target="_blank" rel="noopener noreferrer"
                className="transition-all active:opacity-70 flex items-center justify-center" style={{ width: 66 }}>
                <img src="https://cdn.simpleicons.org/googlemaps/F5D470" width="42" height="42" alt="Maps" />
              </a>
            </div>
          </div>

          {/* Redes sociais */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>Redes sociais</p>
            <div className="flex gap-5 items-center justify-center">
              <a href="https://wa.me/+5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20tirar%20uma%20d%C3%BAvida!" target="_blank" rel="noopener noreferrer"
                className="transition-all active:opacity-70">
                <img src="https://cdn.simpleicons.org/whatsapp/F5D470" width="28" height="28" alt="WhatsApp" />
              </a>
              <a href="https://www.instagram.com/lagunvix/" target="_blank" rel="noopener noreferrer"
                className="transition-all active:opacity-70">
                <img src="https://cdn.simpleicons.org/instagram/F5D470" width="28" height="28" alt="Instagram" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 2 · LOUNGES ───────────────────────────────────────────────── */}
      <section className="reveal hidden md:block px-4 md:px-10 py-20" id="lounges" style={{ backgroundColor: '#140600' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Carrossel de fotos — ESQUERDA */}
            <div
              className="flex-1 relative overflow-hidden w-full"
              style={{
                borderRadius: '20px',
                minHeight: '420px',
                backgroundColor: '#2B0E00',
                border: '1px solid rgba(245,212,112,0.12)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
              }}
            >
              {loungePhotos.map((foto, i) => (
                <img
                  key={i}
                  src={foto}
                  alt="Lounge Lagun"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    opacity: i === carouselIndex ? 1 : 0,
                    transition: 'opacity 0.8s ease',
                  }}
                />
              ))}
              {/* Indicadores */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
                {loungePhotos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIndex(i)}
                    className="transition-all"
                    style={{
                      width: i === carouselIndex ? 20 : 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: i === carouselIndex ? '#F5D470' : 'rgba(245,212,112,0.35)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Info + cards — DIREITA */}
            <div className="flex-1 w-full">
              <span className="text-xs tracking-[0.35em] uppercase" style={{ color: '#F5D470' }}>
                Lounges & Reservas
              </span>
              <h2
                className="text-4xl md:text-5xl font-light mt-3 mb-5 leading-tight"
                style={{ fontFamily: "'Crimson Pro', serif", color: 'white' }}
              >
                Seu lounge, sua <em style={{ color: '#F5D470' }}>experiência.</em>
              </h2>
              <p className="text-sm leading-relaxed mb-8 max-w-md" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Reserve seu espaço com antecedência e garanta atendimento exclusivo durante toda a noite.
              </p>

              <div className="flex flex-col gap-4">
                {lounges.map((lounge) => (
                  <div
                    key={lounge.nome}
                    className="p-6 flex flex-col gap-3 group relative overflow-hidden"
                    style={{
                      border: lounge.destaque ? '1px solid rgba(245,212,112,0.55)' : '1px solid rgba(245,212,112,0.18)',
                      backgroundColor: lounge.destaque ? 'rgba(245,212,112,0.07)' : 'rgba(43,14,0,0.6)',
                      borderRadius: '16px',
                      boxShadow: lounge.destaque ? '0 0 32px rgba(245,212,112,0.12), 0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className={`font-semibold ${lounge.destaque ? 'text-lg' : 'text-base'} text-white`}>{lounge.nome}</h3>
                        <p className="text-xs tracking-widest" style={{ color: '#F5D470' }}>{lounge.capacidade}</p>
                      </div>
                      <span className={lounge.destaque ? 'text-2xl' : 'text-xl'} style={{ color: '#F5D470' }}>{lounge.icone}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: lounge.destaque ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)' }}>
                      {lounge.descricao}
                    </p>
                    <a
                      href="https://wa.me/+5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20garantir%20o%20meu%20lounge!"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs tracking-widest py-2.5 text-center transition-all self-start px-6 hover:opacity-90 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #F5D470 0%, #e8b830 50%, #F5D470 100%)',
                        color: '#1A0800',
                        borderRadius: '10px',
                        fontWeight: 700,
                        boxShadow: '0 0 20px rgba(245,212,112,0.45), 0 4px 14px rgba(245,212,112,0.25)',
                        border: '1px solid rgba(255,235,130,0.6)',
                      }}
                    >
                      RESERVAR
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 3 · ANIVERSÁRIO ───────────────────────────────────────────── */}
      <section className="reveal hidden md:block px-4 md:px-10 py-20" id="aniversario">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <span className="text-xs tracking-[0.35em] uppercase" style={{ color: '#F5D470' }}>
                Aniversário na Lagun
              </span>
              <h2
                className="text-4xl md:text-5xl font-light mt-3 mb-5 leading-tight"
                style={{ fontFamily: "'Crimson Pro', serif", color: 'white' }}
              >
                Comemore <em style={{ color: '#F5D470' }}>com a gente!</em>
              </h2>
              <p className="text-sm leading-relaxed mb-8 max-w-md" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Comemore seu aniversário em grande estilo. Nossa equipe cuida de cada detalhe:
                espaço decorado, serviço de mordomo exclusivo, bebidas premium e uma noite
                completamente dedicada ao seu momento especial.
              </p>

              <a
                href="https://wa.me/+5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20comemorar%20o%20meu%20anivers%C3%A1rio!"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-10 py-4 text-xs tracking-widest font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #F5D470 0%, #e8b830 50%, #F5D470 100%)',
                  color: '#1A0800',
                  borderRadius: '12px',
                  boxShadow: '0 0 24px rgba(245,212,112,0.5), 0 4px 16px rgba(245,212,112,0.3)',
                  border: '1px solid rgba(255,235,130,0.6)',
                }}
              >
                AGENDAR ANIVERSÁRIO
              </a>
            </div>

            <div
              className="flex-1 relative hidden md:flex overflow-hidden"
              style={{
                borderRadius: '20px',
                minHeight: '380px',
                boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
              }}
            >
              <img src={fotoAniversario} alt="Aniversário na Lagun" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(26,8,0,0.5) 0%, transparent 60%)' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 4 · SUPORTE ───────────────────────────────────────────────── */}
      <section
        className="reveal hidden md:block px-4 md:px-10 py-20"
        id="suporte"
        style={{ backgroundColor: '#140600', borderTop: '1px solid rgba(245,212,112,0.08)' }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-12">
            <span className="text-xs tracking-[0.35em] uppercase" style={{ color: '#F5D470' }}>
              Suporte & Contato
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(245,212,112,0.2)' }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <a
              href="https://wa.me/+5527997789988?text=Ol%C3%A1%2C%20gostaria%20de%20tirar%20uma%20d%C3%BAvida!"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-3 p-8 transition-all hover:border-amber-400/40"
              style={{
                border: '1px solid rgba(245,212,112,0.15)',
                backgroundColor: 'rgba(43,14,0,0.5)',
                borderRadius: '16px',
              }}
            >
              <span className="text-2xl">💬</span>
              <h3 className="font-semibold text-white">WhatsApp</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Fale com nossa equipe para dúvidas, reservas e informações sobre eventos.
              </p>
              <span className="text-xs tracking-widest mt-2" style={{ color: '#F5D470' }}>INICIAR CONVERSA →</span>
            </a>

            <a
              href="https://www.instagram.com/lagunvix/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-3 p-8 transition-all hover:border-amber-400/40"
              style={{
                border: '1px solid rgba(245,212,112,0.15)',
                backgroundColor: 'rgba(43,14,0,0.5)',
                borderRadius: '16px',
              }}
            >
              <span className="text-2xl">📸</span>
              <h3 className="font-semibold text-white">Instagram</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Acompanhe a programação, registros das noites e novidades da casa.
              </p>
              <span className="text-xs tracking-widest mt-2" style={{ color: '#F5D470' }}>@LAGUNVIX →</span>
            </a>

            <div
              className="flex flex-col gap-3 p-8"
              style={{
                border: '1px solid rgba(245,212,112,0.15)',
                backgroundColor: 'rgba(43,14,0,0.5)',
                borderRadius: '16px',
              }}
            >
              <span className="text-2xl">📍</span>
              <h3 className="font-semibold text-white">Localização</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                R. Manoel Gonçalves Carneiro, 65<br />
                Praia do Canto · Vitória, ES
              </p>
              <div className="flex gap-2 mt-1">
                <a
                  href="https://m.uber.com/ul/?action=setPickup&dropoff%5Blatitude%5D=-20.29547&dropoff%5Blongitude%5D=-40.29067&dropoff%5Bnickname%5D=R.+Manoel+Gon%C3%A7alves+Carneiro%2C+65&dropoff%5Bformatted_address%5D=Praia+do+Canto%2C+Vit%C3%B3ria+-+ES%2C+29055-740&utm_source=chatgpt.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center transition-all hover:opacity-80"
                  style={{ backgroundColor: '#000', borderRadius: '8px', width: '52px', height: '40px', padding: '8px' }}
                >
                  <img src={logoUber} alt="Uber" style={{ filter: 'invert(1)', width: '100%', height: 'auto', objectFit: 'contain' }} />
                </a>
                <a
                  href="https://99app.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center transition-all hover:opacity-80 overflow-hidden"
                  style={{ borderRadius: '8px', width: '52px', height: '40px' }}
                >
                  <img src={logo99Desktop} className="w-full h-full object-cover" alt="99" />
                </a>
                <a
                  href="https://www.google.com/maps/dir/?api=1&destination=Rua+Manoel+Gon%C3%A7alves+Carneiro,+65,+Praia+do+Canto,+Vit%C3%B3ria,+ES,+29055-740"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center transition-all hover:opacity-80"
                  style={{ backgroundColor: '#fff', borderRadius: '8px', width: '52px', height: '40px' }}
                >
                  <img src={logoMaps} width="28" height="28" alt="Google Maps" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer
        className="hidden md:flex px-4 md:px-10 py-8 flex-col md:flex-row items-center justify-between gap-4"
        style={{ borderTop: '1px solid rgba(245,212,112,0.08)' }}
      >
        <img src={palavraBranco} alt="LAGUN" className="h-4 w-auto opacity-30" />
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          © 2026 Lagun · Todos os direitos reservados
        </p>
        <div className="flex gap-6">
          <a href="#" className="text-xs hover:opacity-100 transition-opacity" style={{ color: 'rgba(255,255,255,0.3)' }}>Privacidade</a>
          <a href="#" className="text-xs hover:opacity-100 transition-opacity" style={{ color: 'rgba(255,255,255,0.3)' }}>Termos de Uso</a>
        </div>
      </footer>
    </div>
  );
}
