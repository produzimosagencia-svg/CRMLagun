import { supabase } from '@/integrations/supabase/client';

/**
 * Cliente único para a edge function `whatsapp-api`.
 *
 * Segurança: a função exige um usuário autenticado (bloqueia a anon key
 * pública). Por isso enviamos o access_token da sessão no Authorization,
 * mantendo a anon key apenas no header `apikey` (exigido pelo gateway).
 * Centralizar aqui garante que todo call-site fica autenticado por padrão.
 *
 * Obs.: `get_media` é servido via <img> (sem header) e continua público na
 * função — não passa por aqui.
 */
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID
  || (import.meta.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1];
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-api`;

export async function callWhatsappApi<T = any>(
  action: string,
  body?: unknown,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const request = async (token: string) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      };
      const init: RequestInit = { headers, signal: controller.signal };
      if (body !== undefined) {
        init.method = 'POST';
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return fetch(`${BASE}?action=${action}`, init);
    };

    const sessionResult = await supabase.auth.getSession();
    let session = sessionResult.data.session;
    if (sessionResult.error || !session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
      if (refreshed.error || !session?.access_token) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('Sua sessão expirou. Entre novamente para consultar a API do WhatsApp.');
      }
    }

    let resp = await request(session.access_token);
    if (resp.status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('Sua sessão expirou. Entre novamente para consultar a API do WhatsApp.');
      }
      resp = await request(refreshed.data.session.access_token);
    }

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.error || `WhatsApp API: HTTP ${resp.status}`);
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
