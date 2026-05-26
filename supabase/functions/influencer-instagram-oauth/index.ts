/**
 * influencer-instagram-oauth
 *
 * Exchanges Instagram OAuth code for a long-lived token and saves the
 * IG account linked to the influencer identified by their invite_token.
 *
 * Body: { code: string, invite_token: string, redirect_uri: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IG_APP_ID     = Deno.env.get("IG_APP_ID")     ?? "";
const IG_APP_SECRET = Deno.env.get("IG_APP_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
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

  // 2. Exchange code → short-lived token
  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     IG_APP_ID,
      client_secret: IG_APP_SECRET,
      grant_type:    "authorization_code",
      redirect_uri,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error_type) {
    console.error("IG token exchange error:", JSON.stringify(tokenData));
    return json({ error: tokenData.error_message ?? "Token exchange failed" }, 400);
  }

  const shortToken = tokenData.access_token as string;
  const igUserId   = String(tokenData.user_id);

  // 3. Exchange short-lived → long-lived token (60-day)
  const longRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortToken}`
  );
  const longData = await longRes.json();
  const longToken = (longData.access_token as string) ?? shortToken;
  const expiresIn = (longData.expires_in as number) ?? 5183944; // ~60 days

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // 4. Fetch IG profile
  const profileRes = await fetch(
    `https://graph.instagram.com/${igUserId}?fields=id,username,followers_count,media_count,profile_picture_url&access_token=${longToken}`
  );
  const profile = await profileRes.json();
  if (!profileRes.ok) {
    console.error("IG profile fetch error:", JSON.stringify(profile));
    return json({ error: "Could not fetch Instagram profile" }, 400);
  }

  const username            = profile.username            as string;
  const followersCount      = (profile.followers_count   as number) ?? 0;
  const mediaCount          = (profile.media_count       as number) ?? 0;
  const profilePictureUrl   = (profile.profile_picture_url as string) ?? null;

  // 5. Upsert influencer_ig_accounts
  const { error: igErr } = await supabase
    .from("influencer_ig_accounts")
    .upsert({
      influencer_id:       influencer.id,
      ig_user_id:          igUserId,
      username,
      access_token:        longToken,
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

  console.log(`Influencer ${influencer.full_name} (${influencer.id}) connected IG @${username}`);

  return json({ ok: true, username, followers_count: followersCount });
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
