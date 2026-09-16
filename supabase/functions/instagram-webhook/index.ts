import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN") ?? "lagun_ig_webhook_2026";
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") ?? "";

// Map IG account IDs → token secret names (same as instagram-api)
const IG_DM_TOKEN_MAP: Record<string, string> = {
  "17841412165311222": "META_IG_DM_TOKEN",           // @triade.ent    (EAA)
  "17841464788107057": "META_IG_DM_TOKEN_MAESTRIA",  // @maestria.rap  (EAA)
  "17841436376156784": "INSTAGRAM_USER_TOKEN_LAGUN", // @lagunvix      (IGAA)
};

// Map IG IDs → Facebook Page IDs
const IG_TO_PAGE_MAP: Record<string, string> = {
  "17841436376156784": "1041049812431226", // @lagunvix → Lagun page
};

async function getPageAccessToken(pageId: string, systemUserToken: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${systemUserToken}`
    );
    const data = await resp.json();
    return data.access_token ?? null;
  } catch { return null; }
}

const IG_USERNAME_MAP: Record<string, string> = {
  "17841412165311222": "triade.ent",
  "17841464788107057": "maestria.rap",
  "17841436376156784": "lagunvix",
};

function getTokenForAccount(recipientId: string): string {
  const secretName = IG_DM_TOKEN_MAP[recipientId];
  if (secretName) {
    const token = Deno.env.get(secretName);
    if (token) return token.trim();
  }
  // Fallback to default
  return (Deno.env.get("META_IG_DM_TOKEN") ?? "").trim();
}

const SYSTEM_PROMPT = `Você é o assistente virtual da Lagun, uma casa noturna exclusiva em Vitória (ES).
Responda sempre em português, de forma simpática, direta e com o tom sofisticado da marca.

Informações que você conhece:
- Lagun fica na Rua Manoel Gonçalves Carneiro, 65 — Praia do Canto, Vitória/ES
- Horário de funcionamento: sextas e sábados a partir das 23h
- Tem espaço para lounges privativos (até 15 pessoas) com serviço de mordomo
- Para ingressos: acesse o link enviado nas redes ou pergunte sobre o próximo evento
- Para reservar lounge/mesa: WhatsApp (27) 99778-9988
- Instagram: @lagunvix

Regras:
- Se perguntarem sobre ingressos, informe que há na bio do Instagram ou no link da bio
- Se perguntarem sobre preço de lounge/mesa, direcione para o WhatsApp
- Se for reclamação grave, informe que vai passar para a equipe humana
- Seja breve (máximo 3 linhas por resposta)
- Nunca invente preços ou datas sem ter certeza
- Se não souber algo, diga "não tenho essa informação no momento, mas pode chamar no WhatsApp (27) 99778-9988"`;

async function sendIGReply(recipientId: string, senderId: string, text: string, token: string): Promise<boolean> {
  const isIgaaToken = token.startsWith("IGAA");
  let res: Response;

  if (isIgaaToken) {
    // IGAA token → graph.instagram.com with Authorization header
    res = await fetch(
      `https://graph.instagram.com/v21.0/${recipientId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text },
          messaging_type: "RESPONSE",
        }),
      }
    );
  } else {
    // EAA token → graph.facebook.com with Page Token
    const pageId = IG_TO_PAGE_MAP[recipientId];
    const pageToken = pageId ? await getPageAccessToken(pageId, token) : null;
    const apiId = pageId ?? recipientId;
    const apiToken = pageToken ?? token;
    res = await fetch(
      `https://graph.facebook.com/v21.0/${apiId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text },
          messaging_type: "RESPONSE",
          access_token: apiToken,
        }),
      }
    );
  }
  const json = await res.json();
  if (!res.ok) {
    console.error("IG send error:", JSON.stringify(json));
    return false;
  }
  return true;
}

async function generateReply(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-6),
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "Oi! Para mais informações, fala com a gente no WhatsApp (27) 99778-9988 😊";
}

async function getIGUserInfo(
  senderId: string,
  recipientId: string,
  token: string
): Promise<{ name: string; username: string } | null> {
  try {
    // Use graph.facebook.com — System User tokens (EAA...) work here
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${recipientId}/conversations?platform=instagram&user_id=${senderId}&fields=participants&access_token=${token}`
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("getIGUserInfo error:", err);
      return null;
    }
    const json = await res.json();
    const participants: any[] = json.data?.[0]?.participants?.data ?? [];
    // Find participant that is NOT our account
    const sender = participants.find((p: any) => p.id !== recipientId && p.username !== 'lagunvix');
    if (sender) {
      return {
        name: sender.name ?? sender.username ?? senderId,
        username: sender.username ?? sender.name ?? senderId,
      };
    }
    return null;
  } catch (e) {
    console.error("getIGUserInfo exception:", e);
    return null;
  }
}

