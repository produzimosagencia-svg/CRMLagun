import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";
const IG_GRAPH_API = "https://graph.instagram.com/v25.0";

// Map IG account IDs to their respective DM token env var names
const IG_DM_TOKEN_MAP: Record<string, string> = {
  "17841412165311222": "META_IG_DM_TOKEN",         // @triade.ent
  "17841464788107057": "META_IG_DM_TOKEN_MAESTRIA", // @maestria.rap
  "17841436376156784": "META_IG_DM_TOKEN_LAGUN",   // @lagunvix
};

function getDmToken(igId?: string | null): string {
  if (igId && IG_DM_TOKEN_MAP[igId]) {
    const token = Deno.env.get(IG_DM_TOKEN_MAP[igId]);
    if (token) return token.trim();
  }
  // Fallback to default token
  const fallback = Deno.env.get("META_IG_DM_TOKEN");
  if (!fallback) throw new Error("No DM token configured for this account");
  return fallback.trim();
}
// Helper: get Page Access Token for a given Instagram Business Account ID
async function getPageTokenForIgId(userToken: string, igId: string): Promise<string> {
  const resp = await fetch(
    `${GRAPH_API}/me/accounts?fields=id,instagram_business_account,access_token&access_token=${userToken}`
  );
  const data = await resp.json();
  if (!data.data) throw new Error("Failed to fetch pages");
  for (const page of data.data) {
    if (page.instagram_business_account?.id === igId) {
      return page.access_token; // This is the Page Access Token
    }
  }
  throw new Error(`No page found linked to Instagram account ${igId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
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

    const token = Deno.env.get("META_INSTAGRAM_TOKEN") ?? "";

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Actions that require META_INSTAGRAM_TOKEN
    const tokenRequiredActions = ["accounts", "insights", "media", "media_insights", "comments", "publish"];
    if (tokenRequiredActions.includes(action ?? "") && !token) {
      return new Response(JSON.stringify({ error: "META_INSTAGRAM_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;

    switch (action) {
      case "accounts": {
        const resp = await fetch(
          `${GRAPH_API}/me/accounts?fields=id,name,instagram_business_account{id,name,username,profile_picture_url,followers_count,media_count}&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "insights": {
        const igId = url.searchParams.get("ig_id");
        const period = url.searchParams.get("period") || "day";
        const metrics = url.searchParams.get("metrics") || "impressions,reach,profile_views";
        const resp = await fetch(
          `${GRAPH_API}/${igId}/insights?metric=${metrics}&period=${period}&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "media": {
        const igId = url.searchParams.get("ig_id");
        const limit = url.searchParams.get("limit") || "20";
        const resp = await fetch(
          `${GRAPH_API}/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=${limit}&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "media_insights": {
        const mediaId = url.searchParams.get("media_id");
        const resp = await fetch(
          `${GRAPH_API}/${mediaId}/insights?metric=impressions,reach,engagement,saved&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "comments": {
        const mediaId = url.searchParams.get("media_id");
        const resp = await fetch(
          `${GRAPH_API}/${mediaId}/comments?fields=id,text,username,timestamp,like_count&access_token=${token}`
        );
        result = await resp.json();
        break;
      }

      case "publish": {
        const body = await req.json();
        const igId = body.ig_id;
        
        const containerParams = new URLSearchParams({
          access_token: token,
        });

        if (body.media_type === "VIDEO") {
          containerParams.set("video_url", body.media_url);
          containerParams.set("media_type", "VIDEO");
          if (body.caption) containerParams.set("caption", body.caption);
        } else if (body.media_type === "CAROUSEL") {
          containerParams.set("media_type", "CAROUSEL");
          if (body.children) containerParams.set("children", body.children.join(","));
          if (body.caption) containerParams.set("caption", body.caption);
        } else {
          containerParams.set("image_url", body.media_url);
          if (body.caption) containerParams.set("caption", body.caption);
        }

        const containerResp = await fetch(
          `${GRAPH_API}/${igId}/media?${containerParams.toString()}`,
          { method: "POST" }
        );
        const container = await containerResp.json();

        if (container.error) {
          result = container;
          break;
        }

        const publishResp = await fetch(
          `${GRAPH_API}/${igId}/media_publish?creation_id=${container.id}&access_token=${token}`,
          { method: "POST" }
        );
        result = await publishResp.json();
        break;
      }

      // ======== Instagram DM actions (use graph.instagram.com + IGAA token) ========
      case "dm_conversations": {
        const igId = url.searchParams.get("ig_id");
        if (!igId) { result = { error: "ig_id is required" }; break; }
        const dmAccessToken = getDmToken(igId);
        const platform = url.searchParams.get("platform") || "instagram";
        const resp = await fetch(
          `${IG_GRAPH_API}/${igId}/conversations?fields=id,participants,updated_time,messages.limit(1){message,from,created_time}&platform=${platform}&access_token=${dmAccessToken}`
        );
        result = await resp.json();
        break;
      }

      case "dm_messages": {
        const conversationId = url.searchParams.get("conversation_id");
        if (!conversationId) { result = { error: "conversation_id is required" }; break; }
        const igIdForToken = url.searchParams.get("ig_id");
        const dmToken2 = getDmToken(igIdForToken);
        const limit = url.searchParams.get("limit") || "50";
        const resp = await fetch(
          `${IG_GRAPH_API}/${conversationId}?fields=messages.limit(${limit}){message,from,created_time,attachments{mime_type,name,size,image_data}}&access_token=${dmToken2}`
        );
        result = await resp.json();
        break;
      }

      case "dm_send": {
        const body = await req.json();
        const igId = body.ig_id;
        const recipientId = body.recipient_id;
        const messageText = body.message;
        if (!igId || !recipientId || !messageText) {
          result = { error: "ig_id, recipient_id, and message are required" }; break;
        }
        const dmToken3 = getDmToken(igId);
        const resp = await fetch(
          `${IG_GRAPH_API}/${igId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${dmToken3}`,
            },
            body: JSON.stringify({
              recipient: { id: recipientId },
              message: { text: messageText },
              messaging_type: "RESPONSE",
            }),
          }
        );
        result = await resp.json();

        // Persist to whatsapp_messages table with channel=instagram
        if (!result.error) {
          const serviceSupabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          await serviceSupabase.from("whatsapp_messages").insert({
            phone: recipientId,
            contact_name: body.contact_name || null,
            direction: "outgoing",
            message_type: "text",
            message_text: messageText,
            wamid: result.message_id || null,
            status: "sent",
            channel: "instagram",
            raw_payload: result,
          });
        }
        break;
      }

      case "dm_sync": {
        // Sync Instagram DM conversations into the whatsapp_messages table
        const body = await req.json();
        const igId = body.ig_id;
        const igUsername = body.ig_username;

        if (!igId) {
          result = { error: "ig_id is required" };
          break;
        }

        const dmToken4 = getDmToken(igId);

        const serviceSupabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Fetch conversations using Instagram Graph API (include attachments & story)
        const convResp = await fetch(
          `${IG_GRAPH_API}/${igId}/conversations?fields=id,participants,updated_time,messages.limit(20){message,from,created_time,attachments{mime_type,name,size,image_data},story,shares}&platform=instagram&access_token=${dmToken4}`
        );
        const convData = await convResp.json();

        if (convData.error) {
          result = convData;
          break;
        }

        let synced = 0;
        const conversations = convData.data || [];

        for (const conv of conversations) {
          const participants = conv.participants?.data || [];
          const otherParticipant = participants.find((p: any) => p.username !== igUsername) || participants[0];
          const contactName = otherParticipant?.username || otherParticipant?.name || null;
          const contactId = otherParticipant?.id || conv.id;

          const msgs = conv.messages?.data || [];
          for (const msg of msgs) {
            const isFromMe = msg.from?.username === igUsername || msg.from?.id === igId;
            
            // Check if already exists
            const { data: existing } = await serviceSupabase
              .from("whatsapp_messages")
              .select("id")
              .eq("wamid", msg.id)
              .maybeSingle();

            if (!existing) {
              // Detect message type from attachments/story/shares
              let msgType = "text";
              let msgText = msg.message || "";
              let mediaUrl: string | null = null;

              if (msg.story) {
                msgType = "story_mention";
                if (!msgText) msgText = "";
                mediaUrl = msg.story.url || null;
              } else if (msg.shares?.data?.length) {
                const share = msg.shares.data[0];
                msgType = share.template_url?.includes("/reel/") ? "ig_reel" : "media_share";
                mediaUrl = share.link || share.template_url || null;
                if (!msgText) msgText = share.name || "";
              } else if (msg.attachments?.data?.length) {
                const att = msg.attachments.data[0];
                const mime = att.mime_type || "";
                if (mime.startsWith("image/")) {
                  msgType = "image";
                  mediaUrl = att.image_data?.url || null;
                } else if (mime.startsWith("video/")) {
                  msgType = "video";
                  mediaUrl = att.image_data?.url || null;
                } else if (mime.startsWith("audio/")) {
                  msgType = "audio";
                  mediaUrl = att.image_data?.url || null;
                } else {
                  msgType = "attachment";
                }
              }

              await serviceSupabase.from("whatsapp_messages").insert({
                phone: contactId,
                contact_name: isFromMe ? null : (msg.from?.username || contactName),
                direction: isFromMe ? "outgoing" : "incoming",
                message_type: msgType,
                message_text: msgText,
                media_url: mediaUrl,
                wamid: msg.id,
                timestamp: msg.created_time || new Date().toISOString(),
                status: isFromMe ? "sent" : "received",
                channel: "instagram",
                raw_payload: msg,
              });
              synced++;
            }
          }
        }

        result = { ok: true, synced, conversations: conversations.length };
        break;
      }

      default:
        result = { error: "Unknown action. Use: accounts, insights, media, media_insights, comments, publish, dm_conversations, dm_messages, dm_send, dm_sync" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Instagram API error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
