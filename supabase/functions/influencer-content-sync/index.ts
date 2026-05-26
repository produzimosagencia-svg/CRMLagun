/**
 * influencer-content-sync
 *
 * Fetches recent media from every active influencer IG account and
 * detects mentions of monitored accounts (e.g. @lagunvix).
 *
 * Call via: supabase.functions.invoke('influencer-content-sync')
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_MEDIA_PER_INFLUENCER = 50;

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Load monitored usernames
  const { data: monitored } = await supabase
    .from("influencer_monitored_accounts")
    .select("username")
    .eq("active", true);

  const monitoredUsernames: string[] = (monitored ?? []).map((r: any) => r.username.toLowerCase());

  // Load active IG accounts with their tokens
  const { data: accounts } = await supabase
    .from("influencer_ig_accounts")
    .select("id, influencer_id, ig_user_id, access_token, username, token_expires_at")
    .eq("status", "active");

  if (!accounts?.length) {
    return json({ ok: true, detected: 0, message: "No active accounts" });
  }

  let totalDetected = 0;

  for (const account of accounts) {
    // Check token expiry
    if (account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at).getTime();
      const now = Date.now();
      // If token expires within 10 days, try to refresh
      if (expiresAt - now < 10 * 24 * 60 * 60 * 1000) {
        await refreshToken(supabase, account);
      }
      if (expiresAt < now) {
        console.warn(`Token expired for influencer_id ${account.influencer_id}, skipping`);
        await supabase
          .from("influencer_ig_accounts")
          .update({ status: "expired" })
          .eq("id", account.id);
        continue;
      }
    }

    const detected = await syncAccount(supabase, account, monitoredUsernames);
    totalDetected += detected;

    // Update last_synced_at and refresh follower count
    await updateProfileStats(supabase, account);
  }

  return json({ ok: true, detected: totalDetected });
});

async function syncAccount(
  supabase: any,
  account: any,
  monitoredUsernames: string[]
): Promise<number> {
  const token = account.access_token;
  const igUserId = account.ig_user_id;

  // Fetch recent media via Graph API (new Instagram API uses graph.facebook.com)
  const mediaRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media?fields=id,media_type,permalink,thumbnail_url,caption,timestamp,like_count,comments_count&limit=${MAX_MEDIA_PER_INFLUENCER}&access_token=${token}`
  );
  if (!mediaRes.ok) {
    const err = await mediaRes.text();
    console.error(`media fetch for ${account.username}:`, err);
    return 0;
  }
  const mediaData = await mediaRes.json();
  const items: any[] = mediaData.data ?? [];

  let detected = 0;

  for (const item of items) {
    const caption: string = (item.caption ?? "").toLowerCase();

    // Check if caption mentions any monitored account
    const detectedMention = monitoredUsernames.find(u => caption.includes(`@${u}`)) ?? null;
    if (!detectedMention) continue;

    // Dedup by ig_media_id
    const { data: existing } = await supabase
      .from("influencer_detections")
      .select("id")
      .eq("ig_media_id", item.id)
      .maybeSingle();

    if (existing) continue;

    // Insert detection
    const { error } = await supabase.from("influencer_detections").insert({
      influencer_id:     account.influencer_id,
      ig_media_id:       item.id,
      media_type:        item.media_type ?? "IMAGE",
      permalink:         item.permalink ?? null,
      thumbnail_url:     item.thumbnail_url ?? null,
      caption:           item.caption ?? null,
      detected_mention:  detectedMention,
      likes:             item.like_count ?? 0,
      comments:          item.comments_count ?? 0,
      posted_at:         item.timestamp ?? null,
      synced_at:         new Date().toISOString(),
    });

    if (!error) {
      detected++;
      console.log(`Detection: @${account.username} → @${detectedMention} (${item.id})`);
    } else {
      console.error("insert influencer_detections:", error);
    }
  }

  return detected;
}

async function updateProfileStats(supabase: any, account: any) {
  try {
    const profileRes = await fetch(
      `https://graph.facebook.com/v21.0/${account.ig_user_id}?fields=followers_count,media_count,profile_picture_url&access_token=${account.access_token}`
    );
    if (!profileRes.ok) return;
    const profile = await profileRes.json();

    await supabase
      .from("influencer_ig_accounts")
      .update({
        followers_count:     profile.followers_count ?? account.followers_count,
        media_count:         profile.media_count ?? null,
        profile_picture_url: profile.profile_picture_url ?? null,
        last_synced_at:      new Date().toISOString(),
      })
      .eq("id", account.id);
  } catch (e) {
    console.error("updateProfileStats:", e);
  }
}

async function refreshToken(supabase: any, account: any) {
  try {
    // New Instagram API tokens are Facebook user tokens — they don't refresh the same way.
    // Just log; token renewal requires user to reconnect.
    console.log(`Token for @${account.username} near expiry — user needs to reconnect.`);
    const res = await fetch(
      `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${Deno.env.get("IG_APP_ID")}&client_secret=${Deno.env.get("IG_APP_SECRET")}&fb_exchange_token=${account.access_token}`
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.access_token) return;

    const expiresIn = (data.expires_in as number) ?? 5183944;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await supabase
      .from("influencer_ig_accounts")
      .update({ access_token: data.access_token, token_expires_at: tokenExpiresAt })
      .eq("id", account.id);

    console.log(`Token refreshed for @${account.username}`);
  } catch (e) {
    console.error("refreshToken:", e);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
