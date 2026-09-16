// ============================================================================
// ig-oauth — conexão do @lagunvix via "Instagram API with Instagram Login".
// ----------------------------------------------------------------------------
// O token IGAA fica em ig_config (não em secret) para o cron renovar toda
// semana — foi um token em secret, sem renovação, que expirou em 24/07/2026.
//
//   GET  /ig-oauth              → redireciona pro consentimento do Instagram
//   GET  /ig-oauth/callback     → troca code por token longo, grava ig_config,
//                                 assina webhooks (comments+messages), backfill
//   POST {action:"refresh"}     → renova o token longo (cron semanal)
//   POST {action:"set_token"}   → admin cola um token gerado no painel da Meta
//   POST {action:"backfill"}    → preenche @/nome/foto das DMs antigas
//
// Segredos: IG_LOGIN_APP_ID / IG_LOGIN_APP_SECRET (Instagram App do painel
// da Meta → Instagram → "API setup with Instagram login"). Caem para
// IG_APP_ID / IG_APP_SECRET / META_AUTH se não existirem.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole, requireUser } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

const AUTH_BASE = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH     = "https://graph.instagram.com";
const GRAPH_V   = `${GRAPH}/v25.0`;
const SCOPES    = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";

const APP_ID     = () => (Deno.env.get("IG_LOGIN_APP_ID") ?? Deno.env.get("IG_APP_ID") ?? "").trim();
const APP_SECRET = () => (Deno.env.get("IG_LOGIN_APP_SECRET") ?? Deno.env.get("IG_APP_SECRET") ?? Deno.env.get("META_AUTH") ?? "").trim();
const REDIRECT   = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/ig-oauth/callback`;
const APP_URL    = () => Deno.env.get("APP_PUBLIC_URL") ?? "https://www.lagunvitoria.com.br";
const BACK_TO    = () => `${APP_URL()}/interno/automacoes`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function sb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function me(token: string) {
  const r = await fetch(`${GRAPH_V}/me?fields=user_id,id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`);
  return await r.json();
}

async function saveConfig(supabase: any, token: string, expiresIn: number, profile: any) {
  const igUserId = String(profile.user_id ?? profile.id ?? "");
  await supabase.from("ig_config").upsert({
    id: true,
    ig_user_id: igUserId,
    username: profile.username ?? null,
    profile_pic_url: profile.profile_picture_url ?? null,
    access_token: token,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  // Assina os webhooks da conta (comentários + mensagens) no app do Instagram.
  if (igUserId) {
    await fetch(`${GRAPH_V}/${igUserId}/subscribed_apps?subscribed_fields=comments,messages&access_token=${encodeURIComponent(token)}`, { method: "POST" })
      .then((r) => r.json()).then((d) => console.log("subscribed_apps:", JSON.stringify(d))).catch(() => {});
  }
  return igUserId;
}

// Preenche @/nome/foto das DMs antigas (hoje só tem o número do IGSID).
async function backfillProfiles(supabase: any, token: string): Promise<{ contatos: number; atualizados: number }> {
  const { data: rows } = await supabase
    .from("whatsapp_messages").select("phone")
    .eq("channel", "instagram").is("contact_username", null).limit(5000);
  const ids = [...new Set((rows ?? []).map((r: any) => String(r.phone)))].filter((p) => /^\d+$/.test(p));
  let atualizados = 0;
  const CONC = 6;
  for (let i = 0; i < ids.length; i += CONC) {
    await Promise.all(ids.slice(i, i + CONC).map(async (igsid) => {
      try {
        const r = await fetch(`${GRAPH_V}/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (d?.error || !d?.username) return;
        const { error } = await supabase.from("whatsapp_messages").update({
          contact_name: d.name ?? d.username,
          contact_username: d.username,
          contact_avatar: d.profile_pic ?? null,
        }).eq("phone", igsid).eq("channel", "instagram");
        if (!error) atualizados++;
        await supabase.from("ig_contacts").upsert({ igsid, username: d.username, updated_at: new Date().toISOString() }, { onConflict: "igsid" });
      } catch { /* segue */ }
    }));
  }
  console.log(`backfill: ${atualizados}/${ids.length} contatos`);
  return { contatos: ids.length, atualizados };
}

