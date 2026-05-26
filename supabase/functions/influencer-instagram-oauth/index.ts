/**
 * influencer-instagram-oauth
 *
 * Exchanges Facebook OAuth code for a token, finds the linked Instagram
 * Business/Creator account, and saves it to influencer_ig_accounts.
 *
 * Uses the new "API do Instagram com login do Facebook" (Basic Display deprecated Dec 2024).
 *
 * Body: { code: string, invite_token: string, redirect_uri: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IG_APP_ID     = Deno.env.get("IG_APP_ID")     ?? "";
const IG_APP_SECRET = Deno.env.get("META_AUTH") ?? Deno.env.get("IG_APP_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }

  const { code, invite_token, redirect_uri } = body ?? {};
  if (!code || !invite_token || !redirect_uri) {
    return json({ error: "Missing fields: code, invite_token, redirect_uri" }, 400);
  }

  // 1. Look up influencer by invite_token
  const { data: influencer, error: infErr } = await supabase
    .from("influencers")
    .select("id, full_name, status")
    .eq("invite_token", invite_token)
    .maybeSingle();

  if (infErr || !influencer) {
    return json({ error: "Invalid invite token" }, 400);
  }

  // 2. Exchange Facebook OAuth code → user access token
  const tokenUrl = new URL("https://graph.facebook.com/oauth/access_token");
  tokenUrl.searchParams.set("client_id",     IG_APP_ID);
  tokenUrl.searchParams.set("client_secret", IG_APP_SECRET);
  tokenUrl.searchParams.set("redirect_uri",  redirect_uri);
  tokenUrl.searchParams.set("code",          code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  console.log("Token exchange response:", JSON.stringify(tokenData));
  if (!tokenRes.ok || tokenData.error) {
    const errMsg = tokenData.error?.message ?? tokenData.error_description ?? JSON.stringify(tokenData);
    console.error("FB token exchange error:", errMsg);
    return json({ error: `Token exchange failed: ${errMsg}` });
  }

  const userAccessToken: string = tokenData.access_token;

  // 3. Extend to long-lived token (~60 days)
  const extendUrl = new URL("https://graph.facebook.com/oauth/access_token");
  extendUrl.searchParams.set("grant_type",        "fb_exchange_token");
  extendUrl.searchParams.set("client_id",         IG_APP_ID);
  extendUrl.searchParams.set("client_secret",     IG_APP_SECRET);
  extendUrl.searchParams.set("fb_exchange_token", userAccessToken);

  const extendRes  = await fetch(extendUrl.toString());
  const extendData = await extendRes.json();
  const longToken  = (extendData.access_token as string) ?? userAccessToken;
  const expiresIn  = (extendData.expires_in   as number) ?? 5183944; // ~60 days
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // 4. Get linked Instagram Business/Creator account via Facebook Pages
  //    GET /me/accounts → pages → instagram_business_account
  const pagesRes = await fetch(
    `https://graph.facebook.com/me/accounts?fields=instagram_business_account{id,username,followers_count,profile_picture_url,media_count}&access_token=${longToken}`
  );
  const pagesData = await pagesRes.json();

  if (!pagesRes.ok || pagesData.error) {
    console.error("FB pages fetch error:", JSON.stringify(pagesData));
    return json({ error: "Could not fetch Facebook Pages. Make sure your Instagram account is linked to a Facebook Page." }, 400);
  }

  // Find first page that has an IG business account linked
  const pages: any[] = pagesData.data ?? [];
  let igAccount: any = null;
  let pageAccessToken: string = longToken;

  for (const page of pages) {
    if (page.instagram_business_account) {
      igAccount = page.instagram_business_account;
      // Get page-specific access token for longer-lived operations
      const pageTokenRes = await fetch(
        `https://graph.facebook.com/${page.id}?fields=access_token&access_token=${longToken}`
      );
      const pageTokenData = await pageTokenRes.json();
      if (pageTokenData.access_token) pageAccessToken = pageTokenData.access_token;
      break;
    }
  }

  if (!igAccount) {
    return json({
      error: "Nenhuma conta Instagram Business/Creator encontrada vinculada a uma Página do Facebook. Conecte sua conta IG profissional a uma Página do Facebook e tente novamente.",
    }, 400);
  }

  const igUserId           = String(igAccount.id);
  const username           = igAccount.username            as string ?? "";
  const followersCount     = (igAccount.followers_count    as number) ?? 0;
  const mediaCount         = (igAccount.media_count        as number) ?? 0;
  const profilePictureUrl  = (igAccount.profile_picture_url as string) ?? null;

  // 5. Upsert influencer_ig_accounts (store page access token for API calls)
  const { error: igErr } = await supabase
    .from("influencer_ig_accounts")
    .upsert({
      influencer_id:       influencer.id,
      ig_user_id:          igUserId,
      username,
      access_token:        pageAccessToken,
      token_expires_at:    tokenExpiresAt,
      followers_count:     followersCount,
      media_count:         mediaCount,
      profile_picture_url: profilePictureUrl,
      status:              "active",
      connected_at:        new Date().toISOString(),
      last_synced_at:      null,
    }, { onConflict: "influencer_id" });

  if (igErr) {
    console.error("upsert influencer_ig_accounts:", igErr);
    return json({ error: "DB error saving IG account" }, 500);
  }

  // 6. Update influencer status → connected
  await supabase
    .from("influencers")
    .update({ status: "connected", connected_at: new Date().toISOString() })
    .eq("id", influencer.id);

  console.log(`Influencer ${influencer.full_name} (${influencer.id}) connected IG @${username} (${igUserId})`);

  return json({ ok: true, username, followers_count: followersCount });
});

// Always return 200 so the Supabase client doesn't swallow the error body
function json(data: any, _status = 200) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
