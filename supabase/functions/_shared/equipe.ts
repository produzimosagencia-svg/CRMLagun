import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { requireUser } from "./auth.ts";

/**
 * Exige alguém da EQUIPE da Lagun (ou o service role).
 *
 * requireUser sozinho não basta: o cliente do app de iPhone também é um usuário
 * authenticated (entra com o próprio telefone). Equipe = public.eh_equipe(uid):
 * cargo em user_roles (fora 'cliente' e 'ambassador') ou papel do Bastidor.
 * Auditoria de segurança de 2026-11-24.
 */
export async function requireEquipe(req: Request) {
  const base = await requireUser(req);
  if (!base.ok) return base;
  if (base.roles.includes("service_role")) return base;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("eh_equipe", { _user_id: base.userId });
  if (error || data !== true) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  return base;
}
