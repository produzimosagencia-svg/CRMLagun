import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

interface IGAccount {
  id: string;
  creator_id: string;
  instagram_user_id: string;
  username: string;
  access_token: string;
}

interface TargetAccount {
  id: string;
  username: string;
}

const IG_API = "https://graph.instagram.com/v23.0";

function detectMention(text: string, targets: TargetAccount[]): TargetAccount | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const t of targets) {
    const tag = `@${t.username.toLowerCase()}`;
    if (lower.includes(tag)) return t;
  }
  return null;
}

async function fetchMedia(token: string, igUserId: string) {
  const url = `${IG_API}/${igUserId}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count&limit=50&access_token=${token}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || "Media fetch failed");
  return data.data || [];
}

async function fetchStories(token: string, igUserId: string) {
  const url = `${IG_API}/${igUserId}/stories?fields=id,media_type,media_url,permalink,thumbnail_url,timestamp&access_token=${token}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.data || [];
}

async function fetchInsights(token: string, mediaId: string, mediaType: string) {
  const metrics = mediaType === "VIDEO" || mediaType === "REELS"
    ? "reach,impressions,plays,likes,comments,saved"
    : "reach,impressions,likes,comments,saved";
  const url = `${IG_API}/${mediaId}/insights?metric=${metrics}&access_token=${token}`;
  const resp = await fetch(url);
  if (!resp.ok) return {};
  const data = await resp.json();
  const out: Record<string, number> = {};
  for (const m of data.data || []) {
    out[m.name] = m.values?.[0]?.value || 0;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar contas IG ativas
    const { data: accounts } = await supabase
      .from("creator_instagram_accounts")
      .select("id, creator_id, instagram_user_id, username, access_token")
      .eq("status", "active");

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No active accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar @s alvo ativos com vínculo a evento
    const { data: targets } = await supabase
      .from("promotion_target_accounts")
      .select("id, username")
      .eq("active", true);

    const { data: eventTargets } = await supabase
      .from("event_promotion_targets")
      .select("event_id, target_account_id");

    // Mapa target_id -> primeiro evento associado (simplificado)
    const targetToEvent: Record<string, string> = {};
    for (const et of eventTargets || []) {
      if (!targetToEvent[et.target_account_id]) {
        targetToEvent[et.target_account_id] = et.event_id;
      }
    }

    let totalDetected = 0;
    let totalErrors = 0;

    for (const acc of (accounts as IGAccount[])) {
      try {
        const [media, stories] = await Promise.all([
          fetchMedia(acc.access_token, acc.instagram_user_id).catch(() => []),
          fetchStories(acc.access_token, acc.instagram_user_id).catch(() => []),
        ]);

        const allItems = [
          ...media.map((m: Record<string, unknown>) => ({ ...m, _type: "post" })),
          ...stories.map((s: Record<string, unknown>) => ({ ...s, _type: "story" })),
        ];

        for (const item of allItems) {
          const caption = String(item.caption || "");
          const target = detectMention(caption, (targets as TargetAccount[]) || []);
          if (!target) continue;

          const insights = await fetchInsights(
            acc.access_token,
            String(item.id),
            String(item.media_type || "")
          );

          await supabase.from("creator_content_detections").upsert({
            instagram_account_id: acc.id,
            creator_id: acc.creator_id,
            event_id: targetToEvent[target.id] || null,
            target_account_id: target.id,
            media_id: String(item.id),
            media_type: String(item.media_type || item._type),
            permalink: item.permalink || null,
            thumbnail_url: item.thumbnail_url || item.media_url || null,
            caption: caption.slice(0, 2000),
            detected_mention: `@${target.username}`,
            reach: insights.reach || 0,
            impressions: insights.impressions || 0,
            likes: insights.likes || item.like_count || 0,
            comments: insights.comments || item.comments_count || 0,
            saves: insights.saved || 0,
            views: insights.plays || 0,
            posted_at: item.timestamp || null,
            raw_payload: item as Record<string, unknown>,
          }, { onConflict: "instagram_account_id,media_id,target_account_id" });

          totalDetected++;
        }

        await supabase
          .from("creator_instagram_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", acc.id);
      } catch (e) {
        console.error(`Error syncing ${acc.username}:`, e);
        totalErrors++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      accounts_synced: accounts.length,
      detections_upserted: totalDetected,
      errors: totalErrors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
