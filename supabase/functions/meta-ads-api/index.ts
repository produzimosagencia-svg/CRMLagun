import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

function saoPauloDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Os presets `last_Nd` da Meta consideram dias completos anteriores e podem
// deixar hoje de fora. Para os períodos móveis do CRM, usamos um intervalo
// inclusivo que sempre termina no dia atual da conta (São Paulo).
function dateFilterForPreset(datePreset: string): string {
  const rollingDays: Record<string, number> = {
    last_7d: 7,
    last_14d: 14,
    last_30d: 30,
    last_90d: 90,
  };
  const days = rollingDays[datePreset];
  if (!days) return `date_preset=${encodeURIComponent(datePreset)}`;

  const until = saoPauloDate();
  const anchor = new Date(`${until}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - (days - 1));
  const since = saoPauloDate(anchor);
  return `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("META_ADS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "META_ADS_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    let result;

    switch (action) {
      case "accounts": {
        const resp = await fetch(
          `${GRAPH_API}/me/adaccounts?fields=id,name,account_id,currency,account_status&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "campaigns": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) {
          result = { error: "account_id is required" };
          break;
        }
        // Mostra TODAS as campanhas que já rodaram (ativas, pausadas e arquivadas)
        // — modo somente-visualização por enquanto.
        const resp = await fetch(
          `${GRAPH_API}/act_${accountId}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ARCHIVED"]}]&limit=200&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "campaign_budgets": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) {
          result = { error: "account_id is required" };
          break;
        }

        const [campaignsResp, adsetsResp] = await Promise.all([
          fetch(
            `${GRAPH_API}/act_${accountId}/campaigns?fields=id,name,objective,daily_budget,lifetime_budget&limit=500&access_token=${token}`
          ),
          fetch(
            `${GRAPH_API}/act_${accountId}/adsets?fields=id,campaign_id,daily_budget,lifetime_budget,effective_status&limit=500&access_token=${token}`
          ),
        ]);
        const [campaignsData, adsetsData] = await Promise.all([
          campaignsResp.json(),
          adsetsResp.json(),
        ]);

        if (campaignsData.error) {
          result = campaignsData;
          break;
        }
        if (adsetsData.error) {
          result = adsetsData;
          break;
        }

        const adsetDailyByCampaign: Record<string, number> = {};
        for (const adset of adsetsData.data || []) {
          const dailyBudget = Number(adset.daily_budget || 0);
          if (dailyBudget > 0 && adset.campaign_id) {
            adsetDailyByCampaign[adset.campaign_id] =
              (adsetDailyByCampaign[adset.campaign_id] || 0) + dailyBudget;
          }
        }

        result = {
          data: (campaignsData.data || []).map((campaign: any) => ({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            objective: campaign.objective,
            // Meta retorna valores monetários em centavos.
            daily_budget: Number(campaign.daily_budget || 0) || adsetDailyByCampaign[campaign.id] || 0,
            budget_source: Number(campaign.daily_budget || 0) > 0 ? "campaign" : "adsets",
          })),
        };
        break;
      }

      case "insights": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) {
          result = { error: "account_id is required" };
          break;
        }
        const datePreset = url.searchParams.get("date_preset") || "last_30d";
        const level = url.searchParams.get("level") || "campaign";

        const fields = [
          "campaign_name",
          "campaign_id",
          "objective",
          "spend",
          "impressions",
          "reach",
          "clicks",
          "cpc",
          "cpm",
          "ctr",
          "actions",
          "action_values",
          "purchase_roas",
          "cost_per_action_type",
        ].join(",");

        const dateFilter = dateFilterForPreset(datePreset);
        const resp = await fetch(
          `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&${dateFilter}&level=${level}&limit=500&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "account_insights": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) {
          result = { error: "account_id is required" };
          break;
        }
        const datePreset = url.searchParams.get("date_preset") || "last_30d";
        const since = url.searchParams.get("since");
        const until = url.searchParams.get("until");

        const fields = [
          "spend",
          "impressions",
          "reach",
          "clicks",
          "actions",
          "action_values",
          "purchase_roas",
        ].join(",");

        const dateFilter = since && until
          ? `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`
          : dateFilterForPreset(datePreset);
        const resp = await fetch(
          `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&${dateFilter}&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "ad_creatives": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) {
          result = { error: "account_id is required" };
          break;
        }
        const datePreset = url.searchParams.get("date_preset") || "last_30d";
        const dateFilter = dateFilterForPreset(datePreset);

        // Fetch ad-level insights
        const fields = [
          "ad_name",
          "ad_id",
          "campaign_name",
          "campaign_id",
          "spend",
          "impressions",
          "reach",
          "clicks",
          "cpc",
          "cpm",
          "ctr",
          "actions",
          "action_values",
          "purchase_roas",
        ].join(",");

        // Use filtering to include all ad statuses (ACTIVE, PAUSED, ARCHIVED)
        const insightsUrl = `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&${dateFilter}&level=ad&limit=500&filtering=[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED","ARCHIVED","CAMPAIGN_PAUSED","ADSET_PAUSED"]}]&access_token=${token}`;
        console.log("[ad_creatives] Fetching insights URL:", insightsUrl.replace(token, "TOKEN_HIDDEN"));
        
        const insightsResp = await fetch(insightsUrl);
        const insightsData = await insightsResp.json();

        console.log("[ad_creatives] Insights response data count:", insightsData.data?.length ?? 0);
        if (insightsData.error) {
          console.error("[ad_creatives] Insights error:", JSON.stringify(insightsData.error));
        }

        if (!insightsData.data || insightsData.error) {
          // If filtering fails, try without filtering
          console.log("[ad_creatives] Retrying without filtering...");
          const retryUrl = `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&${dateFilter}&level=ad&limit=500&access_token=${token}`;
          const retryResp = await fetch(retryUrl);
          const retryData = await retryResp.json();
          console.log("[ad_creatives] Retry response data count:", retryData.data?.length ?? 0);
          
          if (!retryData.data || retryData.error) {
            result = retryData;
            break;
          }
          // Use retry data
          insightsData.data = retryData.data;
        }

        if (insightsData.data.length === 0) {
          // Try with maximum date range as fallback
          console.log("[ad_creatives] Empty data, trying maximum date range...");
          const fallbackUrl = `${GRAPH_API}/act_${accountId}/insights?fields=${fields}&date_preset=maximum&level=ad&limit=200&access_token=${token}`;
          const fallbackResp = await fetch(fallbackUrl);
          const fallbackData = await fallbackResp.json();
          console.log("[ad_creatives] Fallback data count:", fallbackData.data?.length ?? 0);
          
          if (fallbackData.data && fallbackData.data.length > 0) {
            insightsData.data = fallbackData.data;
          } else {
            result = { data: [] };
            break;
          }
        }

        // Get unique ad IDs to fetch their creatives
        const adIds = [...new Set(insightsData.data.map((d: any) => d.ad_id))];
        console.log("[ad_creatives] Unique ad IDs to fetch:", adIds.length);
        
        // Fetch creative details for each ad (batch of 50)
        const creativeMap: Record<string, any> = {};
        for (let i = 0; i < adIds.length; i += 50) {
          const batch = adIds.slice(i, i + 50);
          const batchPromises = batch.map(async (adId: string) => {
            try {
              const adResp = await fetch(
                `${GRAPH_API}/${adId}?fields=creative{thumbnail_url,image_url,image_hash,video_id,object_story_spec,asset_feed_spec,effective_object_story_id}&access_token=${token}`
              );
              const adData = await adResp.json();
              if (adData.creative) {
                const videoId = adData.creative.video_id || 
                  adData.creative.object_story_spec?.video_data?.video_id || null;
                const hasVideo = !!videoId;

                let videoUrl = null;
                let highResolutionPreview = adData.creative.image_url || null;
                if (videoId) {
                  try {
                    const vidResp = await fetch(
                      `${GRAPH_API}/${videoId}?fields=source,permalink_url,embed_html,picture,thumbnails&access_token=${token}`
                    );
                    const vidData = await vidResp.json();
                    console.log(`[ad_creatives] Video ${videoId}:`, JSON.stringify({ 
                      hasSource: !!vidData.source, 
                      hasPermalink: !!vidData.permalink_url,
                      hasEmbed: !!vidData.embed_html,
                      error: vidData.error?.message || null 
                    }));
                    videoUrl = vidData.source || vidData.permalink_url || null;
                    const videoThumbnails = vidData.thumbnails?.data || [];
                    const largestVideoThumbnail = [...videoThumbnails].sort(
                      (a: any, b: any) => Number(b.width || 0) * Number(b.height || 0) - Number(a.width || 0) * Number(a.height || 0)
                    )[0];
                    highResolutionPreview = largestVideoThumbnail?.uri || vidData.picture || highResolutionPreview;
                  } catch (ve) {
                    console.error(`[ad_creatives] Failed to fetch video source for ${videoId}:`, ve);
                  }
                }

                // If no video_id from creative, check if the ad itself has video
                if (!hasVideo && adData.creative.object_story_spec?.video_data) {
                  console.log(`[ad_creatives] Ad ${adId} has video_data but no video_id`);
                }

                if (!highResolutionPreview && adData.creative.effective_object_story_id) {
                  try {
                    const storyResp = await fetch(
                      `${GRAPH_API}/${adData.creative.effective_object_story_id}?fields=full_picture&access_token=${token}`
                    );
                    const storyData = await storyResp.json();
                    highResolutionPreview = storyData.full_picture || null;
                  } catch (storyError) {
                    console.error(`[ad_creatives] Failed to fetch story preview for ${adId}:`, storyError);
                  }
                }

                const imageHash = adData.creative.image_hash
                  || adData.creative.object_story_spec?.link_data?.image_hash
                  || adData.creative.object_story_spec?.photo_data?.image_hash
                  || adData.creative.asset_feed_spec?.images?.[0]?.hash
                  || null;
                if (!highResolutionPreview && imageHash) {
                  try {
                    const hashes = encodeURIComponent(JSON.stringify([imageHash]));
                    const imageResp = await fetch(
                      `${GRAPH_API}/act_${accountId}/adimages?hashes=${hashes}&fields=hash,url,url_128,width,height&access_token=${token}`
                    );
                    const imageData = await imageResp.json();
                    highResolutionPreview = imageData.data?.[0]?.url || imageData.data?.[0]?.url_128 || null;
                  } catch (imageError) {
                    console.error(`[ad_creatives] Failed to fetch original image for ${adId}:`, imageError);
                  }
                }

                creativeMap[adId] = {
                  thumbnail_url: adData.creative.thumbnail_url || null,
                  image_url: highResolutionPreview,
                  creative_type: hasVideo ? 'video' : 'static',
                  video_url: videoUrl,
                  video_embed_url: videoId ? `https://www.facebook.com/video/embed?video_id=${videoId}` : null,
                };
              }
            } catch (e) {
              console.error(`[ad_creatives] Failed to fetch creative for ad ${adId}:`, e);
            }
          });
          await Promise.all(batchPromises);
        }

        // Merge creative data into insights
        const enriched = insightsData.data.map((row: any) => ({
          ...row,
          thumbnail_url: creativeMap[row.ad_id]?.thumbnail_url || null,
          image_url: creativeMap[row.ad_id]?.image_url || null,
          creative_type: creativeMap[row.ad_id]?.creative_type || 'static',
          video_url: creativeMap[row.ad_id]?.video_url || null,
          video_embed_url: creativeMap[row.ad_id]?.video_embed_url || null,
        }));

        result = { data: enriched };
        break;
      }

      case "pixels": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) { result = { error: "account_id is required" }; break; }
        const resp = await fetch(
          `${GRAPH_API}/act_${accountId}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "audiences": {
        const accountId = url.searchParams.get("account_id");
        if (!accountId) { result = { error: "account_id is required" }; break; }
        const resp = await fetch(
          `${GRAPH_API}/act_${accountId}/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,description,time_created&limit=100&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      default: {
        // Handle POST actions
        if (req.method === "POST") {
          const body = await req.json();
          const action = body.action;

          if (action === "create_audience") {
            const { account_id, name, subtype, description } = body;
            const form = new URLSearchParams();
            form.append("name", name);
            form.append("subtype", subtype);
            if (description) form.append("description", description);
            form.append("access_token", token);
            const resp = await fetch(`${GRAPH_API}/act_${account_id}/customaudiences`, {
              method: "POST",
              body: form,
            });
            result = await resp.json();
          } else if (action === "create_campaign_full") {
            const {
              account_id, campaign_name, objective,
              adset_name, billing_event, optimization_goal,
              budget_type, budget_cents, start_time, end_time, targeting,
            } = body;

            // 1. Create campaign
            const campForm = new URLSearchParams();
            campForm.append("name", campaign_name);
            campForm.append("objective", objective);
            campForm.append("status", "PAUSED");
            campForm.append("special_ad_categories", "[]");
            campForm.append("access_token", token);
            const campResp = await fetch(`${GRAPH_API}/act_${account_id}/campaigns`, {
              method: "POST",
              body: campForm,
            });
            const campData = await campResp.json();
            if (campData.error) { result = campData; break; }

            // 2. Create adset
            const adsetForm = new URLSearchParams();
            adsetForm.append("name", adset_name);
            adsetForm.append("campaign_id", campData.id);
            adsetForm.append("billing_event", billing_event);
            adsetForm.append("optimization_goal", optimization_goal);
            adsetForm.append("status", "PAUSED");
            adsetForm.append("targeting", JSON.stringify(targeting));
            adsetForm.append("start_time", start_time);
            if (end_time) adsetForm.append("end_time", end_time);
            if (budget_type === "daily") {
              adsetForm.append("daily_budget", String(budget_cents));
            } else {
              adsetForm.append("lifetime_budget", String(budget_cents));
              if (!end_time) adsetForm.append("end_time", new Date(Date.now() + 30 * 86400000).toISOString());
            }
            adsetForm.append("access_token", token);
            const adsetResp = await fetch(`${GRAPH_API}/act_${account_id}/adsets`, {
              method: "POST",
              body: adsetForm,
            });
            const adsetData = await adsetResp.json();
            if (adsetData.error) { result = adsetData; break; }

            result = { campaign_id: campData.id, adset_id: adsetData.id };
          } else {
            result = { error: `Unknown POST action: ${action}` };
          }
        } else {
          result = { error: "Unknown action. Use: accounts, campaigns, insights, account_insights, ad_creatives, pixels, audiences" };
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Meta Ads API error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
