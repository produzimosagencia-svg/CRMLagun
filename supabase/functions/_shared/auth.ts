import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Helpers de autenticação/autorização compartilhados pelas edge functions.
 *
 * Contexto: `verify_jwt` (gateway do Supabase) só garante que o Bearer é um JWT
 * válido — e a ANON KEY também é um JWT válido e é PÚBLICA (vai no bundle do
 * frontend). Portanto, verify_jwt sozinho NÃO protege: qualquer um com a anon
 * key chama a função. A proteção real é validar aqui que quem chama é um USUÁRIO
 * autenticado (claim role='authenticated' + sub) e, quando aplicável, que possui
 * um cargo (user_roles) autorizado.
 *
 * Uso:
 *   const auth = await requireUser(req);
 *   if (!auth.ok) return auth.response;            // 401
 *   // auth.userId disponível
 *
 *   const auth = await requireRole(req, ["admin", "partner", "trafego"]);
 *   if (!auth.ok) return auth.response;            // 401/403
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export type AuthOk = { ok: true; userId: string; roles: string[] };
export type AuthFail = { ok: false; response: Response };

/** Exige um usuário autenticado real (rejeita chamadas com a anon key pública). */
export async function requireUser(req: Request): Promise<AuthOk | AuthFail> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, response: json(401, { error: "Unauthorized" }) };
  }
  const token = authHeader.replace("Bearer ", "");

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Caller interno/cron: chamadas com a service-role key são confiáveis.
  // (a service-role key é secreta e nunca vai para o frontend)
  if (token === SERVICE_ROLE) {
    return { ok: true, userId: "service_role", roles: ["service_role"] };
  }

  const { data, error } = await userClient.auth.getClaims(token);
  const claims = data?.claims;

  // Aceita usuário autenticado OU service_role. A ANON KEY tem role 'anon'
  // (pública, sem sub de usuário) — é justamente o que bloqueamos aqui.
  const role = claims?.role as string | undefined;
  if (error || !claims?.sub || (role !== "authenticated" && role !== "service_role")) {
    return { ok: false, response: json(401, { error: "Unauthorized" }) };
  }

  return { ok: true, userId: claims.sub as string, roles: role === "service_role" ? ["service_role"] : [] };
}

/** Exige usuário autenticado E com pelo menos um dos cargos informados. */
export async function requireRole(
  req: Request,
  allowed: string[],
): Promise<AuthOk | AuthFail> {
  const base = await requireUser(req);
  if (!base.ok) return base;

  // Caller interno/cron (service-role) é totalmente confiável — dispensa cargo.
  if (base.roles.includes("service_role")) return base;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: rows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", base.userId);

  const roles = (rows ?? []).map((r: { role: string }) => r.role);
  const authorized = roles.some((r) => allowed.includes(r));

  if (!authorized) {
    return { ok: false, response: json(403, { error: "Forbidden" }) };
  }

  return { ok: true, userId: base.userId, roles };
}
