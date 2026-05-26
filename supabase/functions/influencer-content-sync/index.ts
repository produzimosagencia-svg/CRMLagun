/**
 * influencer-content-sync
 *
 * Fetches recent media from every active influencer IG account,
 * detects mentions of monitored accounts (@lagunvix), fetches insights
 * (reach, saves, shares), calculates the scoring system and updates
 * each influencer's total score + level.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_MEDIA_PER_INFLUENCER = 50;

// ── Scoring system ────────────────────────────────────────────────────────────

function reachPoints(mediaType: string, reach: number): number {
  if (mediaType === "VIDEO") {
    if (reach >= 50000) return 100;
    if (reach >= 20000) return 60;
    if (reach >= 5000)  return 30;
    return 10;
  }
  if (mediaType === "STORY") {
    if (reach >= 5000) return 30;
    if (reach >= 2000) return 18;
    if (reach >= 500)  return 8;
    return 2;
  }
  // IMAGE / CAROUSEL_ALBUM (feed post)
  if (reach >= 20000) return 60;
  if (reach >= 8000)  return 35;
  if (reach >= 2000)  return 15;
  return 5;
}

function creationPoints(mediaType: string): number {
  if (mediaType === "VIDEO") return 30;   // Reel
  if (mediaType === "STORY") return 10;
  return 20;                              // IMAGE / CAROUSEL
}

function engagementPoints(saves: number, shares: number, comments: number, likes: number): number {
  return saves * 0.5 + shares * 0.5 + comments * 0.2 + likes * 0.05;
}

function calcDetectionScore(
  mediaType: string,
  reach: number,
  likes: number,
  comments: number,
  saves: number,
  shares: number
): number {
  return (
    creationPoints(mediaType) +
    reachPoints(mediaType, reach) +
    engagementPoints(saves, shares, comments, likes)
  );
}

function calcLevel(score: number): string {
  if (score >= 900) return "diamante";
  if (score >= 600) return "ouro";
  if (score >= 300) return "prata";
  return "bronze";
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Load monitored usernames (e.g. lagunvix)
  const { data: monitored } = await supabase
    .from("influencer_monitored_accounts")
    .select("username")
    .eq("active", true);

  const monitoredUsernames: string[] = (monitored ?? []).map((r: any) => r.username.toLowerCase());

  // Load active IG accounts
  const { data: accounts } = await supabase
    .from("influencer_ig_accounts")
    .select("id, influencer_id, ig_user_id, access_token, username, token_expires_at, followers_count")
    .eq("status", "active");

  if (!accounts?.length) {
    return json({ ok: true, detected: 0, message: "No active accounts" });
  }

  let totalDetected = 0;

  for (const account of accounts) {
    // Auto-refresh token if expiring within 10 days
    if (account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at).getTime();
      if (expiresAt - Date.now() < 10 * 24 * 60 * 60 * 1000) {
        await refreshToken(supabase, account);
      }
      if (expiresAt < Date.now()) {
        console.warn(`Token expired for @${account.username}`);
        await supabase.from("influencer_ig_accounts").update({ status: "expired" }).eq("id", account.id);
        continue;
      }
    }

    const detected = await syncAccount(supabase, account, monitoredUsernames);
    totalDetected += detected;

    // Update profile stats + recalculate total score
    await updateProfileStats(supabase, account);
    await recalcScore(supabase, account.influencer_id);
  }

  return json({ ok: true, detected: totalDetected });
});

// ── Sync one account ──────────────────────────────────────────────────────────

async function syncAccount(supabase: any, account: any, monitoredUsernames: string[]): Promise<number> {
  const { ig_user_id: igUserId, access_token: token } = account;

  // Fetch recent media
  const mediaRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media` +
    `?fields=id,media_type,permalink,thumbnail_url,caption,timestamp,like_count,comments_count` +
    `&limit=${MAX_MEDIA_PER_INFLUENCER}&access_token=${token}`
  );

  if (!mediaRes.ok) {
    console.error(`media fetch @${account.username}:`, await mediaRes.text());
    return 0;
  }

  const items: any[] = (await mediaRes.json()).data ?? [];
  let detected = 0;

  for (const item of items) {
    const caption: string = (item.caption ?? "").toLowerCase();
    // Match either @username or plain keyword (e.g. "ingressos", "ingresso")
    const detectedMention = monitoredUsernames.find(u => caption.includes(u)) ?? null;
    if (!detectedMention) continue;

    // Dedup — check if already exists
    const { data: existing } = await supabase
      .from("influencer_detections")
      .select("id, reach")
      .eq("ig_media_id", item.id)
      .maybeSingle();

    // Fetch insights for this post
    const { reach, saves, shares } = await fetchInsights(igUserId, item.id, item.media_type, token);
    const likes    = item.like_count     ?? 0;
    const comments = item.comments_count ?? 0;

    if (existing) {
      // Update metrics if reach was zero (e.g. insights permission just granted)
      if ((existing.reach ?? 0) === 0 && reach > 0) {
        await supabase.from("influencer_detections").update({
          reach, saves, shares, likes, comments, synced_at: new Date().toISOString(),
        }).eq("id", existing.id);
        console.log(`Updated metrics for ${item.id}: reach=${reach}`);
      }
      continue;
    }

    const score = calcDetectionScore(item.media_type, reach, likes, comments, saves, shares);

    const { error } = await supabase.from("influencer_detections").insert({
      influencer_id:    account.influencer_id,
      ig_media_id:      item.id,
      media_type:       item.media_type ?? "IMAGE",
      permalink:        item.permalink ?? null,
      thumbnail_url:    item.thumbnail_url ?? null,
      caption:          item.caption ?? null,
      detected_mention: detectedMention,
      reach,
      likes,
      comments,
      saves,
      shares,
      posted_at:        item.timestamp ?? null,
      synced_at:        new Date().toISOString(),
    });

    if (!error) {
      detected++;
      console.log(`Detection: @${account.username} → @${detectedMention} score=${score.toFixed(1)} (${item.id})`);
    }
  }

  return detected;
}

// ── Fetch insights (reach, saves, shares) ────────────────────────────────────

async function fetchInsights(
  igUserId: string,
  mediaId: string,
  mediaType: string,
  token: string
): Promise<{ reach: number; saves: number; shares: number }> {
  try {
    const metrics = mediaType === "STORY"
      ? "reach,exits,replies"
      : "reach,saved,shares,total_interactions";

    const url = `https://graph.facebook.com/v21.0/${mediaId}/insights?metric=${metrics}&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();

    console.log(`Insights for ${mediaId} (${mediaType}):`, JSON.stringify(data));

    if (!res.ok || data.error) {
      console.error(`Insights error for ${mediaId}:`, JSON.stringify(data.error ?? data));
      return { reach: 0, saves: 0, shares: 0 };
    }

    const byName: Record<string, number> = {};
    for (const m of data.data ?? []) {
      byName[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
    }

    console.log(`Metrics extracted:`, JSON.stringify(byName));

    return {
      reach:  byName["reach"]  ?? 0,
      saves:  byName["saved"]  ?? 0,
      shares: byName["shares"] ?? 0,
    };
  } catch (e) {
    console.error("fetchInsights exception:", e);
    return { reach: 0, saves: 0, shares: 0 };
  }
}

// ── Recalculate total monthly score ──────────────────────────────────────────

async function recalcScore(supabase: any, influencerId: string) {
  // Sum score of all detections for this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: detections } = await supabase
    .from("influencer_detections")
    .select("media_type, reach, likes, comments, saves, shares")
    .eq("influencer_id", influencerId)
    .gte("posted_at", startOfMonth.toISOString());

  let totalScore = 0;
  for (const d of detections ?? []) {
    totalScore += calcDetectionScore(
      d.media_type, d.reach ?? 0, d.likes ?? 0,
      d.comments ?? 0, d.saves ?? 0, d.shares ?? 0
    );
  }

  const level = calcLevel(totalScore);

  await supabase
    .from("influencers")
    .update({ score: totalScore, level, score_updated_at: new Date().toISOString() })
    .eq("id", influencerId);
}

// ── Update profile stats ──────────────────────────────────────────────────────

async function updateProfileStats(supabase: any, account: any) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${account.ig_user_id}` +
      `?fields=followers_count,media_count,profile_picture_url&access_token=${account.access_token}`
    );
    if (!res.ok) return;
    const p = await res.json();
    await supabase.from("influencer_ig_accounts").update({
      followers_count:     p.followers_count     ?? account.followers_count,
      media_count:         p.media_count         ?? null,
      profile_picture_url: p.profile_picture_url ?? null,
      last_synced_at:      new Date().toISOString(),
    }).eq("id", account.id);
  } catch (e) {
    console.error("updateProfileStats:", e);
  }
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshToken(supabase: any, account: any) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${Deno.env.get("IG_APP_ID")}` +
      `&client_secret=${Deno.env.get("META_AUTH") ?? Deno.env.get("IG_APP_SECRET")}` +
      `&fb_exchange_token=${account.access_token}`
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.access_token) return;
    const expiresAt = new Date(Date.now() + ((data.expires_in ?? 5183944) * 1000)).toISOString();
    await supabase.from("influencer_ig_accounts")
      .update({ access_token: data.access_token, token_expires_at: expiresAt })
      .eq("id", account.id);
    console.log(`Token refreshed for @${account.username}`);
  } catch (e) {
    console.error("refreshToken:", e);
  }
}

function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