function inBackground(p: Promise<unknown>) {
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p.catch(() => {})); else p.catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const isCallback = url.pathname.endsWith("/callback");

  // ── POST: refresh (cron), set_token (admin), backfill (usuário) ──────────
  if (req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch { /* vazio */ }
    const action = body.action ?? "refresh";
    const supabase = sb();

    if (action === "refresh") {
      const { data: cfg } = await supabase.from("ig_config").select("access_token").maybeSingle();
      if (!cfg?.access_token) return json(200, { ok: false, reason: "sem token" });
      const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(cfg.access_token)}`);
      const d = await r.json();
      if (!r.ok || !d.access_token) return json(200, { ok: false, error: d.error?.message ?? "refresh falhou" });
      await supabase.from("ig_config").update({
        access_token: d.access_token,
        token_expires_at: new Date(Date.now() + (d.expires_in ?? 5184000) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", true);
      return json(200, { ok: true, expires_in: d.expires_in });
    }

    if (action === "set_token") {
      const auth = await requireRole(req, ["admin", "partner"]);
      if (!auth.ok) return auth.response;
      const token = String(body.token ?? "").trim();
      if (!token.startsWith("IGAA")) return json(400, { error: "Cole um token do Instagram (começa com IGAA)." });
      const profile = await me(token);
      if (profile?.error) return json(400, { error: profile.error.message });
      const igUserId = await saveConfig(supabase, token, 5184000, profile);
      inBackground(backfillProfiles(supabase, token));
      return json(200, { ok: true, username: profile.username, ig_user_id: igUserId });
    }

    if (action === "backfill") {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      const { data: cfg } = await supabase.from("ig_config").select("access_token").maybeSingle();
      if (!cfg?.access_token) return json(400, { error: "Instagram não conectado." });
      const result = await backfillProfiles(supabase, cfg.access_token);
      return json(200, { ok: true, ...result });
    }

    return json(400, { error: "action inválida" });
  }

  // ── GET: início do login ──────────────────────────────────────────────────
  if (req.method === "GET" && !isCallback) {
    if (!APP_ID()) return json(500, { error: "IG_LOGIN_APP_ID não configurado" });
    const authUrl = `${AUTH_BASE}?client_id=${APP_ID()}&redirect_uri=${encodeURIComponent(REDIRECT())}` +
      `&scope=${encodeURIComponent(SCOPES)}&response_type=code&force_reauth=true`;
    return Response.redirect(authUrl, 302);
  }

  // ── GET /callback: code → token longo → ig_config → webhooks → backfill ───
  if (req.method === "GET" && isCallback) {
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect(`${BACK_TO()}?erro=sem_code`, 302);
    try {
      const form = new FormData();
      form.append("client_id", APP_ID());
      form.append("client_secret", APP_SECRET());
      form.append("grant_type", "authorization_code");
      form.append("redirect_uri", REDIRECT());
      form.append("code", code);
      const shortRes = await fetch(TOKEN_URL, { method: "POST", body: form });
      const shortJson = await shortRes.json();
      if (!shortRes.ok || !shortJson.access_token) {
        console.error("token curto:", JSON.stringify(shortJson));
        return Response.redirect(`${BACK_TO()}?erro=${encodeURIComponent(shortJson.error_message ?? "token_curto")}`, 302);
      }
      const longRes = await fetch(`${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET()}&access_token=${shortJson.access_token}`);
      const longJson = await longRes.json();
      const longToken = longJson.access_token ?? shortJson.access_token;
      const expiresIn = longJson.expires_in ?? 5184000;
      const supabase = sb();
      const profile = await me(longToken);
      await saveConfig(supabase, longToken, expiresIn, profile);
      inBackground(backfillProfiles(supabase, longToken));
      return Response.redirect(`${BACK_TO()}?conectado=1`, 302);
    } catch (e) {
      return Response.redirect(`${BACK_TO()}?erro=${encodeURIComponent(String(e))}`, 302);
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
