import { supabase } from '@/integrations/supabase/client';

/** Chama a edge function instagram-api com a sessão da pessoa logada. */
export async function chamarInstagram(action: string, params: Record<string, string> = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error('Sessão expirada. Entre novamente.');
  const q = new URLSearchParams({ action, ...params });
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-api?${q}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || j.error || 'Falha ao consultar o Instagram.');
  return j;
}

export interface ContaInstagram { id: string; username: string; name?: string; profile_picture_url?: string; followers_count?: number; media_count?: number }

/** Contas profissionais ligadas às Páginas do token (hoje só @lagunvix). */
export async function contasInstagram(): Promise<ContaInstagram[]> {
  const r = await chamarInstagram('accounts');
  return ((r.data || []) as any[])
    .filter((p) => p.instagram_business_account)
    .map((p) => ({ ...p.instagram_business_account, name: p.name || p.instagram_business_account.name }));
}

export interface PublicacaoInstagram {
  id: string; caption?: string; media_type?: string; permalink?: string;
  thumbnail_url?: string; media_url?: string; timestamp: string;
  like_count?: number; comments_count?: number;
}

export async function publicacoesInstagram(igId: string, limit = 50): Promise<PublicacaoInstagram[]> {
  const r = await chamarInstagram('media', { ig_id: igId, limit: String(limit) });
  return (r.data || []) as PublicacaoInstagram[];
}

export interface ComentarioInstagram {
  id: string; text: string; username?: string;
  from?: { id?: string; username?: string };
  user?: { id?: string; username?: string } | string;
  timestamp: string; like_count?: number;
}

export async function comentariosInstagram(igId: string, mediaId: string): Promise<ComentarioInstagram[]> {
  const r = await chamarInstagram('comments', { ig_id: igId, media_id: mediaId, limit: '100' });
  return (r.data || []) as ComentarioInstagram[];
}

export function autorDoComentario(c: ComentarioInstagram): string | null {
  if (c.username) return c.username;
  if (c.from?.username) return c.from.username;
  if (typeof c.user === 'object' && c.user?.username) return c.user.username;
  if (typeof c.user === 'string' && c.user.trim()) return c.user;
  return null;
}

export const nf = new Intl.NumberFormat('pt-BR');
export const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
export const dataHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace('.', '');
