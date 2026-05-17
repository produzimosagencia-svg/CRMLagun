import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "triade_whatsapp_verify_2024";

// ── Evolution API (Baileys) handler ────────────────────────────────────────
async function handleEvolutionWebhook(body: any, supabase: any) {
  const event: string = body.event || '';
  const data = body.data;
  if (!data) return;

  // MESSAGES_UPSERT → new message received
  if (event === 'messages.upsert') {
    const key = data.key || {};
    const remoteJid: string = key.remoteJid || '';

    // Skip group messages and status broadcasts
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const fromMe: boolean = key.fromMe === true;
    const messageId: string = key.id || '';

    // Don't double-insert fromMe messages already saved by evolution-proxy send
    if (fromMe) {
      const { data: existing } = await supabase
        .from('whatsapp_messages').select('id').eq('wamid', messageId).maybeSingle();
      if (existing) return;
    }

    const msg = data.message || {};
    let messageText: string | null = null;
    let messageType = 'text';

    if (msg.conversation) {
      messageText = msg.conversation; messageType = 'text';
    } else if (msg.extendedTextMessage) {
      messageText = msg.extendedTextMessage?.text || null; messageType = 'text';
    } else if (msg.imageMessage) {
      messageText = msg.imageMessage?.caption || null; messageType = 'image';
    } else if (msg.videoMessage) {
      messageText = msg.videoMessage?.caption || null; messageType = 'video';
    } else if (msg.audioMessage || msg.pttMessage) {
      messageType = 'audio';
    } else if (msg.documentMessage) {
      messageText = msg.documentMessage?.fileName || null; messageType = 'document';
    } else if (msg.stickerMessage) {
      messageType = 'sticker';
    } else if (msg.reactionMessage) {
      messageText = msg.reactionMessage?.text || null; messageType = 'reaction';
    }

    const contactName = fromMe ? null : (data.pushName || null);
    const ts = data.messageTimestamp;
    const timestamp = ts ? new Date(Number(ts) * 1000).toISOString() : new Date().toISOString();

    const statusMap: Record<string, string> = {
      PENDING: 'sent', SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read',
    };
    const status = statusMap[data.status || ''] || (fromMe ? 'sent' : 'received');

    const { error } = await supabase.from('whatsapp_messages').insert({
      wamid: messageId, phone, contact_name: contactName,
      direction: fromMe ? 'outgoing' : 'incoming',
      message_type: messageType, message_text: messageText,
      media_url: null, timestamp, status, channel: 'whatsapp',
    });
    if (error && error.code !== '23505') console.error('Evo insert error:', error);

    // Trigger chatbot for incoming text messages
    if (!fromMe && (messageType === 'text') && messageText) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const { data: botSetting } = await supabase
          .from('whatsapp_bot_settings').select('bot_enabled').eq('phone', phone).maybeSingle();
        if (botSetting?.bot_enabled !== false) {
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-chatbot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
            body: JSON.stringify({ phone, message: messageText, contact_name: contactName, source: 'evolution' }),
          });
        }
      } catch (e) { console.error('Chatbot error:', e); }
    }
  }

  // MESSAGES_UPDATE → status change
  if (event === 'messages.update') {
    const updates = Array.isArray(data) ? data : [data];
    const statusMap: Record<string, string> = {
      DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read',
    };
    for (const upd of updates) {
      const newStatus = statusMap[upd?.update?.status || ''];
      if (newStatus && upd?.key?.id) {
        await supabase.from('whatsapp_messages').update({ status: newStatus }).eq('wamid', upd.key.id);
      }
    }
  }
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // GET = Meta webhook verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // POST = incoming message/status from Meta OR Evolution API
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body).slice(0, 300));

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // ── Evolution API format (has body.event) ────────────────────────
      if (body.event) {
        await handleEvolutionWebhook(body, supabase);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const metaToken = Deno.env.get("META_WHATSAPP_TOKEN");

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process incoming messages
      if (value.messages) {
        for (const msg of value.messages) {
          const contact = value.contacts?.find(
            (c: { wa_id: string }) => c.wa_id === msg.from
          );

          const record: Record<string, unknown> = {
            phone: msg.from,
            contact_name: contact?.profile?.name || null,
            direction: "incoming",
            message_type: msg.type || "text",
            wamid: msg.id,
            timestamp: msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
            status: "received",
            raw_payload: msg,
          };

          if (msg.type === "text") {
            record.message_text = msg.text?.body || "";
          } else if (msg.type === "image" || msg.type === "video" || msg.type === "audio" || msg.type === "document") {
            record.message_text = msg[msg.type]?.caption || `[${msg.type}]`;
            const mediaId = msg[msg.type]?.id;
            if (mediaId && metaToken) {
              try {
                const mediaResp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
                  headers: { Authorization: `Bearer ${metaToken}` },
                });
                const mediaData = await mediaResp.json();
                if (mediaData.url) {
                  record.media_url = mediaData.url;
                } else {
                  record.media_url = mediaId;
                }
              } catch (e) {
                console.error("Failed to fetch media URL:", e);
                record.media_url = mediaId;
              }
            } else {
              record.media_url = mediaId || null;
            }
          } else if (msg.type === "reaction") {
            record.message_text = `Reação: ${msg.reaction?.emoji || ""}`;
          } else if (msg.type === "sticker") {
            record.message_text = "[Figurinha]";
          } else {
            record.message_text = `[${msg.type}]`;
          }

          const { error } = await supabase
            .from("whatsapp_messages")
            .insert(record);

          if (error) console.error("Insert error:", error);

          // Check bot setting and trigger AI chatbot for text messages
          if (msg.type === "text" && record.message_text) {
            try {
              // Check if bot is enabled for this phone (default: enabled)
              const { data: botSetting } = await supabase
                .from("whatsapp_bot_settings")
                .select("bot_enabled")
                .eq("phone", msg.from)
                .maybeSingle();

              const botEnabled = botSetting?.bot_enabled !== false; // default true

              if (botEnabled) {
                const chatbotUrl = `${supabaseUrl}/functions/v1/whatsapp-chatbot`;
                const chatbotResp = await fetch(chatbotUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    phone: msg.from,
                    message: record.message_text,
                    contact_name: contact?.profile?.name || null,
                  }),
                });
                const chatbotResult = await chatbotResp.json();
                console.log("Chatbot reply:", chatbotResult.reply?.slice(0, 100));
              } else {
                console.log("Bot disabled for", msg.from);
              }
            } catch (botErr) {
              console.error("Chatbot trigger error:", botErr);
            }
          }
        }
      }

      // Process status updates (sent, delivered, read)
      if (value.statuses) {
        for (const status of value.statuses) {
          const { error } = await supabase
            .from("whatsapp_messages")
            .update({ status: status.status, raw_payload: status })
            .eq("wamid", status.id);

          if (error) {
            // Status might be for a message we sent - try to find by wamid
            console.log("Status update for wamid:", status.id, "->", status.status);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
