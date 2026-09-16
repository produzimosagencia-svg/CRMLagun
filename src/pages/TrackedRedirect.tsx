import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function TrackedRedirect() {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    const base = import.meta.env.VITE_SUPABASE_URL;
    if (!token || !base) {
      window.location.replace('/?link_invalido=1');
      return;
    }
    window.location.replace(`${base}/functions/v1/wa-track?token=${encodeURIComponent(token)}`);
  }, [token]);

  return <main className="flex min-h-screen items-center justify-center bg-[#11110f] px-6 text-center">
    <div role="status" aria-live="polite">
      <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-white/10 border-t-[#E8C766]" />
      <p className="font-semibold text-white">Abrindo seu acesso…</p>
    </div>
  </main>;
}
