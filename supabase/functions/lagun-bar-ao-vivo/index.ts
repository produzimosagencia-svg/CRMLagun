import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErroZig, diaSP, lerCasa } from "../_shared/casaLagun.ts";

// Bar ao vivo e Mapa da casa do app Lagun Administração (iPhone), 2026-11-19/20.
// Mesmo modelo da Tríade (app-interno, ação bar_ao_vivo, usado no Fantástico Mundo do Lukão).
// A leitura (Zig Bar, check-ins, lounges da noite) fica em _shared/casaLagun.ts, que a
// lagun-bar-push (Live Activity) também usa.
//
//   POST (Authorization: Bearer <sessão do app>) { forcar? }
//     → { ok, aberto, evento, noite, total (consumo do bar), recebido, bonus, foraDoBar, transacoes,
//         ticketMedio, ultimaHora, porHora, bares [B1 pista, B2 VIP], pdvs, produtos, lounges [L1..L6],
//         checkins, atualizadoEm, ultimaVenda, renovarEm }
//
// Quem pode: está em lagun_admin_acessos (cadastro do app) como administrador; parceiro só se tiver
// uma noite de hoje ou de ontem marcada. A conta de revisão da Apple não recebe dado real.
// Secrets: ZIG_ERP_TOKEN (nunca sai do servidor), ZIG_ERP_REDE, e os opcionais ZIG_ERP_LOJA,
// ZIG_ERP_LOJAS_FORA e ZIG_BAR_MAPA (qual PDV é o bar da pista ou o VIP). Cache de 25 s (forcar: 10 s).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Entre de novo no app." }, 401);
    const admin = sb();
    const { data: quem } = await admin.auth.getUser(jwt);
    const user = quem.user;
    if (!user) return json({ error: "Entre de novo no app." }, 401);
    if (user.app_metadata?.revisao === true) return json({ error: "Conta de demonstração: o bar real não aparece aqui." }, 403);
    const { data: acesso } = await admin.from("lagun_admin_acessos").select("cargo").eq("user_id", user.id).maybeSingle();
    if (!acesso) return json({ error: "O bar ao vivo é só para a administração da Lagun." }, 403);
    if (acesso.cargo !== "administrador") {
      const { data: noites } = await admin.from("lagun_admin_acesso_noites").select("lagun_events!inner(data)").eq("user_id", user.id)
        .gte("lagun_events.data", diaSP(-1)).lte("lagun_events.data", diaSP(0));
      if (!noites?.length) return json({ error: "O bar ao vivo aparece só na noite liberada para você." }, 403);
    }
    try {
      return json({ ok: true, ...(await lerCasa(admin, body.forcar === true ? 10_000 : 25_000)) });
    } catch (e) {
      if (e instanceof ErroZig) return json({ error: e.message }, e.status);
      throw e;
    }
  } catch (e) {
    console.error("[lagun-bar-ao-vivo]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
