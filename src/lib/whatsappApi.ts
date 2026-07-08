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
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/whatsapp-api`;

export async function callWhatsappApi<T = any>(action: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: ANON_KEY,
  };

  const init: RequestInit = { headers };
  if (body !== undefined) {
    init.method = 'POST';
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(`${BASE}?action=${action}`, init);
  return resp.json();
}