// ============================================================================
// Motor de automações (estilo ManyChat) — portado do BoomRAP para o @lagunvix.
// Comentário/DM/story com palavra-chave → resposta pública + DM privada com
// botão → (ao tocar) DM com link rastreável + lembrete. Envio real fica com o
// ig-queue-worker (fila com trava atômica); aqui só casamos e enfileiramos.
// ============================================================================
const LAGUN_IG_ID = "17841436376156784";
const IG_V = "https://graph.instagram.com/v25.0";
const QUICK_REPLY_PAYLOAD = "IG_AUTO_GET_LINK";
const CHECK_FOLLOW_PAYLOAD = "IG_AUTO_CHECK_FOLLOW";

interface Automation {
  id: string; active: boolean; trigger_comment: boolean; trigger_story: boolean; trigger_dm: boolean;
  keywords: string[]; match_type: "contains" | "exact" | "any"; media_id: string | null;
  public_replies: string[]; welcome_message: string | null; quick_reply_text: string | null;
  link_message: string | null; link_button_label: string | null; link_url: string | null;
  reminder_message: string | null; reminder_delay_minutes: number;
  require_follow?: boolean; follow_prompt_message?: string | null; follow_prompt_button_label?: string | null; track_links?: boolean;
}

// Token do @lagunvix: ig_config (IGAA renovado pelo cron) → secret antigo → mapa.
async function resolveToken(supabase: any, recipientId: string): Promise<string> {
  if (recipientId === LAGUN_IG_ID) {
    const { data: cfg } = await supabase.from("ig_config").select("access_token, token_expires_at").maybeSingle();
    if (cfg?.access_token && (!cfg.token_expires_at || new Date(cfg.token_expires_at).getTime() > Date.now())) {
      return String(cfg.access_token).trim();
    }
  }
  return getTokenForAccount(recipientId);
}

// Nome, @ e foto de quem mandou a DM (só funciona com token IGAA no graph.instagram.com).
async function fetchIgProfile(igsid: string, token: string): Promise<{ username: string; name: string; profile_pic: string } | null> {
  if (!token.startsWith("IGAA")) return null;
  try {
    const r = await fetch(`${IG_V}/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (d?.error || !d?.username) return null;
    return { username: d.username, name: d.name ?? d.username, profile_pic: d.profile_pic ?? "" };
  } catch { return null; }
}

async function checkFollows(igsid: string, token: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${IG_V}/${igsid}?fields=is_user_follow_business&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    return typeof d?.is_user_follow_business === "boolean" ? d.is_user_follow_business : null;
  } catch { return null; }
}

function matches(text: string, kws: string[], type: Automation["match_type"]): boolean {
  const t = text.trim().toLowerCase();
  if (type === "any") return true;
  const list = (kws ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return false;
  if (type === "exact") return list.includes(t);
  return list.some((k) => t.includes(k));
}
const pickRandom = (arr: string[]) => (arr?.length ? arr[Math.floor(Math.random() * arr.length)] : null);
const isOnlyEmoji = (text: string) => { const c = text.replace(/\s/g, ""); return c.length > 0 && c.length <= 24 && /^[\p{Extended_Pictographic}️‍]+$/u.test(c); };
const mediaUrlOf = (msg: any) => msg?.story_mention?.url ?? msg?.reply_to?.story?.url ?? msg?.story?.url
  ?? msg?.attachments?.[0]?.payload?.url ?? msg?.attachments?.[0]?.payload?.image_url ?? msg?.attachments?.[0]?.payload?.video_url ?? null;

function kickWorker() {
  try {
    const p = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ig-queue-worker`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "webhook" }),
    }).catch(() => {});
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
  } catch { /* ignore */ }
}

