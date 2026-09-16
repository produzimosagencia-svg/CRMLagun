import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

// lagunvitoria.com.br/l/<slug> — link curto das automações do Instagram.
// Encaminha para a edge function ig-link, que registra o clique e redireciona.
export default function IgLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  useEffect(() => {
    const base = import.meta.env.VITE_SUPABASE_URL;
    if (!slug || !base) { window.location.replace('/'); return; }
    window.location.replace(`${base}/functions/v1/ig-link?s=${encodeURIComponent(slug)}`);
  }, [slug]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#11110f] px-6 text-center">
      <div role="status" aria-live="polite">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-white/10 border-t-[#E8C766]" />
        <p className="font-semibold text-white">Abrindo seu link…</p>
      </div>
    </main>
  );
}
