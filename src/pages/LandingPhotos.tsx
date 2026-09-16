import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import flamingoSolo from '@/assets/flamingo-solo.png';
import palavraBranco from '@/assets/palavra-lagun-branco.png';

interface PhotoAlbum {
  id: string;
  title: string;
  event_date: string | null;
  url: string;
  cover_url: string | null;
}

function formatDate(date: string | null) {
  if (!date) return 'Registros da noite';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00`),
  );
}

export default function LandingPhotos() {
  const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (supabase as any)
      .from('landing_photo_links')
      .select('id, title, event_date, url, cover_url')
      .eq('is_visible', true)
      .order('display_order', { ascending: true })
      .order('event_date', { ascending: false })
      .then(({ data }: { data: PhotoAlbum[] | null }) => {
        setAlbums(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: '#1A0800', fontFamily: "'DM Sans', sans-serif" }}>
      <header className="max-w-6xl mx-auto flex items-center justify-between px-5 md:px-10 py-6 md:py-8" style={{ borderBottom: '1px solid rgba(245,212,112,0.12)' }}>
        <Link to="/" className="flex items-center gap-3 group" aria-label="Voltar para a Lagun">
          <img src={palavraBranco} alt="LAGUN" className="h-5 md:h-6 w-auto" />
          <span className="hidden sm:block h-4 w-px" style={{ backgroundColor: 'rgba(245,212,112,0.35)' }} />
          <span className="hidden sm:block text-[10px] uppercase tracking-[0.28em]" style={{ color: 'rgba(245,212,112,0.7)' }}>Fotos da noite</span>
        </Link>
        <Link to="/" className="text-[11px] uppercase tracking-[0.16em] transition-opacity hover:opacity-70" style={{ color: '#F5D470' }}>
          ← Voltar aos eventos
        </Link>
      </header>

      <section className="max-w-6xl mx-auto px-5 md:px-10 pt-16 md:pt-24 pb-20">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.35em] mb-4" style={{ color: '#F5D470' }}>Memórias da Lagun</p>
          <h1 className="text-5xl md:text-7xl font-light leading-[0.95]" style={{ fontFamily: "'Crimson Pro', serif" }}>
            Fotos da <em style={{ color: '#F5D470' }}>noite.</em>
          </h1>
          <p className="mt-6 text-sm md:text-base leading-relaxed max-w-lg" style={{ color: 'rgba(255,255,255,0.58)' }}>
            Encontre os registros de cada evento e reviva os melhores momentos com a gente.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-20" style={{ color: 'rgba(245,212,112,0.65)' }}>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F5D470]/20 border-t-[#F5D470]" />
            <span className="text-xs uppercase tracking-[0.18em]">Carregando álbuns</span>
          </div>
        ) : albums.length === 0 ? (
          <div className="mt-14 md:mt-20 rounded-2xl px-6 py-14 md:py-20 text-center" style={{ border: '1px solid rgba(245,212,112,0.15)', background: 'linear-gradient(135deg, rgba(245,212,112,0.06), rgba(43,14,0,0.5))' }}>
            <img src={flamingoSolo} alt="" className="h-20 w-auto mx-auto mb-6 opacity-80" />
            <h2 className="text-3xl font-light" style={{ fontFamily: "'Crimson Pro', serif" }}>Novos registros em breve.</h2>
            <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.48)' }}>As fotos das próximas noites aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-14 md:mt-20">
            {albums.map((album) => (
              <a key={album.id} href={album.url} target="_blank" rel="noopener noreferrer" className="group relative min-h-72 overflow-hidden p-6 flex flex-col justify-end transition-transform duration-300 hover:-translate-y-1" style={{ borderRadius: '18px', border: '1px solid rgba(245,212,112,0.18)', backgroundColor: '#2B0E00' }}>
                {album.cover_url ? <img src={album.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105" /> : <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 25% 15%, rgba(245,212,112,0.23), transparent 35%), linear-gradient(145deg, #3A1301, #160500)' }} />}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(18,5,0,0.94), rgba(18,5,0,0.08))' }} />
                <div className="relative">
                  <p className="text-[10px] uppercase tracking-[0.22em] mb-2" style={{ color: '#F5D470' }}>{formatDate(album.event_date)}</p>
                  <h2 className="text-3xl font-light leading-tight" style={{ fontFamily: "'Crimson Pro', serif" }}>{album.title}</h2>
                  <span className="mt-5 inline-flex text-[10px] font-bold uppercase tracking-[0.17em]" style={{ color: 'rgba(255,255,255,0.78)' }}>Abrir fotos →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