async function upsertContact(supabase: any, igsid: string, username: string | undefined | null, automationId: string) {
  await supabase.from("ig_contacts").upsert({ igsid, username: username ?? null, last_automation: automationId, updated_at: new Date().toISOString() }, { onConflict: "igsid" });
}

// Link curto por pessoa (lagunvitoria.com.br/l/xxxx) — registra quem clicou.
async function trackedUrl(supabase: any, auto: Automation, igsid: string): Promise<string> {
  let url = auto.link_url as string;
  if (auto.track_links !== false) {
    const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const { error } = await supabase.from("ig_links").insert({ slug, automation_id: auto.id, igsid, target_url: auto.link_url });
    if (!error) url = `${Deno.env.get("SHORT_LINK_BASE") || "https://www.lagunvitoria.com.br/l"}/${slug}`;
  }
  return url;
}

async function enqueueFollowups(supabase: any, auto: Automation, igsid: string) {
  const now = Date.now();
  if (auto.link_url && auto.link_url !== "https://") {
    const url = await trackedUrl(supabase, auto, igsid);
    await supabase.from("ig_queue").insert({ automation_id: auto.id, igsid, send_type: "dm", requires_24h_window: true,
      scheduled_at: new Date(now).toISOString(), payload: { type: "link", text: auto.link_message, button_label: auto.link_button_label, url } });
  }
  if (auto.reminder_message) {
    await supabase.from("ig_queue").insert({ automation_id: auto.id, igsid, send_type: "dm", requires_24h_window: true,
      scheduled_at: new Date(now + (auto.reminder_delay_minutes ?? 60) * 60_000).toISOString(), payload: { type: "reminder", text: auto.reminder_message } });
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Verificação do webhook (GET) ─────────────────────────────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any;
  try { body = await req.json(); } catch { return new Response("ok", { status: 200 }); }

  const { data: autosData } = await supabase.from("ig_automations").select("*").eq("active", true);
  const automations = (autosData ?? []) as Automation[];
  let enqueued = false;

  for (const entry of body?.entry ?? []) {
    // ── Comentários (entry.changes, field=comments) ─────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      const commentId = v.id as string | undefined;
      const text = String(v.text ?? "");
      const fromId = v.from?.id as string | undefined;
      const fromUser = v.from?.username as string | undefined;
      const mediaId = v.media?.id as string | undefined;
      if (!commentId || !fromId) continue;
      if (fromId === LAGUN_IG_ID || fromId === String(entry.id)) continue; // comentário da própria conta

      const auto = automations.find((a) => a.trigger_comment && (!a.media_id || a.media_id === mediaId) && matches(text, a.keywords, a.match_type));
      await supabase.from("ig_events").insert({ event_type: "comment", igsid: fromId, automation_id: auto?.id ?? null, raw: change });
      if (!auto) continue;

      await upsertContact(supabase, fromId, fromUser, auto.id);
      const pub = pickRandom(auto.public_replies);
      if (pub) await supabase.from("ig_queue").insert({ automation_id: auto.id, comment_id: commentId, send_type: "public_reply", payload: { text: pub } });

      // Resposta privada ao comentário fura a janela de 24h (1x por comentário). A Meta não
      // aceita botão de link aqui, então vai texto + botão de resposta rápida; ao tocar,
      // o fluxo de quick reply abaixo manda a DM com o botão de link de verdade.
      if (auto.welcome_message) {
        await supabase.from("ig_queue").insert({ automation_id: auto.id, comment_id: commentId, igsid: fromId, send_type: "private_reply",
          payload: { type: "welcome", text: auto.welcome_message, quick_reply_text: auto.quick_reply_text, quick_reply_payload: QUICK_REPLY_PAYLOAD } });
      } else if (auto.link_url && auto.link_url !== "https://") {
        await supabase.from("ig_queue").insert({ automation_id: auto.id, comment_id: commentId, igsid: fromId, send_type: "private_reply",
          payload: { type: "welcome", text: auto.link_message || "Aqui está o link que você pediu 👇", quick_reply_text: (auto.link_button_label || "Abrir link").slice(0, 20), quick_reply_payload: QUICK_REPLY_PAYLOAD } });
      }
      enqueued = true;
    }

    // ── Mensagens (entry.messaging): DM, story, botão, eco do que a equipe mandou ──
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id as string | undefined;
      const recipientId = event.recipient?.id as string | undefined;
      const msg = event.message;
      if (!senderId || !recipientId || !msg) continue;
      const token = await resolveToken(supabase, msg.is_echo ? senderId : recipientId);
      const igUsername = IG_USERNAME_MAP[msg.is_echo ? senderId : recipientId] ?? "instagram";
      const msgId = msg.mid ?? null;
      const ts = event.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString();

      // Eco = mensagem que a própria conta enviou (pelo app do Instagram, por exemplo).
      // Espelha no Chat e desliga a IA para esse contato: um humano assumiu.
      if (msg.is_echo) {
        const contactId = recipientId;
        const echoText = String(msg.text ?? "").trim();
        if (msgId) {
          const { data: dup } = await supabase.from("whatsapp_messages").select("id").eq("wamid", msgId).eq("channel", "instagram").maybeSingle();
          if (dup) continue;
        }
        const since = new Date(Date.now() - 5 * 60_000).toISOString();
        let q = supabase.from("whatsapp_messages").select("id").eq("phone", contactId).eq("channel", "instagram").eq("direction", "outgoing").gte("timestamp", since).limit(1);
        if (echoText) q = q.eq("message_text", echoText);
        const { data: recent } = await q;
        if (!recent?.length) {
          await supabase.from("whatsapp_bot_settings").upsert({ phone: `ig:${contactId}`, bot_enabled: false, updated_at: new Date().toISOString() }, { onConflict: "phone" });
          await supabase.from("whatsapp_messages").insert({ phone: contactId, contact_name: contactId, direction: "outgoing",
            message_type: echoText ? "text" : (msg.attachments?.[0]?.type ?? "attachment"), message_text: echoText || null,
            media_url: mediaUrlOf(msg), timestamp: ts, status: "sent", wamid: msgId, channel: "instagram" });
        }
        continue;
      }
      if (senderId === recipientId) continue;

      // Dedup
      if (msgId) {
        const { data: existing } = await supabase.from("whatsapp_messages").select("id").eq("wamid", msgId).eq("channel", "instagram").maybeSingle();
        if (existing) continue;
      }

      const isStoryMention = Boolean(msg.story_mention || msg.attachments?.some((a: any) => a?.type === "story_mention"));
      const isStoryReply = Boolean(msg.reply_to?.story);
      const isStoryReaction = isStoryReply && isOnlyEmoji(msg.text ?? "");
      const msgText = String(msg.text ?? "");

      // Perfil do remetente (nome, @, foto) — cai no ID se o token não permitir.
      const profile = await fetchIgProfile(senderId, token);
      const contactName = profile?.name ?? profile?.username ?? event.sender?.username ?? senderId;
      await supabase.from("whatsapp_messages").insert({
        phone: senderId, contact_name: contactName,
        contact_username: profile?.username ?? event.sender?.username ?? null,
        contact_avatar: profile?.profile_pic || null,
        direction: "incoming",
        message_type: isStoryMention ? "story_mention" : isStoryReaction ? "story_reaction" : isStoryReply ? "story_reply" : (msgText ? "text" : (msg.attachments?.[0]?.type ?? "attachment")),
        message_text: msgText || null, media_url: mediaUrlOf(msg), timestamp: ts, status: null, wamid: msgId, channel: "instagram", raw_payload: event,
      });
      await supabase.from("ig_events").insert({ event_type: isStoryReply || isStoryMention ? "story_reply" : "message", igsid: senderId, raw: event });
      console.log(`IG msg de ${contactName} (${senderId}) → @${igUsername}: "${msgText.slice(0, 60)}"`);

      // (a) Tocou no botão de resposta rápida → abre janela de 24h → follow-ups (link + lembrete)
      const qr = msg.quick_reply?.payload;
      if (qr === QUICK_REPLY_PAYLOAD || qr === CHECK_FOLLOW_PAYLOAD) {
        const { data: contact } = await supabase.from("ig_contacts").select("last_automation").eq("igsid", senderId).maybeSingle();
        await supabase.from("ig_contacts").update({ last_reply_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("igsid", senderId);
        const auto = automations.find((a) => a.id === contact?.last_automation);
        if (auto) {
          const gate = auto.require_follow ? (await checkFollows(senderId, token)) === false : false;
          if (gate) {
            await supabase.from("ig_queue").insert({ automation_id: auto.id, igsid: senderId, send_type: "dm", requires_24h_window: true,
              payload: { type: "follow_prompt", text: auto.follow_prompt_message || "Para receber o link, segue a gente primeiro 🙏 Depois toca no botão abaixo.",
                quick_reply_text: auto.follow_prompt_button_label || "Já sigo ✅", quick_reply_payload: CHECK_FOLLOW_PAYLOAD } });
          } else {
            await enqueueFollowups(supabase, auto, senderId);
          }
          enqueued = true;
        }
        continue;
      }

      // (b) Automação por palavra-chave em DM / resposta a story (conversa já aberta)
      const kwAuto = automations.find((a) => ((isStoryReply || isStoryMention) ? a.trigger_story : a.trigger_dm) && matches(msgText, a.keywords, a.match_type));
      if (kwAuto) {
        await upsertContact(supabase, senderId, profile?.username ?? event.sender?.username, kwAuto.id);
        await supabase.from("ig_contacts").update({ last_reply_at: new Date().toISOString() }).eq("igsid", senderId);
        if (kwAuto.welcome_message) {
          await supabase.from("ig_queue").insert({ automation_id: kwAuto.id, igsid: senderId, send_type: "dm",
            payload: { type: "welcome", text: kwAuto.welcome_message, quick_reply_text: kwAuto.quick_reply_text, quick_reply_payload: QUICK_REPLY_PAYLOAD } });
        } else {
          await enqueueFollowups(supabase, kwAuto, senderId);
        }
        enqueued = true;
        continue; // automação tratou; não passa para a IA
      }

      // (c) Atendimento por IA (liga/desliga no Chat) — só texto, e só se nenhum humano assumiu
      if (!msgText.trim() || !OPENAI_KEY) continue;
      const [{ data: globalSetting }, { data: contactSetting }] = await Promise.all([
        supabase.from("whatsapp_bot_settings").select("bot_enabled").eq("phone", "ig_auto_reply_global").maybeSingle(),
        supabase.from("whatsapp_bot_settings").select("bot_enabled").eq("phone", `ig:${senderId}`).maybeSingle(),
      ]);
      if (globalSetting?.bot_enabled !== true || contactSetting?.bot_enabled === false) continue;

      const { data: historyRows } = await supabase.from("whatsapp_messages").select("direction, message_text")
        .eq("phone", senderId).eq("channel", "instagram").order("timestamp", { ascending: false }).limit(6);
      const history = (historyRows ?? []).reverse().filter((r: any) => r.message_text && r.message_text !== msgText)
        .map((r: any) => ({ role: r.direction === "incoming" ? "user" : "assistant", content: r.message_text }));
      try {
        const reply = isStoryReaction ? "❤️" : await generateReply(msgText, history);
        if (reply && await sendIGReply(recipientId, senderId, reply, token)) {
          await supabase.from("whatsapp_messages").insert({ phone: senderId, contact_name: contactName, contact_username: profile?.username ?? null,
            contact_avatar: profile?.profile_pic || null, direction: "outgoing", message_type: "text", message_text: reply,
            timestamp: new Date().toISOString(), status: "sent", channel: "instagram" });
        }
      } catch (e) { console.error("IA:", e); }
    }
  }

  if (enqueued) kickWorker();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
