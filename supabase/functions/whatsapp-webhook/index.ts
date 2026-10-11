import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { encontrarSocio } from "../_shared/socios.ts";

// Sem valor padrão: cada sistema tem o seu, gravado no secret.
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";

// "Já fiz" do aviso de tarefa: a tarefas-notificar confere o telefone, marca a
// tarefa como finalizada e responde no chat.
async function concluirTarefaPeloBotao(phone: string, taskId: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${supabaseUrl}/functions/v1/tarefas-notificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ tipo: "concluir", task_id: taskId, phone }),
    });
    console.log("tarefa concluir:", r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error("concluirTarefaPeloBotao:", e);
  }
}

// Bot dos sócios (bot-socios): responde só a quem está em Parceiros. A chamada
// não é aguardada, porque a Meta espera o webhook responder rápido e a
// consulta (OpenAI + Zig + Meta Ads) pode levar vários segundos.
async function acionarBotDosSocios(
  supabase: any, phone: string, texto: string, nome: string | null,
  phoneNumberId: string | null = null, escolha: { id: string; title: string } | null = null,
) {
  try {
    const socio = await encontrarSocio(supabase, phone);
    if (!socio) return;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const chamada = fetch(`${supabaseUrl}/functions/v1/bot-socios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      // phone_number_id: responde pelo mesmo número que recebeu a mensagem.
      // escolha: id do botão/item de lista tocado, quando for o caso.
      body: JSON.stringify({ phone, message: texto, contact_name: nome, phone_number_id: phoneNumberId, escolha }),
    }).then(async (r) => console.log("bot-socios:", r.status, (await r.text()).slice(0, 200)))
      .catch((e) => console.error("bot-socios erro:", e));
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(chamada); else await chamada;
  } catch (e) {
    console.error("acionarBotDosSocios:", e);
  }
}

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

    // Só os sócios (cadastro de Parceiros) têm resposta automática.
    if (!fromMe && (messageType === 'text') && messageText) {
      await acionarBotDosSocios(supabase, phone, messageText, contactName);
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

    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
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
          } else if (msg.type === "interactive") {
            // Toque em botão ou item de lista: guarda o título e o id da opção.
            const escolha = msg.interactive?.button_reply ?? msg.interactive?.list_reply ?? null;
            record.message_text = escolha?.title ? String(escolha.title) : "[Opção]";
            record.message_type = "text";
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

          // Resposta automática só para os sócios (cadastro de Parceiros).
          // Qualquer outro número fica em silêncio: o chat é atendido pela equipe.
          if ((msg.type === "text" || msg.type === "interactive") && record.message_text) {
            const escolha = msg.type === "interactive" ? (msg.interactive?.button_reply ?? msg.interactive?.list_reply ?? null) : null;
            // Botão "Já fiz" do aviso de tarefa (template): marca a tarefa como feita.
            if (escolha?.id && String(escolha.id).startsWith("tarefa_feita:")) {
              await concluirTarefaPeloBotao(msg.from, String(escolha.id).slice("tarefa_feita:".length));
              continue;
            }
            await acionarBotDosSocios(
              supabase, msg.from, String(record.message_text), contact?.profile?.name || null,
              value.metadata?.phone_number_id ?? null,
              escolha?.id ? { id: String(escolha.id), title: String(escolha.title ?? "") } : null,
            );
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
