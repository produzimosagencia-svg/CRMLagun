// ============================================================================
// ig-link — redirect público dos links rastreáveis das automações do Instagram.
// GET /ig-link?s=<slug> → registra o clique e redireciona (302) para o destino.
// O site expõe como lagunvitoria.com.br/l/<slug> (rota /l/:slug → aqui).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FALLBACK = "https://www.instagram.com/lagunvix/";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("s") || url.pathname.split("/").pop() || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!slug) return Response.redirect(FALLBACK, 302);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ua = req.headers.get("user-agent") || "";
  // Pré-visualização de link (bots) não conta como clique.
  const isBot = /facebookexternalhit|Facebot|WhatsApp|TelegramBot|Twitterbot|Slackbot|LinkedInBot|bot|crawler|spider|preview/i.test(ua);
  let target: string | null = null;
  if (isBot) {
    const { data } = await supabase.from("ig_links").select("target_url").eq("slug", slug).maybeSingle();
    target = data?.target_url ?? null;
  } else {
    const { data } = await supabase.rpc("ig_register_click", { p_slug: slug, p_user_agent: ua, p_referer: req.headers.get("referer") || null });
    target = (data as string | null) ?? null;
  }
  return Response.redirect(target || FALLBACK, 302);
});
